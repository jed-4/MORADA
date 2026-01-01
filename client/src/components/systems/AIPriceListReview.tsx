import { useState, useMemo, forwardRef, useImperativeHandle } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Link2,
  Plus,
  Sparkles,
  Package,
  Building2,
  Search,
  AlertCircle,
} from "lucide-react";
import type { BillLineItem, Bill, Supplier, PriceListItem, PriceListCategory } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";

export interface AIPriceListReviewHandle {
  refresh: () => void;
}

interface Props {
  searchQuery?: string;
}

interface BillWithSupplier extends Bill {
  supplier?: Supplier;
}

interface BillLineItemWithBill extends BillLineItem {
  bill?: BillWithSupplier;
}

interface GroupedBySupplier {
  supplierId: string;
  supplierName: string;
  items: BillLineItemWithBill[];
}

function fuzzyMatch(text: string, pattern: string): number {
  if (!pattern || !text) return 0;
  const lowerText = text.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  
  if (lowerText === lowerPattern) return 1;
  if (lowerText.includes(lowerPattern)) return 0.8;
  
  const words = lowerPattern.split(/\s+/);
  const matchedWords = words.filter(word => lowerText.includes(word));
  return matchedWords.length / words.length * 0.6;
}

function findBestMatches(description: string, priceListItems: PriceListItem[], limit = 5): PriceListItem[] {
  const scored = priceListItems.map(item => {
    const nameScore = fuzzyMatch(item.name, description);
    const nicknameScore = item.nickname ? fuzzyMatch(item.nickname, description) : 0;
    const descScore = item.description ? fuzzyMatch(item.description, description) : 0;
    const score = Math.max(nameScore, nicknameScore, descScore);
    return { item, score };
  });
  
  return scored
    .filter(s => s.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.item);
}

