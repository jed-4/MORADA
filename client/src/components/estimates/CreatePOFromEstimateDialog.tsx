import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  Building2,
} from "lucide-react";
import type { EstimateItem, Contact } from "@shared/schema";

interface CreatePOFromEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: string;
  projectId: string;
  selectedItemIds: Set<string>;
  estimateItems: EstimateItem[];
  estimateName: string;
}

export function CreatePOFromEstimateDialog({
  open,
  onOpenChange,
  estimateId,
  projectId,
  selectedItemIds,
  estimateItems,
  estimateName,
}: CreatePOFromEstimateDialogProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const selectedEstimateItems = useMemo(
    () => estimateItems.filter((item) => selectedItemIds.has(item.id)),
    [estimateItems, selectedItemIds]
  );

  const [supplierId, setSupplierId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [deliveryDate, setDeliveryDate] = useState("");
  const [gstMode, setGstMode] = useState<"inclusive" | "exclusive" | "gst_free">("inclusive");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [deliveryAttention, setDeliveryAttention] = useState("");
  const [deliveryContact, setDeliveryContact] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    enabled: open,
  });

  const suppliers = useMemo(
    () => contacts.filter((c: any) => c.contactType === "supplier" || c.contactType === "trade"),
    [contacts]
  );

  const handleSupplierChange = (value: string) => {
    setSupplierId(value);
    const supplier = suppliers.find((s: any) => s.id === value);
    if (supplier) {
      setSupplierName(supplier.companyName || `${supplier.firstName || ""} ${supplier.lastName || ""}`.trim());
      if (supplier.address) {
        setDeliveryAddress(supplier.address);
      }
    }
  };

  const calculateItemTotal = (item: EstimateItem) => {
    const qty = parseFloat(item.quantity?.toString() || "1");
    const rate = item.rate || 0;
    return Math.round(qty * rate);
  };

  const subtotal = useMemo(() => {
    return selectedEstimateItems.reduce((sum, item) => sum + calculateItemTotal(item), 0);
  }, [selectedEstimateItems]);

  const gstAmount = useMemo(() => {
    if (gstMode === "gst_free") return 0;
    if (gstMode === "inclusive") return Math.round(subtotal / 11);
    return Math.round(subtotal * 0.1);
  }, [subtotal, gstMode]);

  const total = useMemo(() => {
    if (gstMode === "gst_free") return subtotal;
    if (gstMode === "inclusive") return subtotal;
    return subtotal + gstAmount;
  }, [subtotal, gstAmount, gstMode]);

  const createPOMutation = useMutation({
    mutationFn: async () => {
      const po = await apiRequest("/api/purchase-orders", "POST", {
        projectId,
        poType: "main",
        supplierId: supplierId || undefined,
        supplierName: supplierName || undefined,
        title: `PO from ${estimateName}`,
        poDate: new Date(orderDate).toISOString(),
        requiredByDate: deliveryDate ? new Date(deliveryDate).toISOString() : undefined,
        gstMode,
        subtotal,
        gstAmount,
        total,
        status: "draft",
        deliveryReference: deliveryReference || undefined,
        deliveryAttention: deliveryAttention || undefined,
        deliveryContact: deliveryContact || undefined,
        deliveryAddress: deliveryAddress || undefined,
        deliveryInstructions: deliveryInstructions || undefined,
        sourceEstimateId: estimateId,
      });

      const poItems = selectedEstimateItems.map((item, index) => ({
        description: item.description || "Untitled item",
        quantity: item.quantity?.toString() || "1",
        unit: item.unit || "each",
        unitPrice: item.rate || 0,
        total: calculateItemTotal(item),
        isGstFree: gstMode === "gst_free",
        gstAmount: gstMode === "gst_free" ? 0 : (gstMode === "inclusive" ? Math.round(calculateItemTotal(item) / 11) : Math.round(calculateItemTotal(item) * 0.1)),
        costCodeId: item.costCodeId || undefined,
        sourceEstimateItemId: item.id,
        displayOrder: index,
      }));

      await apiRequest(`/api/purchase-orders/${po.id}/items/bulk`, "POST", {
        items: poItems,
      });

      return po;
    },
    onSuccess: (po) => {
      toast({
        title: "Purchase order created",
        description: `${po.poNumber} created as draft`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", po.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/estimates", estimateId, "po-links"] });
      onOpenChange(false);
      resetForm();
      navigate(`/purchase-orders/${po.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create purchase order",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSupplierId("");
    setSupplierName("");
    setOrderDate(format(new Date(), "yyyy-MM-dd"));
    setDeliveryDate("");
    setGstMode("inclusive");
    setDeliveryReference("");
    setDeliveryAttention("");
    setDeliveryContact("");
    setDeliveryAddress("");
    setDeliveryInstructions("");
    setDeliveryOpen(false);
  };

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(dollars);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" />
            Create Purchase Order
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{selectedEstimateItems.length} items</Badge>
            <span>from {estimateName}</span>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={handleSupplierChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier: any) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3 h-3 text-muted-foreground" />
                        {supplier.companyName || `${supplier.firstName || ""} ${supplier.lastName || ""}`.trim()}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>GST</Label>
              <Select value={gstMode} onValueChange={(v: any) => setGstMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inclusive">GST Inclusive</SelectItem>
                  <SelectItem value="exclusive">GST Exclusive</SelectItem>
                  <SelectItem value="gst_free">GST Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Order Date</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          <Collapsible open={deliveryOpen} onOpenChange={setDeliveryOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-start gap-2 text-sm">
                {deliveryOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Delivery Details
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference</Label>
                  <Input
                    value={deliveryReference}
                    onChange={(e) => setDeliveryReference(e.target.value)}
                    placeholder="PO reference"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Attention</Label>
                  <Input
                    value={deliveryAttention}
                    onChange={(e) => setDeliveryAttention(e.target.value)}
                    placeholder="Attention to"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Contact</Label>
                  <Input
                    value={deliveryContact}
                    onChange={(e) => setDeliveryContact(e.target.value)}
                    placeholder="Contact number"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Address</Label>
                  <Input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Delivery address"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery Instructions</Label>
                <Textarea
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="Special delivery instructions..."
                  rows={3}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Items</Label>
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_60px_90px] gap-2 px-3 py-1.5 bg-muted/50 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Unit</span>
                <span className="text-right">Total</span>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {selectedEstimateItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_80px_60px_90px] gap-2 px-3 py-2 border-t text-sm"
                  >
                    <span className="truncate">{item.description || "Untitled"}</span>
                    <span className="text-right tabular-nums">{item.quantity || 1}</span>
                    <span className="text-right text-muted-foreground">{item.unit || "-"}</span>
                    <span className="text-right tabular-nums font-medium">
                      {formatCurrency(calculateItemTotal(item))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1 text-sm">
            <div className="flex justify-between px-1">
              <span className="text-muted-foreground">Subtotal {gstMode === "inclusive" ? "(ex GST)" : ""}</span>
              <span className="tabular-nums font-medium">
                {formatCurrency(gstMode === "inclusive" ? subtotal - gstAmount : subtotal)}
              </span>
            </div>
            {gstMode !== "gst_free" && (
              <div className="flex justify-between px-1">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatCurrency(gstAmount)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between px-1 font-medium">
              <span>Total {gstMode === "inclusive" ? "(inc GST)" : ""}</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => createPOMutation.mutate()}
            disabled={createPOMutation.isPending || selectedEstimateItems.length === 0}
          >
            {createPOMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShoppingCart className="w-4 h-4 mr-2" />
            )}
            Create Draft PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
