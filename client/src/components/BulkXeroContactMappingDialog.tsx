import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Wand2, Save, RotateCcw, Check, Link2 } from "lucide-react";
import type { Supplier } from "@shared/schema";
import { SearchableSelect, SearchableSelectOption } from "@/components/ui/searchable-select";

type XeroContact = {
  contactId: string;
  name: string;
  emailAddress?: string;
  isSupplier: boolean;
  isCustomer: boolean;
};

type BulkXeroContactMappingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactType: "supplier" | "trade";
};

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const common = wordsA.filter((w) => w.length > 1 && wordsB.includes(w));
  const score = (common.length * 2) / (wordsA.length + wordsB.length);
  return score;
}

export default function BulkXeroContactMappingDialog({
  open,
  onOpenChange,
  contactType,
}: BulkXeroContactMappingDialogProps) {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const { data: allSuppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
  });

  const { data: xeroContacts = [], isLoading: xeroLoading } = useQuery<XeroContact[]>({
    queryKey: ["/api/xero/contacts"],
    enabled: open,
  });

  const contacts = useMemo(
    () => allSuppliers.filter((s) => s.supplierType === contactType),
    [allSuppliers, contactType]
  );

  const xeroOptions: SearchableSelectOption[] = useMemo(() => {
    const opts: SearchableSelectOption[] = [{ value: "__none__", label: "None" }];
    xeroContacts.forEach((xc) => {
      opts.push({
        value: xc.contactId,
        label: xc.name,
        description: xc.emailAddress || undefined,
      });
    });
    return opts;
  }, [xeroContacts]);

  const getCurrentMapping = (supplier: Supplier): string | null => {
    if (supplier.id in mappings) return mappings[supplier.id];
    return supplier.xeroContactId ?? null;
  };

  const handleAutoMatch = () => {
    const newMappings: Record<string, string | null> = {};
    const usedXeroIds = new Set<string>();
    const assignedIds = new Set<string>();
    let matched = 0;

    for (const supplier of contacts) {
      const existing = getCurrentMapping(supplier);
      if (existing) {
        usedXeroIds.add(existing);
        assignedIds.add(supplier.id);
      }
    }

    const scoredPairs: { supplierId: string; xeroId: string; score: number }[] = [];
    for (const supplier of contacts) {
      if (assignedIds.has(supplier.id)) continue;
      const label = supplier.name || "";
      for (const xc of xeroContacts) {
        if (usedXeroIds.has(xc.contactId)) continue;
        const score = similarity(label, xc.name);
        if (score >= 0.4) {
          scoredPairs.push({ supplierId: supplier.id, xeroId: xc.contactId, score });
        }
      }
    }

    scoredPairs.sort((a, b) => b.score - a.score);

    for (const pair of scoredPairs) {
      if (assignedIds.has(pair.supplierId) || usedXeroIds.has(pair.xeroId)) continue;
      newMappings[pair.supplierId] = pair.xeroId;
      assignedIds.add(pair.supplierId);
      usedXeroIds.add(pair.xeroId);
      matched++;
    }

    setMappings((prev) => ({ ...prev, ...newMappings }));
    toast({
      title: "Auto-match complete",
      description: `Matched ${matched} of ${contacts.length - (assignedIds.size - matched)} unmapped ${typeLabel.toLowerCase()}.`,
    });
  };

  const handleClearAll = () => {
    const cleared: Record<string, string | null> = {};
    for (const supplier of contacts) {
      cleared[supplier.id] = null;
    }
    setMappings(cleared);
  };

  const handleSaveAll = async () => {
    const changed = contacts.filter((s) => {
      const current = s.xeroContactId ?? null;
      const newVal = mappings[s.id];
      return s.id in mappings && newVal !== current;
    });

    if (changed.length === 0) {
      toast({ title: "No changes", description: "No mappings have been changed." });
      return;
    }

    setSaving(true);
    let succeeded = 0;
    let failed = 0;

    for (const supplier of changed) {
      try {
        const xeroId = mappings[supplier.id] || null;
        await apiRequest(`/api/suppliers/${supplier.id}`, "PATCH", {
          xeroContactId: xeroId,
        });
        succeeded++;
      } catch {
        failed++;
      }
    }

    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });

    if (failed === 0) {
      toast({
        title: "Mappings saved",
        description: `Updated ${succeeded} ${typeLabel.toLowerCase().replace(/s$/, "")}${succeeded === 1 ? "" : "s"}.`,
      });
      onOpenChange(false);
    } else {
      toast({
        title: "Partial save",
        description: `${succeeded} saved, ${failed} failed.`,
        variant: "destructive",
      });
    }
  };

  const changedCount = contacts.filter((s) => {
    const current = s.xeroContactId ?? null;
    return s.id in mappings && mappings[s.id] !== current;
  }).length;

  const mappedCount = contacts.filter((s) => getCurrentMapping(s) !== null).length;

  const typeLabel = contactType === "supplier" ? "Suppliers" : "Trades";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Xero Mapping — {typeLabel}</DialogTitle>
          <DialogDescription>
            Map your {typeLabel.toLowerCase()} to their matching Xero contacts. Use Auto-Match to quickly pair by name similarity, then adjust as needed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap py-2 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
              disabled={xeroLoading || xeroContacts.length === 0}
            >
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />
              Auto-Match
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClearAll}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Clear All
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {mappedCount}/{contacts.length} mapped
            </Badge>
            {changedCount > 0 && (
              <Badge variant="default" className="text-xs">
                {changedCount} changed
              </Badge>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                  BuildPro {contactType === "supplier" ? "Supplier" : "Trade"}
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">
                  Email
                </th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[280px]">
                  Xero Contact
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => {
                const currentMapping = getCurrentMapping(contact);
                const original = (contact as any).xeroContactId ?? null;
                const isChanged = contact.id in mappings && mappings[contact.id] !== original;

                return (
                  <tr
                    key={contact.id}
                    className={`border-b ${isChanged ? "bg-primary/5" : ""}`}
                  >
                    <td className="py-1.5 px-2 font-medium">{contact.name}</td>
                    <td className="py-1.5 px-2 text-muted-foreground text-xs">
                      {contact.email || "—"}
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1">
                        <SearchableSelect
                          options={xeroOptions}
                          value={currentMapping || "__none__"}
                          onValueChange={(value) => {
                            setMappings((prev) => ({
                              ...prev,
                              [contact.id]: value === "__none__" ? null : value,
                            }));
                          }}
                          placeholder={xeroLoading ? "Loading..." : "Select Xero contact..."}
                          searchPlaceholder="Search Xero contacts..."
                          emptyMessage="No Xero contacts found."
                          disabled={xeroLoading}
                          triggerClassName="h-7 text-xs"
                        />
                        {isChanged && (
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        )}
                        {!isChanged && currentMapping && (
                          <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-muted-foreground text-sm">
                    No {typeLabel.toLowerCase()} found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveAll} disabled={changedCount === 0 || saving}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "Saving..." : `Save ${changedCount} Change${changedCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
