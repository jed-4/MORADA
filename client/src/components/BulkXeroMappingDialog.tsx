import { useState, useMemo } from "react";
import type { ReactNode } from "react";
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
import type { CostCode, CostCategory, Supplier } from "@shared/schema";
import {
  SearchableSelect,
  SearchableSelectOption,
} from "@/components/ui/searchable-select";

// ---------- Shared matching helpers ----------

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCode(str: string): string {
  const match = str.match(/^[\d.]+/);
  return match ? match[0] : "";
}

/** Similarity used for cost codes: includes numeric code-prefix matching. */
function costCodeSimilarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;
  const codeA = extractCode(a);
  const codeB = extractCode(b);
  if (codeA && codeB && codeA === codeB) return 0.7;
  const wordsA = na.split(" ");
  const wordsB = nb.split(" ");
  const common = wordsA.filter((w) => wordsB.includes(w));
  const score = (common.length * 2) / (wordsA.length + wordsB.length);
  return score;
}

/** Similarity used for contacts: word overlap ignoring single-character words. */
function contactSimilarity(a: string, b: string): number {
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

// ---------- Generic bulk-mapping dialog core ----------

type BulkMappingColumn = {
  label: ReactNode;
  className?: string;
};

type BulkMappingCell = {
  content: ReactNode;
  className?: string;
};

type BulkMappingItem = {
  id: string;
  /** Label used for similarity auto-matching against option labels. */
  matchLabel: string;
  /** The option id currently persisted on the server (null if unmapped). */
  originalValue: string | null;
  cells: BulkMappingCell[];
};

type BulkMappingDialogCoreProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Data columns (the option column is appended automatically). */
  columns: BulkMappingColumn[];
  optionColumnLabel: string;
  items: BulkMappingItem[];
  options: SearchableSelectOption[];
  optionsLoading?: boolean;
  /** Hide options already mapped to another row (cost codes behaviour). */
  enforceUniqueOptions?: boolean;
  /** Show a link icon next to rows that are mapped but unchanged. */
  showLinkedIcon?: boolean;
  /** Message row shown when there are no items (omit to render nothing). */
  noRowsMessage?: string;
  nounSingular: string;
  nounPlural: string;
  selectPlaceholder: string;
  loadingPlaceholder?: string;
  searchPlaceholder: string;
  emptyMessage: string;
  similarity: (a: string, b: string) => number;
  saveItem: (
    itemId: string,
    optionId: string | null,
    optionName: string | null
  ) => Promise<void>;
  invalidateQueryKeys: string[][];
};

