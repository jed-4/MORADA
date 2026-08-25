import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable, DataTableColumnPicker, type DataTableColumnMeta } from "@/components/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronRight,
  Filter,
  Settings2,
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";

type ContactType = "team" | "trade" | "supplier" | "client";

// One place for each type's label and badge tint. Team, trade and supplier
// borrow the estimate line-type palette (Labour, Subcontractor, Material) so a
// trade reads the same colour here as its lines do on an estimate. Client takes
// coral, which leaves lavender to mean "selected" and nothing else — the old
// supplier badge was bg-primary/20, the same tint as the active type chip.
const CONTACT_TYPES: { value: ContactType; label: string; plural: string; badge: string }[] = [
  { value: "team", label: "Team", plural: "Team", badge: "bg-status-success-bg text-status-success" },
  { value: "trade", label: "Trade", plural: "Trades", badge: "bg-amber-light text-amber" },
  { value: "supplier", label: "Supplier", plural: "Suppliers", badge: "bg-teal/15 text-teal" },
  { value: "client", label: "Client", plural: "Clients", badge: "bg-coral-light text-coral" },
];

const TYPE_META = Object.fromEntries(CONTACT_TYPES.map((t) => [t.value, t])) as Record<ContactType, typeof CONTACT_TYPES[number]>;

const TABLE_STORAGE_KEY = "contacts";

const PICKER_COLUMNS = [
  { id: "name", label: "Business Name" },
  { id: "keyPerson", label: "Key Person" },
  { id: "role", label: "Role" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "type", label: "Type" },
];

