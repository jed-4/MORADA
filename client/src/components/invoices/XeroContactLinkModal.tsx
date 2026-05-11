import { useState, useMemo, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Check, Plus, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface XeroContact {
  contactId: string;
  name: string;
  emailAddress?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
  isArchived?: boolean;
  status?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string | null;
  clientName: string;
  onLinked: (xeroContactId: string) => void;
  title?: string;
  description?: ReactNode;
  successMessage?: string;
  /**
   * What kind of BuildPro entity is being linked.
   * "contact" (default) → patches /api/contacts/:id
   * "user"             → patches /api/users/:id/xero-link (used when a PO supplier is a team-member subcontractor)
   */
  targetType?: "contact" | "user";
}

const CREATE_NEW_ID = "__CREATE_NEW__";

export function XeroContactLinkModal({
  open,
  onClose,
  clientId,
  clientName,
  onLinked,
  title = "Link to Xero Contact",
  description,
  successMessage = "Xero contact linked successfully.",
  targetType = "contact",
}: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const { data: xeroContacts = [], isLoading } = useQuery<XeroContact[]>({
    queryKey: ["/api/xero/contacts", { includeArchived }],
    queryFn: async () => {
      const url = includeArchived
        ? "/api/xero/contacts?includeArchived=true"
        : "/api/xero/contacts";
      return apiRequest(url, "GET");
    },
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return xeroContacts.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [xeroContacts, search]);

  const showCreateNew = !search || !xeroContacts.some(
    (c) => c.name.toLowerCase() === search.toLowerCase()
  );

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("No BuildPro contact provided");
      if (!selectedId) throw new Error("Please select a Xero contact");

      let xeroContactId: string;

      if (selectedId === CREATE_NEW_ID) {
        const name = search.trim() || clientName;
        const created = await apiRequest("/api/xero/contacts", "POST", {
          name,
          // For user-as-supplier we don't pass buildproContactId — the caller will persist the link via the user endpoint below.
          ...(targetType === "contact" ? { buildproContactId: clientId } : {}),
        });
        xeroContactId = created.contactId;
        if (targetType === "user") {
          await apiRequest(`/api/users/${clientId}/xero-link`, "PATCH", { xeroContactId });
        }
      } else {
        xeroContactId = selectedId;
        if (targetType === "user") {
          await apiRequest(`/api/users/${clientId}/xero-link`, "PATCH", { xeroContactId });
        } else {
          await apiRequest(`/api/contacts/${clientId}`, "PATCH", { xeroContactId });
        }
      }

      if (targetType === "user") {
        queryClient.invalidateQueries({ queryKey: ["/api/users/assignable"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      } else {
        queryClient.invalidateQueries({ queryKey: [`/api/contacts/${clientId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
      }
      return xeroContactId;
    },
    onSuccess: (xeroContactId) => {
      toast({ title: "Contact linked", description: successMessage });
      setSearch("");
      setSelectedId(null);
      onLinked(xeroContactId);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to link contact", description: error.message, variant: "destructive" });
    },
  });

  function handleClose() {
    setSearch("");
    setSelectedId(null);
    setIncludeArchived(false);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ? (
              description
            ) : (
              <>
                <span className="font-medium text-foreground">{clientName}</span> has no linked Xero contact.
                Search to link an existing one or create a new contact in Xero.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search Xero contacts…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelectedId(null); }}
              className="pl-9"
              autoFocus
              data-testid="input-xero-contact-search"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isLoading ? "Loading…" : `${filtered.length} of ${xeroContacts.length} contact${xeroContacts.length === 1 ? "" : "s"}`}</span>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="h-3.5 w-3.5"
                data-testid="checkbox-include-archived"
              />
              Show archived
            </label>
          </div>

          <ScrollArea className="h-72 rounded-md border">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground gap-2 text-sm py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading contacts…
              </div>
            ) : (
              <div className="flex flex-col p-1">
                {showCreateNew && (
                  <button
                    type="button"
                    onClick={() => setSelectedId(CREATE_NEW_ID)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left w-full hover-elevate",
                      selectedId === CREATE_NEW_ID && "bg-primary/10 font-medium"
                    )}
                  >
                    <Plus className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      Create new{search.trim() ? (
                        <> &ldquo;<span className="font-medium">{search.trim()}</span>&rdquo;</>
                      ) : (
                        <> &ldquo;<span className="font-medium">{clientName}</span>&rdquo;</>
                      )}
                    </span>
                    {selectedId === CREATE_NEW_ID && <Check className="h-4 w-4 ml-auto text-primary" />}
                  </button>
                )}

                {filtered.length === 0 && !showCreateNew && (
                  <p className="text-sm text-muted-foreground px-3 py-4 text-center">No contacts found</p>
                )}

                {filtered.map((c) => (
                  <button
                    key={c.contactId}
                    type="button"
                    onClick={() => setSelectedId(c.contactId)}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-3 py-2 text-sm text-left w-full hover-elevate",
                      selectedId === c.contactId && "bg-primary/10 font-medium"
                    )}
                    data-testid={`xero-contact-option-${c.contactId}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{c.name}</div>
                      {c.emailAddress && (
                        <div className="text-xs text-muted-foreground truncate font-normal">{c.emailAddress}</div>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 items-center">
                      {c.isArchived && <Badge variant="outline" className="text-xs no-default-active-elevate">Archived</Badge>}
                      {c.isCustomer && <Badge variant="secondary" className="text-xs no-default-active-elevate">Customer</Badge>}
                      {c.isSupplier && <Badge variant="secondary" className="text-xs no-default-active-elevate">Supplier</Badge>}
                      {selectedId === c.contactId && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {!clientId && (
            <p className="text-sm text-destructive">
              No BuildPro contact selected. Please assign a contact first.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!selectedId || !clientId || linkMutation.isPending}
          >
            {linkMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {selectedId === CREATE_NEW_ID ? "Create & Link" : "Link Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
