import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  MoreHorizontal,
  Pencil,
  Archive,
  ArchiveRestore,
  Users,
  X,
  Upload,
  Zap,
  Merge,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { type Contact } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import AddContactDialog from "@/components/AddContactDialog";
import EditContactDialog from "@/components/EditContactDialog";
import { ImportContactsDialog } from "@/components/contacts/ImportContactsDialog";
import QuickReviewPanel from "@/components/contacts/QuickReviewPanel";
import { MergeContactDialog } from "@/components/contacts/MergeContactDialog";

export default function Contacts() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedContactType, setSelectedContactType] = useState<"trade" | "supplier" | "client" | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isQuickReviewOpen, setIsQuickReviewOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | undefined>();
  const [showArchivedContacts, setShowArchivedContacts] = useState(false);

  const { data: contacts = [], isLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const archiveMutation = useMutation({
    mutationFn: (contactId: string) =>
      apiRequest(`/api/contacts/${contactId}/archive`, "POST"),
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
      apiRequest(`/api/contacts/${contactId}/restore`, "POST"),
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

  const { activeContacts, archivedContacts } = useMemo(() => {
    const matchesFilters = (contact: Contact) => {
      if (selectedTab !== "all" && contact.contactType !== selectedTab) {
        return false;
      }

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
    };

    const active: Contact[] = [];
    const archived: Contact[] = [];
    
    contacts.forEach((contact) => {
      if (matchesFilters(contact)) {
        if (contact.isArchived) {
          archived.push(contact);
        } else {
          active.push(contact);
        }
      }
    });

    return { activeContacts: active, archivedContacts: archived };
  }, [contacts, selectedTab, searchTerm]);

  const filteredContacts = activeContacts;

  const tabCounts = useMemo(() => {
    return {
      all: contacts.length,
      team: contacts.filter((c) => c.contactType === "team").length,
      trade: contacts.filter((c) => c.contactType === "trade").length,
      supplier: contacts.filter((c) => c.contactType === "supplier").length,
      client: contacts.filter((c) => c.contactType === "client").length,
    };
  }, [contacts]);

  const unreviewedCount = useMemo(() => {
    return contacts.filter(c => !c.isArchived && c.reviewStatus !== "reviewed").length;
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
    if (contact.name) {
      const parts = contact.name.trim().split(" ");
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return contact.name.substring(0, 2).toUpperCase();
    }
    return "??";
  };

  const handleAddContact = (type?: "trade" | "supplier" | "client") => {
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

  const tabs = [
    { value: "all", label: "All", count: tabCounts.all },
    { value: "team", label: "Team", count: tabCounts.team },
    { value: "trade", label: "Trades", count: tabCounts.trade },
    { value: "supplier", label: "Suppliers", count: tabCounts.supplier },
    { value: "client", label: "Clients", count: tabCounts.client },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Row 1 - Page Title + Action Button (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-3 gap-4 flex-shrink-0 border-b">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-page-title">
            Contacts
          </h2>
          <Badge variant="secondary" className="text-xs" data-testid="text-contact-count">
            {filteredContacts.length} {filteredContacts.length === 1 ? 'contact' : 'contacts'}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          {unreviewedCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              onClick={() => setIsQuickReviewOpen(true)}
              data-testid="button-quick-review"
            >
              <Zap className="w-3 h-3 mr-0.5" />
              Quick Review
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-400">
                {unreviewedCount}
              </Badge>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => setIsImportDialogOpen(true)}
            data-testid="button-import-contacts"
          >
            <Upload className="w-3 h-3 mr-0.5" />
            Import
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-[#bba7db] hover:bg-[#bba7db]/90 text-white border-[#bba7db]/20"
            onClick={() => handleAddContact(selectedTab === "all" ? undefined : selectedTab as any)}
            data-testid="button-add-contact"
          >
            <Plus className="w-3 h-3 mr-0.5" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Row 2 - Search and Tabs (36px) */}
      <div className="h-9 bg-background flex items-center px-3 gap-4 flex-shrink-0 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search contacts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 pl-7 pr-7 text-xs"
            data-testid="input-search-contacts"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchTerm("")}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
              data-testid="button-clear-search"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1" data-testid="tabs-contact-type">
          {tabs.map((tab) => (
            <Button
              key={tab.value}
              variant={selectedTab === tab.value ? "secondary" : "ghost"}
              size="sm"
              className={`h-6 px-2 text-xs ${
                selectedTab === tab.value 
                  ? "bg-[#bba7db]/20 text-[#bba7db] border border-[#bba7db]/30" 
                  : ""
              }`}
              onClick={() => setSelectedTab(tab.value)}
              data-testid={`tab-${tab.value}`}
            >
              {tab.label}
              <Badge 
                variant="secondary" 
                className={`ml-1.5 text-[10px] h-4 min-w-4 px-1 ${
                  selectedTab === tab.value ? "bg-[#bba7db]/30" : ""
                }`}
              >
                {tab.count}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading contacts...</div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {searchTerm ? "No contacts match your search" : "No contacts yet"}
            </p>
            <p className="text-sm text-muted-foreground">
              {searchTerm ? "Try a different search term" : "Add team members, suppliers, and clients"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10"></TableHead>
                <TableHead className="text-xs font-medium">Business Name</TableHead>
                <TableHead className="text-xs font-medium">Key Person</TableHead>
                <TableHead className="text-xs font-medium">Role</TableHead>
                <TableHead className="text-xs font-medium">Phone</TableHead>
                <TableHead className="text-xs font-medium">Email</TableHead>
                <TableHead className="text-xs font-medium">Type</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.map((contact) => (
                <TableRow 
                  key={contact.id} 
                  className="hover-elevate cursor-pointer"
                  data-testid={`row-contact-${contact.id}`}
                  onDoubleClick={() => handleEdit(contact)}
                >
                  <TableCell className="py-2">
                    <Avatar 
                      className="h-7 w-7" 
                      style={{ backgroundColor: contact.avatarUrl ? undefined : (contact.avatarColor || "#bba7db") }}
                    >
                      {contact.avatarUrl && (
                        <AvatarImage src={contact.avatarUrl} alt={contact.name || "Avatar"} />
                      )}
                      <AvatarFallback className="text-white text-xs" style={{ backgroundColor: "transparent" }}>
                        {getInitials(contact)}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="text-sm font-medium py-2">
                    {contact.name || contact.company || "-"}
                    {contact.isArchived && (
                      <Badge variant="outline" className="ml-2 text-xs">Archived</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm py-2">
                    {contact.firstName || contact.lastName 
                      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ") 
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2">
                    {contact.contactType === "team" 
                      ? contact.role 
                      : contact.position || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-sm py-2">
                    {contact.phone ? (
                      <a href={`tel:${contact.phone}`} className="text-[#bba7db] hover:underline">
                        {contact.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm py-2">
                    {contact.email ? (
                      <a href={`mailto:${contact.email}`} className="text-[#bba7db] hover:underline">
                        {contact.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge 
                      variant="secondary" 
                      className={`text-xs capitalize ${
                        contact.contactType === "team" 
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          : contact.contactType === "trade"
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                          : contact.contactType === "supplier"
                          ? "bg-[#bba7db]/20 text-[#bba7db]"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      }`}
                    >
                      {contact.contactType}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="h-7 w-7"
                          data-testid={`button-actions-${contact.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEdit(contact)}
                          data-testid={`menu-edit-${contact.id}`}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!contact.isArchived && (
                          <DropdownMenuItem
                            onClick={() => {
                              setMergeSourceId(contact.id);
                              setIsMergeDialogOpen(true);
                            }}
                            data-testid={`menu-merge-${contact.id}`}
                          >
                            <Merge className="h-4 w-4 mr-2" />
                            Merge Into...
                          </DropdownMenuItem>
                        )}
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
              ))}
            </TableBody>
          </Table>
        )}

        {/* Archived Contacts Section - Hidden by default */}
        {archivedContacts.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchivedContacts(!showArchivedContacts)}
              className="text-muted-foreground"
              data-testid="button-toggle-archived"
            >
              {showArchivedContacts ? (
                <ChevronDown className="h-4 w-4 mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              <Archive className="h-4 w-4 mr-2" />
              Archived Contacts ({archivedContacts.length})
            </Button>
            
            {showArchivedContacts && (
              <div className="mt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivedContacts.map((contact) => (
                      <TableRow key={contact.id} className="opacity-60">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar 
                              className="h-8 w-8"
                              style={{ backgroundColor: contact.avatarUrl ? undefined : (contact.avatarColor || "#bba7db") }}
                            >
                              {contact.avatarUrl && (
                                <AvatarImage src={contact.avatarUrl} alt={contact.name || "Avatar"} />
                              )}
                              <AvatarFallback className="text-xs text-white" style={{ backgroundColor: "transparent" }}>
                                {getInitials(contact)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-medium text-sm">
                                {contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unnamed'}
                              </div>
                              {contact.company && contact.name !== contact.company && (
                                <div className="text-xs text-muted-foreground">{contact.company}</div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {contact.contactType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{contact.email || '-'}</TableCell>
                        <TableCell className="text-sm">{contact.phone || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRestore(contact.id)}
                            title="Restore contact"
                            data-testid={`button-restore-${contact.id}`}
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>

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

      <ImportContactsDialog
        open={isImportDialogOpen}
        onOpenChange={setIsImportDialogOpen}
      />

      <QuickReviewPanel
        open={isQuickReviewOpen}
        onClose={() => setIsQuickReviewOpen(false)}
        contacts={contacts}
        contactTypeFilter={selectedTab === "all" ? null : selectedTab as "team" | "trade" | "supplier" | "client"}
      />

      <MergeContactDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        contacts={contacts}
        preselectedSourceId={mergeSourceId}
      />
    </div>
  );
}