export default function Contacts() {
  const { toast } = useToast();
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedContactType, setSelectedContactType] = useState<ContactType | undefined>();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [contactToEdit, setContactToEdit] = useState<Contact | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<{ id: string; name: string } | null>(null);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isQuickReviewOpen, setIsQuickReviewOpen] = useState(false);
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | undefined>();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const bulkActionMutation = useMutation({
    mutationFn: (data: { ids: string[]; action: string; contactType?: string }) =>
      apiRequest("/api/contacts/bulk-action", "POST", data),
    onSuccess: (result: { success: number; errors: string[] }, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setSelectedIds(new Set());
      const actionLabels: Record<string, string> = {
        archive: "archived",
        restore: "restored",
        changeType: "updated",
        delete: "deleted",
      };
      toast({
        title: `${result.success} contact${result.success !== 1 ? "s" : ""} ${actionLabels[variables.action] || "updated"}`,
        description: result.errors.length > 0 ? `${result.errors.length} failed` : undefined,
      });
    },
    onError: () => {
      toast({
        title: "Bulk action failed",
        variant: "destructive",
      });
    },
  });

  // Everything except the type chip — so a chip's count is exactly what you get
  // when you click it. Archived contacts are rows in this same list behind the
  // filter toggle, rather than a second hand-rolled table below the first.
  const searchedContacts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (!showArchived && contact.isArchived) return false;
      if (!search) return true;
      return (
        contact.name?.toLowerCase().includes(search) ||
        contact.firstName?.toLowerCase().includes(search) ||
        contact.lastName?.toLowerCase().includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.company?.toLowerCase().includes(search) ||
        contact.phone?.toLowerCase().includes(search) ||
        contact.mobile?.toLowerCase().includes(search)
      );
    });
  }, [contacts, searchTerm, showArchived]);

  const filteredContacts = useMemo(
    () => (selectedTab === "all"
      ? searchedContacts
      : searchedContacts.filter((c) => c.contactType === selectedTab)),
    [searchedContacts, selectedTab],
  );

  const archivedCount = useMemo(() => contacts.filter((c) => c.isArchived).length, [contacts]);

  // Counts follow the search and the archived toggle. They used to count every
  // contact unconditionally, so "All 86" could sit above 74 rows.
  const tabCounts = useMemo(() => ({
    all: searchedContacts.length,
    team: searchedContacts.filter((c) => c.contactType === "team").length,
    trade: searchedContacts.filter((c) => c.contactType === "trade").length,
    supplier: searchedContacts.filter((c) => c.contactType === "supplier").length,
    client: searchedContacts.filter((c) => c.contactType === "client").length,
  }), [searchedContacts]);

  const activeFilterCount = showArchived ? 1 : 0;

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

  const handleAddContact = (type?: ContactType) => {
    setSelectedContactType(type);
    setIsAddDialogOpen(true);
  };

  const handleArchive = (contact: Contact) => {
    setConfirmArchive({ id: contact.id, name: contact.name || contact.company || "Unnamed" });
  };

  const handleRestore = (contactId: string) => {
    restoreMutation.mutate(contactId);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const handleBulkArchive = () => {
    bulkActionMutation.mutate({ ids: Array.from(selectedIds), action: "archive" });
  };

  const handleBulkRestore = () => {
    bulkActionMutation.mutate({ ids: Array.from(selectedIds), action: "restore" });
  };

  const handleBulkChangeType = (type: string) => {
    bulkActionMutation.mutate({ ids: Array.from(selectedIds), action: "changeType", contactType: type });
  };

  const handleEdit = (contact: Contact) => {
    setContactToEdit(contact);
    setIsEditDialogOpen(true);
  };

  const tabs = [
    { value: "all", label: "All", count: tabCounts.all },
    ...CONTACT_TYPES.map((t) => ({ value: t.value, label: t.plural, count: tabCounts[t.value] })),
  ];

  const contactColumns = useMemo<ColumnDef<Contact, unknown>[]>(() => {
    return [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={filteredContacts.length > 0 && selectedIds.size === filteredContacts.length}
            onCheckedChange={toggleSelectAll}
            data-testid="checkbox-select-all"
          />
        ),
        cell: ({ row }) => (
          <span onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.has(row.original.id)}
              onCheckedChange={() => toggleSelection(row.original.id)}
              data-testid={`checkbox-contact-${row.original.id}`}
            />
          </span>
        ),
        enableSorting: false,
        size: 32,
        meta: { defaultWidth: 32, align: "center", pinned: true, headerLabel: "Select" } satisfies DataTableColumnMeta,
      },
      {
        id: "name",
        header: "Business Name",
        accessorFn: (c) => c.name || c.company || "",
        cell: ({ row }) => {
          const contact = row.original;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <Avatar
                className="h-6 w-6 flex-shrink-0"
                style={{ backgroundColor: contact.avatarUrl ? undefined : (contact.avatarColor || "#64748b") }}
              >
                {contact.avatarUrl && (
                  <AvatarImage src={contact.avatarUrl} alt={contact.name || "Avatar"} />
                )}
                <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: "transparent" }}>
                  {getInitials(contact)}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate">
                {contact.name || contact.company || "-"}
              </span>
              {contact.isArchived && (
                <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0 font-normal text-muted-foreground">
                  Archived
                </Badge>
              )}
            </div>
          );
        },
        size: 280,
        // Absorbs leftover width so the columns reach the right edge and the
        // pinned actions column sits flush, instead of a blank filler column.
        meta: { defaultWidth: 280, flex: true, headerLabel: "Business Name" } satisfies DataTableColumnMeta,
      },
      {
        id: "keyPerson",
        header: "Key Person",
        accessorFn: (c) => [c.firstName, c.lastName].filter(Boolean).join(" "),
        cell: ({ row }) => {
          const contact = row.original;
          const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
          return name ? (
            <span className="text-sm">{name}</span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          );
        },
        size: 160,
        meta: { defaultWidth: 160, headerLabel: "Key Person" } satisfies DataTableColumnMeta,
      },
      {
        id: "role",
        header: "Role",
        accessorFn: (c) => (c.contactType === "team" ? c.role : c.position) || "",
        cell: ({ row }) => {
          const contact = row.original;
          const value = contact.contactType === "team" ? contact.role : contact.position;
          return value ? (
            <span className="text-sm">{value}</span>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Role" } satisfies DataTableColumnMeta,
      },
      {
        id: "phone",
        header: "Phone",
        accessorFn: (c) => c.mobile || c.phone || "",
        cell: ({ row }) => {
          const contact = row.original;
          const displayPhone = contact.mobile || contact.phone;
          return displayPhone ? (
            <a
              href={`tel:${displayPhone}`}
              className="text-sm text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {displayPhone}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          );
        },
        size: 140,
        meta: { defaultWidth: 140, headerLabel: "Phone" } satisfies DataTableColumnMeta,
      },
      {
        id: "email",
        header: "Email",
        accessorFn: (c) => c.email || "",
        cell: ({ row }) => {
          const contact = row.original;
          return contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="text-sm text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {contact.email}
            </a>
          ) : (
            <span className="text-sm text-muted-foreground">-</span>
          );
        },
        size: 200,
        meta: { defaultWidth: 200, headerLabel: "Email" } satisfies DataTableColumnMeta,
      },
      {
        id: "type",
        header: "Type",
        accessorFn: (c) => c.contactType || "",
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.contactType as ContactType];
          if (!meta) return <span className="text-sm text-muted-foreground">-</span>;
          return (
            <Badge variant="secondary" className={`text-xs font-normal ${meta.badge}`}>
              {meta.label}
            </Badge>
          );
        },
        size: 110,
        meta: { defaultWidth: 110, headerLabel: "Type" } satisfies DataTableColumnMeta,
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const contact = row.original;
          return (
            <span onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover-elevate active-elevate-2"
                    data-testid={`button-actions-${contact.id}`}
                    aria-label="Actions"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
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
                      onClick={() => handleArchive(contact)}
                      data-testid={`menu-archive-${contact.id}`}
                    >
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          );
        },
        size: 56,
        meta: { defaultWidth: 56, align: "center", headerLabel: "Actions" } satisfies DataTableColumnMeta,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredContacts, selectedIds]);

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb strip — matches Tasks / Timesheets / Price Lists. */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <span className="text-xs text-muted-foreground">Resources</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">
          Contacts
        </span>
      </div>

      {/* Header panel — one condensed row, card top. Replaces the two stacked
          full-bleed bars, which were the legacy Nov-2025 pattern. */}
      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          {/* LEFT: search, filters, type segments */}
          <div className="flex items-center gap-1 min-w-0">
            <div className="relative w-44 flex-shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-6 pl-7 pr-6 py-0 text-xs border bg-transparent"
                data-testid="input-search-contacts"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                  data-testid="button-clear-search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* One filter control with a count badge. */}
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      className={`relative h-6 w-6 flex items-center justify-center rounded-md border transition-all hover-elevate active-elevate-2 ${
                        activeFilterCount > 0
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "border-border/50 text-muted-foreground"
                      }`}
                      data-testid="button-filter-contacts"
                      aria-label="Filter"
                    >
                      <Filter className="h-3 w-3" />
                      {activeFilterCount > 0 && (
                        <span
                          className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-primary text-white text-[9px] leading-[14px] font-semibold text-center"
                          data-testid="badge-filter-count"
                        >
                          {activeFilterCount}
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Filter</TooltipContent>
              </Tooltip>

              <PopoverContent align="start" className="w-56 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Filters
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => setShowArchived(false)}
                      className="text-xs text-muted-foreground hover:text-foreground hover-elevate active-elevate-2 px-1 rounded"
                      data-testid="button-clear-filters"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs text-muted-foreground">
                    Show archived
                    {archivedCount > 0 && (
                      <span className="ml-1 text-muted-foreground/60">({archivedCount})</span>
                    )}
                  </span>
                  <Checkbox
                    checked={showArchived}
                    onCheckedChange={(v) => setShowArchived(v === true)}
                    data-testid="checkbox-show-archived"
                  />
                </label>
              </PopoverContent>
            </Popover>

            <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />

            {/* Contact type is the page's primary axis, so it stays a visible
                segmented control rather than collapsing into the popover. */}
            <div className="flex items-center gap-0.5 min-w-0" data-testid="tabs-contact-type">
              {tabs.map((tab) => {
                const isActive = selectedTab === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setSelectedTab(tab.value)}
                    className={`h-6 px-2 text-xs rounded-md border transition-all hover-elevate active-elevate-2 flex items-center gap-1 flex-shrink-0 ${
                      isActive
                        ? "bg-primary text-white border-primary/20"
                        : "border-border/50 text-muted-foreground"
                    }`}
                    data-testid={`tab-${tab.value}`}
                  >
                    {tab.label}
                    <span className={isActive ? "text-white/70" : "text-muted-foreground/60"}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: review nudge, columns, primary CTA, overflow */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {unreviewedCount > 0 && (
              <button
                onClick={() => setIsQuickReviewOpen(true)}
                className="h-6 px-2 text-xs rounded-md border border-status-warning/40 text-status-warning hover-elevate active-elevate-2 flex items-center gap-1"
                data-testid="button-quick-review"
              >
                <Zap className="h-3 w-3" />
                Review
                <span className="text-status-warning/70">{unreviewedCount}</span>
              </button>
            )}

            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                      data-testid="button-columns"
                      aria-label="Columns"
                    >
                      <Settings2 className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Columns</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-56 p-0" align="end">
                <DataTableColumnPicker storageKey={TABLE_STORAGE_KEY} columns={PICKER_COLUMNS} />
              </PopoverContent>
            </Popover>

            <div className="h-4 w-px bg-border mx-0.5" />

            <button
              onClick={() => handleAddContact(selectedTab === "all" ? undefined : (selectedTab as ContactType))}
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-0.5"
              data-testid="button-add-contact"
            >
              <Plus className="h-3 w-3" />
              Add Contact
            </button>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-6 w-6 flex items-center justify-center rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2"
                      data-testid="button-options"
                      aria-label="Options"
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Options</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setIsImportDialogOpen(true)} data-testid="menu-import-contacts">
                  <Upload className="h-3.5 w-3.5 mr-2" />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { setMergeSourceId(undefined); setIsMergeDialogOpen(true); }}
                  data-testid="menu-merge-contacts"
                >
                  <Merge className="h-3.5 w-3.5 mr-2" />
                  Merge duplicates
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bulk action bar — a second row inside the card, only while selecting. */}
        {selectedIds.size > 0 && (
          <div className="h-8 border-t border-border bg-primary/5 flex items-center px-3 gap-2">
            <span className="text-xs font-medium" data-testid="text-selected-count">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <Select onValueChange={handleBulkChangeType}>
              <SelectTrigger
                className="h-6 w-auto min-w-[110px] text-xs border-border/50"
                data-testid="select-bulk-change-type"
              >
                <SelectValue placeholder="Change type" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TYPES.filter((t) => t.value !== "team").map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    Set as {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              onClick={handleBulkArchive}
              disabled={bulkActionMutation.isPending}
              className="h-6 px-2 text-xs rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1 disabled:opacity-50"
              data-testid="button-bulk-archive"
            >
              <Archive className="h-3 w-3" />
              Archive
            </button>
            {showArchived && (
              <button
                onClick={handleBulkRestore}
                disabled={bulkActionMutation.isPending}
                className="h-6 px-2 text-xs rounded-md border border-border/50 hover-elevate active-elevate-2 flex items-center gap-1 disabled:opacity-50"
                data-testid="button-bulk-restore"
              >
                <ArchiveRestore className="h-3 w-3" />
                Restore
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setSelectedIds(new Set())}
              className="h-6 px-2 text-xs rounded-md border border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
              data-testid="button-clear-selection"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Body closes the card. One scroll container — the DataTable is h-full,
          so it must not be nested inside another overflow-auto. */}
      <div className="flex-1 min-h-0 border-x border-b border-border rounded-b-lg bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2" data-testid="loading-contacts">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
                <Skeleton className="h-3 flex-1 max-w-[240px]" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <DataTable
            data={filteredContacts}
            columns={contactColumns}
            storageKey={TABLE_STORAGE_KEY}
            legacyConfigKey="contacts-column-config-v1"
            rowKey={(c) => c.id}
            onRowClick={(c) => handleEdit(c)}
            rowClassName={(c) =>
              [
                selectedIds.has(c.id) ? "bg-primary/8 dark:bg-primary/10" : "",
                c.isArchived ? "opacity-55" : "",
              ].filter(Boolean).join(" ")
            }
            emptyState={
              <EmptyState
                icon={Users}
                title={searchTerm ? "No contacts match your search" : "No contacts yet"}
                description={
                  searchTerm
                    ? "Try a different search term"
                    : "Add team members, trades, suppliers and clients"
                }
              />
            }
          />
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
        contactTypeFilter={selectedTab === "all" ? null : (selectedTab as ContactType)}
      />

      <MergeContactDialog
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        contacts={contacts}
        preselectedSourceId={mergeSourceId}
      />
      <ConfirmDialog
        open={!!confirmArchive}
        onOpenChange={(open) => { if (!open) setConfirmArchive(null); }}
        title={`Archive "${confirmArchive?.name ?? ""}"?`}
        description="The contact is hidden from lists but can be restored later."
        confirmLabel="Archive"
        onConfirm={() => { if (confirmArchive) archiveMutation.mutate(confirmArchive.id); setConfirmArchive(null); }}
      />
    </div>
  );
}
