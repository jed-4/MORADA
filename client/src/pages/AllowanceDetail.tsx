import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useAllowanceStatusOptions } from "@/hooks/useAllowanceStatusOptions";

type EstimateItem = {
  id: string;
  estimateId: string;
  name: string;
  allowance: string;
  allowanceStatus: string;
  pcMarkupPercent: number | null;
  unitCostExTax: number;
  quantity: number;
  priceIncTax: number;
  estimateName: string;
  estimateVersion: number;
};

type AllowanceWithCosts = {
  item: EstimateItem;
  actualCost: number;
  variance: number;
};

type Bill = {
  id: string;
  billNumber: string;
  billDate: string;
  supplierId: string;
  billReference?: string;
  total: number;
};

type BillLineItem = {
  id: string;
  billId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

type Timesheet = {
  id: string;
  projectId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  description: string;
  status: string;
  total: number;
};

type CustomLine = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export default function AllowanceDetail() {
  const { projectId, allowanceId } = useParams<{ projectId: string; allowanceId: string }>();
  const [, setLocation] = useLocation();
  const { getStatusInfo } = useAllowanceStatusOptions();
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [isPsBillModalOpen, setIsPsBillModalOpen] = useState(false);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [expandedPsBills, setExpandedPsBills] = useState<Set<string>>(new Set());
  const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
  const [selectedPsLineItems, setSelectedPsLineItems] = useState<Set<string>>(new Set());
  const [selectedTimesheets, setSelectedTimesheets] = useState<Set<string>>(new Set());
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);
  const [isCustomLineDialogOpen, setIsCustomLineDialogOpen] = useState(false);
  const [customLineDescription, setCustomLineDescription] = useState("");
  const [customLineQuantity, setCustomLineQuantity] = useState("1");
  const [customLineUnitPrice, setCustomLineUnitPrice] = useState("");
  const [enteredActualCost, setEnteredActualCost] = useState("");
  const [isSavingPc, setIsSavingPc] = useState(false);
  const [isSavingPs, setIsSavingPs] = useState(false);

  // Fetch all allowances for the project
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  // Fetch bills for the project (PC modal)
  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/projects", projectId, "bills"],
    enabled: isBillModalOpen,
  });

  // Fetch bill line items for the project (PC modal)
  const { data: billLineItems = [] } = useQuery<BillLineItem[]>({
    queryKey: ["/api/projects", projectId, "bill-line-items"],
    enabled: isBillModalOpen,
  });

  // Fetch bills for the project (PS modal)
  const { data: psBills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/projects", projectId, "bills"],
    enabled: isPsBillModalOpen,
  });

  // Fetch bill line items for the project (PS modal)
  const { data: psBillLineItems = [] } = useQuery<BillLineItem[]>({
    queryKey: ["/api/projects", projectId, "bill-line-items"],
    enabled: isPsBillModalOpen,
  });

  // Fetch timesheets for the project (PS modal)
  const { data: timesheets = [] } = useQuery<Timesheet[]>({
    queryKey: ["/api/projects", projectId, "timesheets"],
    enabled: isTimesheetModalOpen,
  });

  const { toast } = useToast();

  // Mutation to update allowance (for simple cost entry)
  const updateAllowanceMutation = useMutation({
    mutationFn: async ({ actualCost }: { actualCost: number }) => {
      return apiRequest(`/api/estimate-items/${allowanceId}`, {
        method: "PATCH",
        body: JSON.stringify({ actualCost }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({
        title: "Success",
        description: "Allowance updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update allowance",
        variant: "destructive",
      });
    },
  });

  // Mutation to create bill line item allowances (for bill selection)
  const createBillLineItemAllowanceMutation = useMutation({
    mutationFn: async ({ billLineItemId, amount }: { billLineItemId: string; amount: number }) => {
      return apiRequest("/api/bill-line-item-allowances", {
        method: "POST",
        body: JSON.stringify({
          billLineItemId,
          estimateItemId: allowanceId,
          amount,
        }),
      });
    },
  });

  // Mutation to create timesheet allowances
  const createTimesheetAllowanceMutation = useMutation({
    mutationFn: async ({ timesheetId, amount }: { timesheetId: string; amount: number }) => {
      return apiRequest("/api/timesheet-allowances", {
        method: "POST",
        body: JSON.stringify({
          timesheetId,
          estimateItemId: allowanceId,
          amount,
        }),
      });
    },
  });

  // Mutation to create allowance items (custom lines)
  const createAllowanceItemMutation = useMutation({
    mutationFn: async (item: { description: string; quantity: number; unitPrice: number; totalPrice: number; sortOrder: number }) => {
      return apiRequest("/api/allowance-items", {
        method: "POST",
        body: JSON.stringify({
          estimateItemId: allowanceId,
          ...item,
        }),
      });
    },
  });

  // Handle saving PC item
  const handleSavePcItem = async () => {
    if (isSavingPc) return; // Prevent concurrent saves
    
    setIsSavingPc(true);
    try {
      const currentActualCost = allowance?.actualCost || 0;

      if (enteredActualCost) {
        // Simple cost entry - add to existing cost
        const additionalCost = Math.round(parseFloat(enteredActualCost) * 100);
        const newActualCost = currentActualCost + additionalCost;
        await updateAllowanceMutation.mutateAsync({ actualCost: newActualCost });
        
        // Refetch to ensure fresh data for next save
        await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
        setEnteredActualCost("");
      } else if (selectedLineItems.size > 0) {
        // Bill line items selected
        const selectedItems = billLineItems.filter(item => selectedLineItems.has(item.id));
        const additionalCost = selectedItems.reduce((sum, item) => sum + item.total, 0);
        
        // Create all bill line item allowances
        for (const item of selectedItems) {
          await createBillLineItemAllowanceMutation.mutateAsync({
            billLineItemId: item.id,
            amount: item.total,
          });
        }
        
        // Add to existing actual cost
        const newActualCost = currentActualCost + additionalCost;
        await updateAllowanceMutation.mutateAsync({ actualCost: newActualCost });
        
        // Refetch to ensure fresh data for next save
        await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
        setSelectedLineItems(new Set());
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save PC allowance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPc(false);
    }
  };

  // Handle saving PS item
  const handleSavePsItem = async () => {
    // Early return if nothing selected or already saving
    if (selectedPsLineItems.size === 0 && selectedTimesheets.size === 0 && customLines.length === 0) {
      return;
    }
    if (isSavingPs) return; // Prevent concurrent saves
    
    setIsSavingPs(true);
    try {
      let additionalCost = 0;

      // 1. Create bill line item allowances
      if (selectedPsLineItems.size > 0) {
        const selectedItems = psBillLineItems.filter(item => selectedPsLineItems.has(item.id));
        for (const item of selectedItems) {
          await createBillLineItemAllowanceMutation.mutateAsync({
            billLineItemId: item.id,
            amount: item.total,
          });
          additionalCost += item.total;
        }
      }

      // 2. Create timesheet allowances
      if (selectedTimesheets.size > 0) {
        const selectedItems = timesheets.filter(ts => selectedTimesheets.has(ts.id));
        for (const timesheet of selectedItems) {
          await createTimesheetAllowanceMutation.mutateAsync({
            timesheetId: timesheet.id,
            amount: timesheet.total,
          });
          additionalCost += timesheet.total;
        }
      }

      // 3. Create custom line items
      if (customLines.length > 0) {
        for (let i = 0; i < customLines.length; i++) {
          const line = customLines[i];
          await createAllowanceItemMutation.mutateAsync({
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            totalPrice: line.total,
            sortOrder: i,
          });
          additionalCost += line.total;
        }
      }

      // 4. Add to existing actual cost
      const currentActualCost = allowance?.actualCost || 0;
      const newActualCost = currentActualCost + additionalCost;
      await updateAllowanceMutation.mutateAsync({ actualCost: newActualCost });

      // 5. Refetch to ensure fresh data for next save
      await queryClient.refetchQueries({ queryKey: ["/api/projects", projectId, "allowances"] });

      // 6. Clear all selections after successful save and refetch
      setSelectedPsLineItems(new Set());
      setSelectedTimesheets(new Set());
      setCustomLines([]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save PS allowance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingPs(false);
    }
  };

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const allowance = allowances.find(a => a.item.id === allowanceId);

  const toggleBillExpanded = (billId: string) => {
    const newExpanded = new Set(expandedBills);
    if (newExpanded.has(billId)) {
      newExpanded.delete(billId);
    } else {
      newExpanded.add(billId);
    }
    setExpandedBills(newExpanded);
  };

  const toggleLineItemSelection = (lineItemId: string) => {
    const newSelected = new Set(selectedLineItems);
    if (newSelected.has(lineItemId)) {
      newSelected.delete(lineItemId);
    } else {
      newSelected.add(lineItemId);
    }
    setSelectedLineItems(newSelected);
  };

  const togglePsBillExpanded = (billId: string) => {
    const newExpanded = new Set(expandedPsBills);
    if (newExpanded.has(billId)) {
      newExpanded.delete(billId);
    } else {
      newExpanded.add(billId);
    }
    setExpandedPsBills(newExpanded);
  };

  const togglePsLineItemSelection = (lineItemId: string) => {
    const newSelected = new Set(selectedPsLineItems);
    if (newSelected.has(lineItemId)) {
      newSelected.delete(lineItemId);
    } else {
      newSelected.add(lineItemId);
    }
    setSelectedPsLineItems(newSelected);
  };

  const toggleTimesheetSelection = (timesheetId: string) => {
    const newSelected = new Set(selectedTimesheets);
    if (newSelected.has(timesheetId)) {
      newSelected.delete(timesheetId);
    } else {
      newSelected.add(timesheetId);
    }
    setSelectedTimesheets(newSelected);
  };

  const handleAddCustomLine = () => {
    if (!customLineDescription || !customLineUnitPrice) return;
    
    const quantity = parseInt(customLineQuantity) || 1;
    const unitPrice = Math.round(parseFloat(customLineUnitPrice) * 100); // Convert to cents
    const total = quantity * unitPrice;
    
    const newLine: CustomLine = {
      id: `custom-${Date.now()}`,
      description: customLineDescription,
      quantity,
      unitPrice,
      total,
    };
    
    setCustomLines([...customLines, newLine]);
    setCustomLineDescription("");
    setCustomLineQuantity("1");
    setCustomLineUnitPrice("");
    setIsCustomLineDialogOpen(false);
  };

  const handleRemoveCustomLine = (id: string) => {
    setCustomLines(customLines.filter(line => line.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!allowance) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <Button
            variant="ghost"
            onClick={() => setLocation(`/projects/${projectId}/allowances`)}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Allowances
          </Button>
          <Card className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">Allowance Not Found</h3>
            <p className="text-muted-foreground">
              The requested allowance could not be found.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  const { item, actualCost, variance } = allowance;
  const statusInfo = getStatusInfo(item.allowanceStatus);
  const isPrimeCost = item.allowance === "Prime Cost";

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6">
        <Button
          variant="ghost"
          onClick={() => setLocation(`/projects/${projectId}/allowances`)}
          className="mb-4"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Allowances
        </Button>

        {/* Header Card */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <CardTitle className="text-2xl">{item.name}</CardTitle>
                  <Badge
                    style={{
                      backgroundColor: `${statusInfo.color || "#6B7280"}15`,
                      color: statusInfo.color || "#6B7280",
                    }}
                    className="border-0"
                    data-testid="badge-status"
                  >
                    {statusInfo.name}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isPrimeCost ? "Prime Cost (PC) Item" : "Provisional Sum (PS) Item"} • {item.estimateName} (v{item.estimateVersion})
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Estimate Price</p>
                <p className="text-xl font-semibold" data-testid="text-estimate-price">
                  {formatCurrency(item.priceIncTax)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Actual Price</p>
                <p className="text-xl font-semibold" data-testid="text-actual-price">
                  {formatCurrency(actualCost)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Variance</p>
                <p 
                  className={`text-xl font-semibold ${variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}`}
                  data-testid="text-variance"
                >
                  {variance > 0 ? "+" : ""}{formatCurrency(Math.abs(variance))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content based on type */}
        {isPrimeCost ? (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Actual Cost</CardTitle>
                <CardDescription>
                  Enter the actual cost or select from bill line items
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="actualCost">Actual Cost (excl. markup)</Label>
                  <Input
                    id="actualCost"
                    type="number"
                    step="0.01"
                    placeholder="Enter cost"
                    value={enteredActualCost}
                    onChange={(e) => setEnteredActualCost(e.target.value)}
                    data-testid="input-actual-cost"
                  />
                </div>
                <div className="flex justify-end">
                  <Button 
                    onClick={handleSavePcItem}
                    disabled={(!enteredActualCost && selectedLineItems.size === 0) || isSavingPc}
                    data-testid="button-save-pc-item"
                  >
                    {isSavingPc ? "Saving..." : "Save"}
                  </Button>
                </div>
                <Dialog open={isBillModalOpen} onOpenChange={setIsBillModalOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      data-testid="button-select-from-bills"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Select from Bills
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                      <DialogTitle>Select Bill Line Items</DialogTitle>
                      <DialogDescription>
                        Choose bill line items to allocate to this allowance
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-auto">
                      {bills.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          No bills found for this project
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {bills.map((bill) => {
                            const lineItems = billLineItems.filter(item => item.billId === bill.id);
                            const isExpanded = expandedBills.has(bill.id);
                            
                            return (
                              <Card key={bill.id}>
                                <CardHeader 
                                  className="cursor-pointer hover-elevate py-3"
                                  onClick={() => toggleBillExpanded(bill.id)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                      <div>
                                        <p className="font-semibold">{bill.billNumber}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {new Date(bill.billDate).toLocaleDateString("en-AU")}
                                          {bill.billReference && ` • ${bill.billReference}`}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="font-semibold">{formatCurrency(bill.total)}</p>
                                  </div>
                                </CardHeader>
                                {isExpanded && lineItems.length > 0 && (
                                  <CardContent className="pt-0">
                                    <div className="space-y-2">
                                      {lineItems.map((lineItem) => (
                                        <div 
                                          key={lineItem.id}
                                          className="flex items-center justify-between p-2 rounded border hover-elevate"
                                        >
                                          <div className="flex items-center gap-3 flex-1">
                                            <Checkbox
                                              checked={selectedLineItems.has(lineItem.id)}
                                              onCheckedChange={() => toggleLineItemSelection(lineItem.id)}
                                              data-testid={`checkbox-line-item-${lineItem.id}`}
                                            />
                                            <div className="flex-1">
                                              <p className="text-sm font-medium">{lineItem.description}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {lineItem.quantity} × {formatCurrency(lineItem.unitPrice)}
                                              </p>
                                            </div>
                                          </div>
                                          <p className="text-sm font-semibold">
                                            {formatCurrency(lineItem.total)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                )}
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setIsBillModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => setIsBillModalOpen(false)}
                        data-testid="button-save-selections"
                      >
                        Add Selected
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Selected Bill Line Items</CardTitle>
                <CardDescription>
                  Bill line items allocated to this allowance
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedLineItems.size === 0 ? (
                  <p className="text-sm text-muted-foreground">No bill line items selected</p>
                ) : (
                  <div className="space-y-2">
                    {billLineItems
                      .filter(item => selectedLineItems.has(item.id))
                      .map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 rounded border">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{item.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} × {formatCurrency(item.unitPrice)}
                            </p>
                          </div>
                          <p className="text-sm font-semibold">{formatCurrency(item.total)}</p>
                        </div>
                      ))}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <p className="font-semibold">Total</p>
                      <p className="font-semibold">
                        {formatCurrency(
                          billLineItems
                            .filter(item => selectedLineItems.has(item.id))
                            .reduce((sum, item) => sum + item.total, 0)
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Bills Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Bills</CardTitle>
                    <CardDescription>
                      Bill line items allocated to this allowance
                    </CardDescription>
                  </div>
                  <Dialog open={isPsBillModalOpen} onOpenChange={setIsPsBillModalOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-add-bills"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Bills
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>Add Bill Line Items</DialogTitle>
                        <DialogDescription>
                          Select bill line items to add to this PS allowance
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 overflow-auto">
                        {psBills.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No bills found for this project
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {psBills.map((bill) => {
                              const lineItems = psBillLineItems.filter(item => item.billId === bill.id);
                              const isExpanded = expandedPsBills.has(bill.id);
                              
                              return (
                                <Card key={bill.id}>
                                  <CardHeader 
                                    className="cursor-pointer hover-elevate py-3"
                                    onClick={() => togglePsBillExpanded(bill.id)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {isExpanded ? (
                                          <ChevronDown className="h-4 w-4" />
                                        ) : (
                                          <ChevronRight className="h-4 w-4" />
                                        )}
                                        <div>
                                          <p className="font-semibold">{bill.billNumber}</p>
                                          <p className="text-sm text-muted-foreground">
                                            {new Date(bill.billDate).toLocaleDateString("en-AU")}
                                            {bill.billReference && ` • ${bill.billReference}`}
                                          </p>
                                        </div>
                                      </div>
                                      <p className="font-semibold">{formatCurrency(bill.total)}</p>
                                    </div>
                                  </CardHeader>
                                  {isExpanded && lineItems.length > 0 && (
                                    <CardContent className="pt-0">
                                      <div className="space-y-2">
                                        {lineItems.map((lineItem) => (
                                          <div 
                                            key={lineItem.id}
                                            className="flex items-center justify-between p-2 rounded border hover-elevate"
                                          >
                                            <div className="flex items-center gap-3 flex-1">
                                              <Checkbox
                                                checked={selectedPsLineItems.has(lineItem.id)}
                                                onCheckedChange={() => togglePsLineItemSelection(lineItem.id)}
                                                data-testid={`checkbox-ps-line-item-${lineItem.id}`}
                                              />
                                              <div className="flex-1">
                                                <p className="text-sm font-medium">{lineItem.description}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {lineItem.quantity} × {formatCurrency(lineItem.unitPrice)}
                                                </p>
                                              </div>
                                            </div>
                                            <p className="text-sm font-semibold">
                                              {formatCurrency(lineItem.total)}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </CardContent>
                                  )}
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsPsBillModalOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => setIsPsBillModalOpen(false)}
                          data-testid="button-save-ps-bills"
                        >
                          Add Selected
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No bills allocated</p>
              </CardContent>
            </Card>

            {/* Timesheets Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Timesheets</CardTitle>
                    <CardDescription>
                      Timesheet entries allocated to this allowance
                    </CardDescription>
                  </div>
                  <Dialog open={isTimesheetModalOpen} onOpenChange={setIsTimesheetModalOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-add-timesheets"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Timesheets
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                      <DialogHeader>
                        <DialogTitle>Add Timesheets</DialogTitle>
                        <DialogDescription>
                          Select timesheet entries to add to this PS allowance
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex-1 overflow-auto">
                        {timesheets.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No timesheets found for this project
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {timesheets.map((timesheet) => (
                              <div
                                key={timesheet.id}
                                className="flex items-center justify-between p-3 rounded border hover-elevate"
                              >
                                <div className="flex items-center gap-3 flex-1">
                                  <Checkbox
                                    checked={selectedTimesheets.has(timesheet.id)}
                                    onCheckedChange={() => toggleTimesheetSelection(timesheet.id)}
                                    data-testid={`checkbox-timesheet-${timesheet.id}`}
                                  />
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="text-sm font-medium">
                                        {new Date(timesheet.date).toLocaleDateString("en-AU")}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {timesheet.startTime} - {timesheet.endTime} ({timesheet.duration}h)
                                      </p>
                                    </div>
                                    {timesheet.description && (
                                      <p className="text-xs text-muted-foreground">{timesheet.description}</p>
                                    )}
                                  </div>
                                </div>
                                <p className="text-sm font-semibold">
                                  {formatCurrency(timesheet.total)}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setIsTimesheetModalOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => setIsTimesheetModalOpen(false)}
                          data-testid="button-save-timesheets"
                        >
                          Add Selected
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">No timesheets allocated</p>
              </CardContent>
            </Card>

            {/* Custom Lines Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Custom Lines</CardTitle>
                    <CardDescription>
                      Additional line items for this allowance
                    </CardDescription>
                  </div>
                  <Dialog open={isCustomLineDialogOpen} onOpenChange={setIsCustomLineDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        data-testid="button-add-custom-line"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Line
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Custom Line</DialogTitle>
                        <DialogDescription>
                          Add a custom line item to this allowance
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            value={customLineDescription}
                            onChange={(e) => setCustomLineDescription(e.target.value)}
                            placeholder="Enter description"
                            data-testid="input-custom-description"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="quantity">Quantity</Label>
                            <Input
                              id="quantity"
                              type="number"
                              value={customLineQuantity}
                              onChange={(e) => setCustomLineQuantity(e.target.value)}
                              placeholder="1"
                              data-testid="input-custom-quantity"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="unitPrice">Unit Price</Label>
                            <Input
                              id="unitPrice"
                              type="number"
                              step="0.01"
                              value={customLineUnitPrice}
                              onChange={(e) => setCustomLineUnitPrice(e.target.value)}
                              placeholder="0.00"
                              data-testid="input-custom-unit-price"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-4">
                        <Button variant="outline" onClick={() => setIsCustomLineDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={handleAddCustomLine}
                          disabled={!customLineDescription || !customLineUnitPrice}
                          data-testid="button-save-custom-line"
                        >
                          Add Line
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {customLines.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No custom lines added</p>
                ) : (
                  <div className="space-y-2">
                    {customLines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center justify-between p-2 rounded border"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">{line.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {line.quantity} × {formatCurrency(line.unitPrice)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold">{formatCurrency(line.total)}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveCustomLine(line.id)}
                            data-testid={`button-remove-custom-line-${line.id}`}
                          >
                            <Plus className="h-4 w-4 rotate-45" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Save Button for PS Items */}
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSavePsItem}
                disabled={
                  (selectedPsLineItems.size === 0 &&
                  selectedTimesheets.size === 0 &&
                  customLines.length === 0) ||
                  isSavingPs
                }
                data-testid="button-save-ps-item"
              >
                {isSavingPs ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