const AIPriceListReview = forwardRef<AIPriceListReviewHandle, Props>(({ searchQuery }, ref) => {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [selectedLineItem, setSelectedLineItem] = useState<BillLineItemWithBill | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPriceListItem, setSelectedPriceListItem] = useState<PriceListItem | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    nickname: "",
    code: "",
    description: "",
    unitType: "each",
    costPrice: 0,
    sellPrice: 0,
    markup: 0,
    categoryId: "",
    supplierId: "",
  });

  const { data: unreviewedItems, isLoading: loadingItems, refetch } = useQuery<BillLineItemWithBill[]>({
    queryKey: ['/api/bill-line-items/unlinked', companyId],
    enabled: !!companyId,
  });

  const { data: priceListItems } = useQuery<PriceListItem[]>({
    queryKey: ['/api/price-list/items', companyId],
    enabled: !!companyId,
  });

  const { data: categories } = useQuery<PriceListCategory[]>({
    queryKey: ['/api/price-list/categories', companyId],
    enabled: !!companyId,
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ['/api/suppliers', companyId],
    enabled: !!companyId,
  });

  useImperativeHandle(ref, () => ({
    refresh: () => refetch(),
  }));

  const linkMutation = useMutation({
    mutationFn: async ({ lineItemId, priceListItemId }: { lineItemId: string; priceListItemId: string }) => {
      return apiRequest(`/api/bill-line-items/${lineItemId}/link-price-item`, "PATCH", { priceListItemId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bill-line-items/unlinked'] });
      setShowLinkModal(false);
      setSelectedLineItem(null);
      setSelectedPriceListItem(null);
    },
  });

  const createAndLinkMutation = useMutation({
    mutationFn: async (data: { lineItemId: string; priceListItem: any }) => {
      const newItem = await apiRequest('/api/price-list/items', "POST", data.priceListItem);
      await apiRequest(`/api/bill-line-items/${data.lineItemId}/link-price-item`, "PATCH", { priceListItemId: newItem.id });
      return newItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bill-line-items/unlinked'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-list/items'] });
      setShowCreateModal(false);
      setSelectedLineItem(null);
      setCreateForm({
        name: "",
        nickname: "",
        code: "",
        description: "",
        unitType: "each",
        costPrice: 0,
        sellPrice: 0,
        markup: 0,
        categoryId: "",
        supplierId: "",
      });
    },
  });

  const groupedBySupplier = useMemo(() => {
    if (!unreviewedItems) return [];
    
    const groups: Map<string, GroupedBySupplier> = new Map();
    
    for (const item of unreviewedItems) {
      const supplierId = item.bill?.supplierId || "unknown";
      const supplierName = item.bill?.supplier?.businessName || "Unknown Supplier";
      
      if (!groups.has(supplierId)) {
        groups.set(supplierId, {
          supplierId,
          supplierName,
          items: [],
        });
      }
      groups.get(supplierId)!.items.push(item);
    }
    
    return Array.from(groups.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));
  }, [unreviewedItems]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedBySupplier;
    const lowerSearch = searchQuery.toLowerCase();
    return groupedBySupplier
      .map(group => ({
        ...group,
        items: group.items.filter(item => 
          item.description.toLowerCase().includes(lowerSearch) ||
          group.supplierName.toLowerCase().includes(lowerSearch)
        ),
      }))
      .filter(group => group.items.length > 0);
  }, [groupedBySupplier, searchQuery]);

  const toggleSupplier = (supplierId: string) => {
    const newSet = new Set(expandedSuppliers);
    if (newSet.has(supplierId)) {
      newSet.delete(supplierId);
    } else {
      newSet.add(supplierId);
    }
    setExpandedSuppliers(newSet);
  };

  const openLinkModal = (item: BillLineItemWithBill) => {
    setSelectedLineItem(item);
    setShowLinkModal(true);
    
    if (priceListItems && priceListItems.length > 0) {
      const matches = findBestMatches(item.description, priceListItems);
      if (matches.length > 0) {
        setSelectedPriceListItem(matches[0]);
      }
    }
  };

  const openCreateModal = (item: BillLineItemWithBill) => {
    setSelectedLineItem(item);
    setCreateForm({
      name: item.description,
      nickname: "",
      code: "",
      description: item.description,
      unitType: "each",
      costPrice: item.unitPrice / 100,
      sellPrice: item.unitPrice / 100,
      markup: 0,
      categoryId: "",
      supplierId: item.bill?.supplierId || "",
    });
    setShowCreateModal(true);
  };

  const handleLink = () => {
    if (selectedLineItem && selectedPriceListItem) {
      linkMutation.mutate({
        lineItemId: selectedLineItem.id,
        priceListItemId: selectedPriceListItem.id,
      });
    }
  };

  const handleCreateAndLink = () => {
    if (selectedLineItem && createForm.name) {
      createAndLinkMutation.mutate({
        lineItemId: selectedLineItem.id,
        priceListItem: {
          ...createForm,
          companyId,
          costPrice: Math.round(createForm.costPrice * 100),
          sellPrice: Math.round(createForm.sellPrice * 100),
          status: "active",
        },
      });
    }
  };

  if (loadingItems) {
    return (
      <div className="p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!unreviewedItems || unreviewedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16">
        <Sparkles className="h-12 w-12 mb-4 text-[#bba7db]" />
        <p className="text-lg font-medium">All caught up!</p>
        <p className="text-sm">No unlinked bill line items to review.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {filteredGroups.map(group => (
            <div key={group.supplierId} className="border rounded-md bg-card">
              <button
                onClick={() => toggleSupplier(group.supplierId)}
                className="w-full flex items-center gap-2 p-3 hover-elevate text-left"
                data-testid={`supplier-group-${group.supplierId}`}
              >
                {expandedSuppliers.has(group.supplierId) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Building2 className="h-4 w-4 text-[#bba7db]" />
                <span className="font-medium flex-1">{group.supplierName}</span>
                <Badge variant="secondary" className="text-xs">
                  {group.items.length} items
                </Badge>
              </button>
              
              {expandedSuppliers.has(group.supplierId) && (
                <div className="border-t divide-y">
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-muted/50"
                      data-testid={`line-item-${item.id}`}
                    >
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{item.description}</p>
                        <p className="text-xs text-muted-foreground">
                          ${(item.unitPrice / 100).toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      
                      {priceListItems && priceListItems.length > 0 && (
                        <MatchSuggestion
                          description={item.description}
                          priceListItems={priceListItems}
                          onSelect={(priceItem) => {
                            setSelectedLineItem(item);
                            setSelectedPriceListItem(priceItem);
                            setShowLinkModal(true);
                          }}
                        />
                      )}
                      
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => openLinkModal(item)}
                        data-testid={`link-button-${item.id}`}
                      >
                        <Link2 className="h-3 w-3" />
                        <span>Link</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => openCreateModal(item)}
                        data-testid={`create-button-${item.id}`}
                      >
                        <Plus className="h-3 w-3" />
                        <span>Create New</span>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link to Price List Item</DialogTitle>
            <DialogDescription>
              Select an existing price list item to link with this bill line.
            </DialogDescription>
          </DialogHeader>
          
          {selectedLineItem && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <p className="font-medium">{selectedLineItem.description}</p>
              <p className="text-muted-foreground">
                ${(selectedLineItem.unitPrice / 100).toFixed(2)} × {selectedLineItem.quantity}
              </p>
            </div>
          )}
          
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Select price list item:</p>
            <PriceListItemSelect
              items={priceListItems || []}
              value={selectedPriceListItem}
              onChange={setSelectedPriceListItem}
              description={selectedLineItem?.description || ""}
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={!selectedPriceListItem || linkMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {linkMutation.isPending ? "Linking..." : "Link Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Price List Item</DialogTitle>
            <DialogDescription>
              Create a new price list item from this bill line.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Item name"
                className="h-8"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Nickname</label>
                <Input
                  value={createForm.nickname}
                  onChange={(e) => setCreateForm({ ...createForm, nickname: e.target.value })}
                  placeholder="Team terminology"
                  className="h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Code</label>
                <Input
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  placeholder="SKU/Code"
                  className="h-8"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Cost Price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.costPrice}
                  onChange={(e) => setCreateForm({ ...createForm, costPrice: parseFloat(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sell Price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={createForm.sellPrice}
                  onChange={(e) => setCreateForm({ ...createForm, sellPrice: parseFloat(e.target.value) || 0 })}
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                value={createForm.categoryId}
                onChange={(e) => setCreateForm({ ...createForm, categoryId: e.target.value })}
                className="w-full h-8 text-sm border rounded-md px-2 bg-background"
              >
                <option value="">No category</option>
                {categories?.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateAndLink}
              disabled={!createForm.name || createAndLinkMutation.isPending}
              className="bg-[#bba7db] hover:bg-[#bba7db]/90"
            >
              {createAndLinkMutation.isPending ? "Creating..." : "Create & Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

AIPriceListReview.displayName = "AIPriceListReview";

function MatchSuggestion({ description, priceListItems, onSelect }: {
  description: string;
  priceListItems: PriceListItem[];
  onSelect: (item: PriceListItem) => void;
}) {
  const matches = useMemo(() => {
    return findBestMatches(description, priceListItems, 3);
  }, [description, priceListItems]);

  if (matches.length === 0) return null;

  const bestMatch = matches[0];
  
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs gap-1 text-[#bba7db]"
        >
          <Sparkles className="h-3 w-3" />
          <span>Match found</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <p className="text-xs text-muted-foreground mb-2">Suggested matches:</p>
        <div className="space-y-1">
          {matches.map(match => (
            <button
              key={match.id}
              onClick={() => onSelect(match)}
              className="w-full text-left p-2 rounded hover:bg-muted text-xs"
            >
              <p className="font-medium truncate">{match.name}</p>
              {match.nickname && (
                <p className="text-muted-foreground truncate">"{match.nickname}"</p>
              )}
              <p className="text-muted-foreground">${(match.sellPrice / 100).toFixed(2)}</p>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PriceListItemSelect({ items, value, onChange, description }: {
  items: PriceListItem[];
  value: PriceListItem | null;
  onChange: (item: PriceListItem | null) => void;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const sortedItems = useMemo(() => {
    if (!items) return [];
    
    const matches = findBestMatches(description, items, items.length);
    const matchIds = new Set(matches.map(m => m.id));
    const rest = items.filter(item => !matchIds.has(item.id));
    
    if (search) {
      const filtered = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.nickname && item.nickname.toLowerCase().includes(search.toLowerCase()))
      );
      return filtered;
    }
    
    return [...matches, ...rest];
  }, [items, description, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-9"
        >
          {value ? (
            <span className="truncate">{value.name}</span>
          ) : (
            <span className="text-muted-foreground">Select item...</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0">
        <Command>
          <CommandInput
            placeholder="Search items..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No items found.</CommandEmpty>
            <CommandGroup>
              {sortedItems.slice(0, 20).map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value?.id === item.id ? "opacity-100" : "opacity-0"}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.name}</p>
                    {item.nickname && (
                      <p className="text-xs text-muted-foreground truncate">"{item.nickname}"</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    ${(item.sellPrice / 100).toFixed(2)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default AIPriceListReview;
