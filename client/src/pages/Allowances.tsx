import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

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

const statusOptions = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "finalized", label: "Finalized" },
];

const statusColors = {
  pending: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  finalized: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

export default function Allowances() {
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();
  const [editingMarkup, setEditingMarkup] = useState<string | null>(null);
  const [markupValue, setMarkupValue] = useState<string>("");

  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      return apiRequest("PATCH", `/api/estimate-items/${itemId}`, { allowanceStatus: status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      toast({ title: "Status updated" });
    },
  });

  const updateMarkupMutation = useMutation({
    mutationFn: async ({ itemId, markup }: { itemId: string; markup: number }) => {
      return apiRequest("PATCH", `/api/estimate-items/${itemId}`, { pcMarkupPercent: markup });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "allowances"] });
      setEditingMarkup(null);
      toast({ title: "Markup updated" });
    },
  });

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    // Check if it's a whole number
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const handleMarkupEdit = (itemId: string, currentMarkup: number | null) => {
    setEditingMarkup(itemId);
    setMarkupValue(currentMarkup?.toString() || "0");
  };

  const handleMarkupSave = (itemId: string) => {
    const markup = parseFloat(markupValue) || 0;
    updateMarkupMutation.mutate({ itemId, markup });
  };

  const pcItems = allowances.filter(a => a.item.allowance === "Prime Cost");
  const psItems = allowances.filter(a => a.item.allowance === "Provisional Sum");

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-semibold">Allowances</h1>
          </div>
          <div className="space-y-4">
            <Card className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-semibold">Allowances</h1>
            <p className="text-muted-foreground mt-1">
              Track Prime Cost and Provisional Sum items from estimates
            </p>
          </div>
        </div>

        {allowances.length === 0 ? (
          <Card className="p-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Allowances</h3>
            <p className="text-muted-foreground">
              Create estimate items with Prime Cost or Provisional Sum allowances to see them here.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {pcItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Prime Cost (PC) Items</h2>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Estimate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Original Amount</TableHead>
                        <TableHead className="text-right">PC Markup</TableHead>
                        <TableHead className="text-right">Actual Cost</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pcItems.map(({ item, actualCost, variance }) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{item.estimateName}</div>
                              <div className="text-muted-foreground">v{item.estimateVersion}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.allowanceStatus}
                              onValueChange={(value) =>
                                updateStatusMutation.mutate({ itemId: item.id, status: value })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              <SelectTrigger
                                className="w-[140px]"
                                data-testid={`select-status-${item.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-original-${item.id}`}>
                            {formatCurrency(item.priceIncTax)}
                          </TableCell>
                          <TableCell className="text-right">
                            {editingMarkup === item.id ? (
                              <div className="flex items-center gap-2 justify-end">
                                <Input
                                  type="number"
                                  value={markupValue}
                                  onChange={(e) => setMarkupValue(e.target.value)}
                                  className="w-20"
                                  data-testid={`input-markup-${item.id}`}
                                />
                                <span className="text-sm">%</span>
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkupSave(item.id)}
                                  disabled={updateMarkupMutation.isPending}
                                  data-testid={`button-save-markup-${item.id}`}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setEditingMarkup(null)}
                                  data-testid={`button-cancel-markup-${item.id}`}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleMarkupEdit(item.id, item.pcMarkupPercent)}
                                data-testid={`button-edit-markup-${item.id}`}
                              >
                                {item.pcMarkupPercent || 0}%
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                            {formatCurrency(actualCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {variance > 0 ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : variance < 0 ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : null}
                              <span
                                className={variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}
                                data-testid={`text-variance-${item.id}`}
                              >
                                {formatCurrency(Math.abs(variance))}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}

            {psItems.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Provisional Sum (PS) Items</h2>
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Estimate</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Original Amount</TableHead>
                        <TableHead className="text-right">Actual Cost</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {psItems.map(({ item, actualCost, variance }) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{item.estimateName}</div>
                              <div className="text-muted-foreground">v{item.estimateVersion}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.allowanceStatus}
                              onValueChange={(value) =>
                                updateStatusMutation.mutate({ itemId: item.id, status: value })
                              }
                              disabled={updateStatusMutation.isPending}
                            >
                              <SelectTrigger
                                className="w-[140px]"
                                data-testid={`select-status-${item.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {statusOptions.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-original-${item.id}`}>
                            {formatCurrency(item.priceIncTax)}
                          </TableCell>
                          <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                            {formatCurrency(actualCost)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {variance > 0 ? (
                                <TrendingUp className="h-4 w-4 text-red-500" />
                              ) : variance < 0 ? (
                                <TrendingDown className="h-4 w-4 text-green-500" />
                              ) : null}
                              <span
                                className={variance > 0 ? "text-red-500" : variance < 0 ? "text-green-500" : ""}
                                data-testid={`text-variance-${item.id}`}
                              >
                                {formatCurrency(Math.abs(variance))}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