function BulkMappingDialogCore({
  open,
  onOpenChange,
  title,
  description,
  columns,
  optionColumnLabel,
  items,
  options,
  optionsLoading = false,
  enforceUniqueOptions = false,
  showLinkedIcon = false,
  noRowsMessage,
  nounSingular,
  nounPlural,
  selectPlaceholder,
  loadingPlaceholder,
  searchPlaceholder,
  emptyMessage,
  similarity,
  saveItem,
  invalidateQueryKeys,
}: BulkMappingDialogCoreProps) {
  const { toast } = useToast();
  const [mappings, setMappings] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);

  const getCurrentMapping = (item: BulkMappingItem): string | null => {
    if (item.id in mappings) return mappings[item.id];
    return item.originalValue;
  };

  const getOptionName = (optionId: string | null): string => {
    if (!optionId) return "";
    return options.find((o) => o.value === optionId)?.label ?? "";
  };

  const handleAutoMatch = () => {
    const newMappings: Record<string, string | null> = {};
    const usedOptionIds = new Set<string>();
    const assignedIds = new Set<string>();
    let matched = 0;

    for (const item of items) {
      const existing = getCurrentMapping(item);
      if (existing) {
        usedOptionIds.add(existing);
        assignedIds.add(item.id);
      }
    }

    const scoredPairs: { itemId: string; optionId: string; score: number }[] = [];
    for (const item of items) {
      if (assignedIds.has(item.id)) continue;
      for (const option of options) {
        if (usedOptionIds.has(option.value)) continue;
        const score = similarity(item.matchLabel, option.label);
        if (score >= 0.4) {
          scoredPairs.push({ itemId: item.id, optionId: option.value, score });
        }
      }
    }

    scoredPairs.sort((a, b) => b.score - a.score);

    for (const pair of scoredPairs) {
      if (assignedIds.has(pair.itemId) || usedOptionIds.has(pair.optionId)) continue;
      newMappings[pair.itemId] = pair.optionId;
      assignedIds.add(pair.itemId);
      usedOptionIds.add(pair.optionId);
      matched++;
    }

    setMappings((prev) => ({ ...prev, ...newMappings }));
    toast({
      title: "Auto-match complete",
      description: `Matched ${matched} of ${items.length - (assignedIds.size - matched)} unmapped ${nounPlural}.`,
    });
  };

  const handleClearAll = () => {
    const cleared: Record<string, string | null> = {};
    for (const item of items) {
      cleared[item.id] = null;
    }
    setMappings(cleared);
  };

  const handleSaveAll = async () => {
    const changedItems = items.filter((item) => {
      const newVal = mappings[item.id];
      return item.id in mappings && newVal !== item.originalValue;
    });

    if (changedItems.length === 0) {
      toast({
        title: "No changes",
        description: "No mappings have been changed.",
      });
      return;
    }

    setSaving(true);
    let succeeded = 0;
    let failed = 0;

    for (const item of changedItems) {
      try {
        const optionId = mappings[item.id] || null;
        const optionName = optionId ? getOptionName(optionId) : null;
        await saveItem(item.id, optionId, optionName);
        succeeded++;
      } catch {
        failed++;
      }
    }

    setSaving(false);
    for (const key of invalidateQueryKeys) {
      queryClient.invalidateQueries({ queryKey: key });
    }

    if (failed === 0) {
      toast({
        title: "Mappings saved",
        description: `Updated ${succeeded} ${nounSingular}${succeeded === 1 ? "" : "s"}.`,
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

  const changedCount = items.filter((item) => {
    return item.id in mappings && mappings[item.id] !== item.originalValue;
  }).length;

  const mappedCount = items.filter((item) => getCurrentMapping(item) !== null).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 flex-wrap py-2 border-b">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoMatch}
              disabled={optionsLoading || options.length === 0}
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
              {mappedCount}/{items.length} mapped
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
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={`text-left py-2 px-2 font-medium text-muted-foreground ${col.className ?? ""}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="text-left py-2 px-2 font-medium text-muted-foreground w-[280px]">
                  {optionColumnLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const currentMapping = getCurrentMapping(item);
                const isChanged =
                  item.id in mappings && mappings[item.id] !== item.originalValue;

                let rowOptions = options;
                if (enforceUniqueOptions) {
                  const usedOptionIds = new Set<string>();
                  for (const other of items) {
                    if (other.id === item.id) continue;
                    const otherMapping = getCurrentMapping(other);
                    if (otherMapping) usedOptionIds.add(otherMapping);
                  }
                  rowOptions = options.filter(
                    (o) => !usedOptionIds.has(o.value) || o.value === currentMapping
                  );
                }

                const selectOptions: SearchableSelectOption[] = [
                  { value: "__none__", label: "None" },
                  ...rowOptions,
                ];

                return (
                  <tr
                    key={item.id}
                    className={`border-b ${isChanged ? "bg-primary/5" : ""}`}
                  >
                    {item.cells.map((cell, i) => (
                      <td key={i} className={`py-1.5 px-2 ${cell.className ?? ""}`}>
                        {cell.content}
                      </td>
                    ))}
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1">
                        <SearchableSelect
                          options={selectOptions}
                          value={currentMapping || "__none__"}
                          onValueChange={(value) => {
                            setMappings((prev) => ({
                              ...prev,
                              [item.id]: value === "__none__" ? null : value,
                            }));
                          }}
                          placeholder={
                            optionsLoading && loadingPlaceholder
                              ? loadingPlaceholder
                              : selectPlaceholder
                          }
                          searchPlaceholder={searchPlaceholder}
                          emptyMessage={emptyMessage}
                          disabled={optionsLoading}
                          triggerClassName="h-7 text-xs"
                        />
                        {isChanged && (
                          <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        )}
                        {showLinkedIcon && !isChanged && currentMapping && (
                          <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {noRowsMessage && items.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="py-8 text-center text-muted-foreground text-sm"
                  >
                    {noRowsMessage}
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
          <Button
            onClick={handleSaveAll}
            disabled={changedCount === 0 || saving}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {saving ? "Saving..." : `Save ${changedCount} Change${changedCount === 1 ? "" : "s"}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Cost codes → Xero tracking options ----------

type TrackingOption = {
  trackingOptionId: string;
  name: string;
  status: string;
};

type BulkXeroMappingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function BulkXeroMappingDialog({
  open,
  onOpenChange,
}: BulkXeroMappingDialogProps) {
  const { data: codes = [] } = useQuery<CostCode[]>({
    queryKey: ["/api/cost-codes"],
  });

  const { data: categories = [] } = useQuery<CostCategory[]>({
    queryKey: ["/api/cost-categories"],
  });

  const { data: xeroStatus } = useQuery<any>({
    queryKey: ["/api/xero/status"],
  });

  const trackingCategory1Id = xeroStatus?.trackingCategory1Id;
  const trackingCategory1Name = xeroStatus?.trackingCategory1Name;

  const { data: trackingCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/xero/tracking-categories"],
    enabled: !!trackingCategory1Id,
  });

  const trackingCategory1 = trackingCategories.find(
    (tc: any) => tc.trackingCategoryId === trackingCategory1Id
  );
  const trackingOptions: TrackingOption[] =
    trackingCategory1?.options?.filter((o: any) => o.status === "ACTIVE") || [];

  const activeCodes = useMemo(
    () => codes.filter((c) => c.isActive !== false),
    [codes]
  );

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "";
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? `${cat.code} - ${cat.title}` : "";
  };

  const items: BulkMappingItem[] = useMemo(
    () =>
      activeCodes.map((code) => ({
        id: code.id,
        matchLabel: `${code.code} ${code.title}`.trim(),
        originalValue: (code as any).xeroTrackingOptionId ?? null,
        cells: [
          { content: code.code, className: "font-mono text-xs" },
          { content: code.title },
          {
            content: getCategoryName(code.categoryId),
            className: "text-muted-foreground text-xs",
          },
        ],
      })),
    [activeCodes, categories]
  );

  const options: SearchableSelectOption[] = useMemo(
    () =>
      trackingOptions.map((o) => ({
        value: o.trackingOptionId,
        label: o.name,
      })),
    [trackingOptions]
  );

  return (
    <BulkMappingDialogCore
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk Xero Mapping — Cost Codes"
      description={
        <>
          Map cost codes to Xero tracking options
          {trackingCategory1Name ? ` (${trackingCategory1Name})` : ""}.
          Use Auto-Match to quickly pair by name similarity, then adjust as
          needed.
        </>
      }
      columns={[
        { label: "Code", className: "w-[100px]" },
        { label: "Title" },
        { label: "Category" },
      ]}
      optionColumnLabel="Xero Tracking Option"
      items={items}
      options={options}
      enforceUniqueOptions
      nounSingular="cost code"
      nounPlural="cost codes"
      selectPlaceholder="Select..."
      searchPlaceholder="Search tracking options..."
      emptyMessage="No tracking options found."
      similarity={costCodeSimilarity}
      saveItem={async (itemId, optionId, optionName) => {
        await apiRequest(`/api/cost-codes/${itemId}`, "PATCH", {
          xeroTrackingOptionId: optionId,
          xeroTrackingOptionName: optionName,
        });
      }}
      invalidateQueryKeys={[["/api/cost-codes"]]}
    />
  );
}

// ---------- Suppliers / trades → Xero contacts ----------

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

export function BulkXeroContactMappingDialog({
  open,
  onOpenChange,
  contactType,
}: BulkXeroContactMappingDialogProps) {
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

  const options: SearchableSelectOption[] = useMemo(() => {
    const sorted = [...xeroContacts].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    return sorted.map((xc) => ({
      value: xc.contactId,
      label: xc.name,
      description: xc.emailAddress || undefined,
    }));
  }, [xeroContacts]);

  const items: BulkMappingItem[] = useMemo(
    () =>
      contacts.map((contact) => ({
        id: contact.id,
        matchLabel: contact.name || "",
        originalValue: contact.xeroContactId ?? null,
        cells: [
          { content: contact.name, className: "font-medium" },
          {
            content: contact.email || "—",
            className: "text-muted-foreground text-xs",
          },
        ],
      })),
    [contacts]
  );

  const typeLabel = contactType === "supplier" ? "Suppliers" : "Trades";

  return (
    <BulkMappingDialogCore
      open={open}
      onOpenChange={onOpenChange}
      title={`Bulk Xero Mapping — ${typeLabel}`}
      description={`Map your ${typeLabel.toLowerCase()} to their matching Xero contacts. Use Auto-Match to quickly pair by name similarity, then adjust as needed.`}
      columns={[
        { label: `Morada ${contactType === "supplier" ? "Supplier" : "Trade"}` },
        { label: "Email" },
      ]}
      optionColumnLabel="Xero Contact"
      items={items}
      options={options}
      optionsLoading={xeroLoading}
      showLinkedIcon
      noRowsMessage={`No ${typeLabel.toLowerCase()} found.`}
      nounSingular={contactType === "supplier" ? "supplier" : "trade"}
      nounPlural={typeLabel.toLowerCase()}
      selectPlaceholder="Select Xero contact..."
      loadingPlaceholder="Loading..."
      searchPlaceholder="Search Xero contacts..."
      emptyMessage="No Xero contacts found."
      similarity={contactSimilarity}
      saveItem={async (itemId, optionId) => {
        await apiRequest(`/api/suppliers/${itemId}`, "PATCH", {
          xeroContactId: optionId,
        });
      }}
      invalidateQueryKeys={[["/api/suppliers"]]}
    />
  );
}
