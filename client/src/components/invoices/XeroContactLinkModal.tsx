import { useState, useMemo } from "react";
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
  isCustomer?: boolean;
  isSupplier?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string | null;
  clientName: string;
  onLinked: () => void;
}

const CREATE_NEW_ID = "__CREATE_NEW__";

export function XeroContactLinkModal({ open, onClose, clientId, clientName, onLinked }: Props) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: xeroContacts = [], isLoading } = useQuery<XeroContact[]>({
    queryKey: ["/api/xero/contacts"],
    enabled: open,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return [...xeroContacts]
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [xeroContacts, search]);

  const showCreateNew = !search || !xeroContacts.some(
    (c) => c.name.toLowerCase() === search.toLowerCase()
  );

  const selectedContact = selectedId === CREATE_NEW_ID
    ? { contactId: CREATE_NEW_ID, name: search || clientName }
    : xeroContacts.find((c) => c.contactId === selectedId);

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!clientId) throw new Error("No client linked to this project");
      if (!selectedId) throw new Error("Please select a Xero contact");

      let xeroContactId: string;

      if (selectedId === CREATE_NEW_ID) {
        const name = search.trim() || clientName;
        const created = await apiRequest("/api/xero/contacts", "POST", {
          name,
          buildproContactId: clientId,
        });
        xeroContactId = created.contactId;
      } else {
        xeroContactId = selectedId;
        await apiRequest(`/api/contacts/${clientId}`, "PATCH", { xeroContactId });
      }

      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${clientId}`] });
      return xeroContactId;
    },
    onSuccess: () => {
      toast({ title: "Contact linked", description: "Xero contact linked successfully. Retrying push…" });
      setSearch("");
      setSelectedId(null);
      onLinked();
    },
    onError: (error: Error) => {
      toast({ title: "Failed to link contact", description: error.message, variant: "destructive" });
    },
  });

  function handleClose() {
    setSearch("");
    setSelectedId(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link to Xero Contact</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{clientName}</span> has no linked Xero contact.
            Search to link an existing one or create a new contact in Xero.
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
            />
          </div>

          <ScrollArea className="h-60 rounded-md border">
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
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left w-full hover-elevate",
                      selectedId === c.contactId && "bg-primary/10 font-medium"
                    )}
                  >
                    <span className="flex-1 truncate">{c.name}</span>
                    <div className="flex gap-1 shrink-0">
                      {c.isCustomer && <Badge variant="secondary" className="text-xs no-default-active-elevate">Customer</Badge>}
                    </div>
                    {selectedId === c.contactId && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {!clientId && (
            <p className="text-sm text-destructive">
              This project has no client assigned. Please assign a client to the project first.
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
