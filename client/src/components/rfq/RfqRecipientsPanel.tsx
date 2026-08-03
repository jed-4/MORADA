import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Building2,
  Check,
  Copy,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SectionCard } from "@/components/detail/SectionCard";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCents } from "@shared/money";
import { RECIPIENT_STATUS_LABEL } from "@shared/rfqStatus";
import type { Contact, RfqQuote, RfqRecipient } from "@shared/schema";
import { cn } from "@/lib/utils";

/**
 * Suppliers as rows — the main event on an RFQ.
 *
 * The old page hid them behind a popover reading "3 selected" and stored them
 * as two index-coupled arrays, so there was nowhere to show whether a given
 * supplier had been sent to, had opened it, or had come back with a price. Each
 * recipient is now a row with its own state.
 */

const STATUS_TONE: Record<string, "success" | "warning" | "info" | "danger" | "neutral"> = {
  not_sent: "neutral",
  sent: "info",
  viewed: "warning",
  quoted: "success",
  declined: "danger",
  no_response: "danger",
};

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : format(d, "d MMM");
}

export function RfqRecipientsPanel({
  rfqId,
  quotes,
  readOnly,
}: {
  rfqId: string;
  quotes: RfqQuote[];
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const recipientsKey = ["/api/rfqs", rfqId, "recipients"];

  const { data: recipients = [], isLoading } = useQuery<RfqRecipient[]>({
    queryKey: recipientsKey,
    enabled: !!rfqId,
  });

  const { data: allContacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const suppliers = useMemo(
    () =>
      allContacts.filter(
        (c: any) => (c.contactType === "supplier" || c.contactType === "trade") && !c.isArchived,
      ),
    [allContacts],
  );

  const alreadyOn = useMemo(
    () => new Set(recipients.map((r) => r.supplierId).filter(Boolean) as string[]),
    [recipients],
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    return suppliers.filter((s) => (s.name ?? "").toLowerCase().includes(q));
  }, [suppliers, supplierSearch]);

  const quoteByRecipient = useMemo(() => {
    const map = new Map<string, RfqQuote>();
    for (const r of recipients) {
      if (!r.quoteId) continue;
      const q = quotes.find((x) => x.id === r.quoteId);
      if (q) map.set(r.id, q);
    }
    return map;
  }, [recipients, quotes]);

  // Lowest live quote, so the row that currently represents best value is
  // obvious without opening the comparison.
  const lowestQuoteId = useMemo(() => {
    const live = quotes.filter((q) => q.status !== "declined" && q.totalAmount > 0);
    if (live.length < 2) return null;
    return live.reduce((min, q) => (q.totalAmount < min.totalAmount ? q : min), live[0]).id;
  }, [quotes]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: recipientsKey });
    queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfqId] });
    queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
  };

  const addMutation = useMutation({
    mutationFn: async (supplier: Contact) =>
      apiRequest("/api/rfq-recipients", "POST", {
        rfqId,
        supplierId: supplier.id,
        supplierName: supplier.name ?? "",
        supplierEmail: (supplier as any).email ?? null,
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Supplier added" });
    },
    onError: (error: any) =>
      toast({ title: "Could not add supplier", description: error.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiRequest(`/api/rfq-recipients/${id}`, "PATCH", patch),
    onSuccess: () => invalidate(),
    onError: (error: any) =>
      toast({ title: "Could not update supplier", description: error.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => apiRequest(`/api/rfq-recipients/${id}`, "DELETE"),
    onSuccess: () => {
      invalidate();
      toast({ title: "Supplier removed" });
    },
    onError: (error: any) =>
      toast({ title: "Could not remove supplier", description: error.message, variant: "destructive" }),
  });

  const copyPortalLink = async (recipient: RfqRecipient) => {
    if (!recipient.portalToken) return;
    const url = `${window.location.origin}/portal/rfq/${recipient.portalToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(recipient.id);
      setTimeout(() => setCopiedId((c) => (c === recipient.id ? null : c)), 2000);
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  const addButton = readOnly ? null : (
    <Popover open={addOpen} onOpenChange={setAddOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-6 text-xs" data-testid="button-add-recipient">
          <Plus className="w-3 h-3 mr-1" />
          Add supplier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
            placeholder="Search suppliers..."
            className="h-7 pl-7 text-sm"
            data-testid="input-recipient-search"
          />
        </div>
        <div className="space-y-0.5 max-h-[240px] overflow-y-auto">
          {filteredSuppliers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {suppliers.length === 0 ? "No suppliers in Contacts yet." : "No suppliers match."}
            </p>
          ) : (
            filteredSuppliers.map((supplier) => {
              const on = alreadyOn.has(supplier.id);
              return (
                <button
                  key={supplier.id}
                  type="button"
                  disabled={on || addMutation.isPending}
                  onClick={() => addMutation.mutate(supplier)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-sm",
                    on ? "opacity-40 cursor-default" : "hover-elevate",
                  )}
                  data-testid={`option-supplier-${supplier.id}`}
                >
                  <span className="truncate">{supplier.name}</span>
                  {on && <Check className="w-3 h-3 flex-shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <SectionCard
      title="Suppliers"
      accent="primary"
      count={recipients.length}
      actions={addButton}
      data-testid="card-recipients"
    >
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 h-10 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading suppliers…
        </div>
      ) : recipients.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No suppliers yet"
          description="Add the suppliers you want to quote this work."
          className="py-8"
        />
      ) : (
        <div className="divide-y divide-border/40">
          {/* Column headers */}
          <div className="h-7 flex items-center px-3 gap-3 text-data text-muted-foreground bg-muted/20">
            <span className="flex-1 min-w-0">Supplier</span>
            <span className="w-24 flex-shrink-0">Status</span>
            <span className="w-14 flex-shrink-0">Sent</span>
            <span className="w-14 flex-shrink-0">Viewed</span>
            <span className="w-24 flex-shrink-0 text-right">Quote</span>
            <span className="w-6 flex-shrink-0" />
          </div>

          {recipients.map((recipient) => {
            const quote = quoteByRecipient.get(recipient.id);
            const isLowest = quote && quote.id === lowestQuoteId;
            return (
              <div
                key={recipient.id}
                className="flex items-center px-3 gap-3 h-10 hover-elevate"
                data-testid={`row-recipient-${recipient.id}`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium truncate">{recipient.supplierName}</span>
                  {recipient.isExternal && (
                    <Badge variant="outline" className="text-data h-4 px-1 flex-shrink-0">
                      External
                    </Badge>
                  )}
                  {recipient.supplierEmail && (
                    <span className="text-data text-muted-foreground truncate hidden lg:inline">
                      {recipient.supplierEmail}
                    </span>
                  )}
                </div>

                <div className="w-24 flex-shrink-0">
                  <StatusBadge
                    status={recipient.status}
                    label={RECIPIENT_STATUS_LABEL[recipient.status] ?? recipient.status}
                    tone={STATUS_TONE[recipient.status]}
                  />
                </div>

                <span className="w-14 flex-shrink-0 text-xs text-muted-foreground">
                  {formatDate(recipient.sentAt) ?? <span className="text-muted-foreground/30">—</span>}
                </span>
                <span className="w-14 flex-shrink-0 text-xs text-muted-foreground">
                  {formatDate(recipient.viewedAt) ?? <span className="text-muted-foreground/30">—</span>}
                </span>

                <div className="w-24 flex-shrink-0 text-right">
                  {quote && quote.totalAmount > 0 ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums font-medium",
                        isLowest ? "text-status-success" : "text-foreground",
                      )}
                      title={isLowest ? "Lowest live quote" : undefined}
                    >
                      {formatCents(quote.totalAmount)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </div>

                <div className="w-6 flex-shrink-0 flex justify-end">
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="p-1 rounded hover-elevate text-muted-foreground"
                          data-testid={`button-recipient-actions-${recipient.id}`}
                          aria-label="Supplier actions"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {recipient.portalToken ? (
                          <>
                            <DropdownMenuItem onClick={() => copyPortalLink(recipient)}>
                              {copiedId === recipient.id ? (
                                <Check className="mr-2 h-4 w-4" />
                              ) : (
                                <Copy className="mr-2 h-4 w-4" />
                              )}
                              {copiedId === recipient.id ? "Copied" : "Copy portal link"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                updateMutation.mutate({
                                  id: recipient.id,
                                  patch: { portalTokenRevoked: !recipient.portalTokenRevoked },
                                })
                              }
                            >
                              <Link2 className="mr-2 h-4 w-4" />
                              {recipient.portalTokenRevoked ? "Re-enable link" : "Revoke link"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        ) : null}

                        {recipient.status !== "declined" && (
                          <DropdownMenuItem
                            onClick={() =>
                              updateMutation.mutate({
                                id: recipient.id,
                                patch: { status: "declined", respondedAt: new Date().toISOString() },
                              })
                            }
                          >
                            <X className="mr-2 h-4 w-4" />
                            Mark declined
                          </DropdownMenuItem>
                        )}
                        {recipient.status !== "no_response" && (
                          <DropdownMenuItem
                            onClick={() =>
                              updateMutation.mutate({
                                id: recipient.id,
                                patch: { status: "no_response" },
                              })
                            }
                          >
                            <X className="mr-2 h-4 w-4" />
                            Mark no response
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() =>
                            updateMutation.mutate({
                              id: recipient.id,
                              patch: { isExternal: !recipient.isExternal },
                            })
                          }
                        >
                          <Building2 className="mr-2 h-4 w-4" />
                          {recipient.isExternal ? "Not external" : "Mark external"}
                        </DropdownMenuItem>

                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => removeMutation.mutate(recipient.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Remove from RFQ
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
