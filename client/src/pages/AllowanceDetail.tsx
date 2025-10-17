import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

export default function AllowanceDetail() {
  const { projectId, allowanceId } = useParams<{ projectId: string; allowanceId: string }>();
  const [, setLocation] = useLocation();
  const { getStatusInfo } = useAllowanceStatusOptions();
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());
  const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());

  // Fetch all allowances for the project
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  // Fetch bills for the project
  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ["/api/bills", { projectId }],
    enabled: isBillModalOpen,
  });

  // Fetch bill line items for the project
  const { data: billLineItems = [] } = useQuery<BillLineItem[]>({
    queryKey: ["/api/bill-line-items", { projectId }],
    enabled: isBillModalOpen,
  });

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
                    data-testid="input-actual-cost"
                  />
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
                      <Button data-testid="button-save-selections">
                        Save Selections
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
                <p className="text-sm text-muted-foreground">No bill line items selected</p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>PS Item Cost Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                Build up the final allowance price from bills, timesheets, and custom lines
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">PS item interface will go here</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
