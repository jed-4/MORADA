import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Target, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Budget, BudgetLineItem } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function BudgetPage() {
  const { projectId } = useParams();
  const { toast } = useToast();

  // Fetch budget for this project
  const { data: budget, isLoading: budgetLoading } = useQuery<Budget>({
    queryKey: [`/api/projects/${projectId}/budget`],
    enabled: !!projectId,
  });

  // Fetch budget line items
  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery<BudgetLineItem[]>({
    queryKey: [`/api/budgets/${budget?.id}/line-items`],
    enabled: !!budget?.id,
  });

  // Recalculate budget mutation
  const recalculateMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/projects/${projectId}/budget/calculate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/budget`] });
      toast({
        title: "Budget recalculated",
        description: "Budget has been updated with latest data from estimates and bills.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  // Recalculate line items mutation
  const recalculateLineItemsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/budgets/${budget?.id}/line-items/recalculate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/budgets/${budget?.id}/line-items`] });
      toast({
        title: "Line items recalculated",
        description: "Budget breakdown has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  const getVarianceColor = (variance: number) => {
    if (variance > 0) return "text-green-600 dark:text-green-400";
    if (variance < 0) return "text-red-600 dark:text-red-400";
    return "text-muted-foreground";
  };

  const getVarianceBadgeVariant = (variance: number): "default" | "destructive" | "outline" => {
    if (variance > 0) return "default";
    if (variance < 0) return "destructive";
    return "outline";
  };

  if (budgetLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const budgetData = budget || {
    baselineAmount: 0,
    revisedAmount: 0,
    actualAmount: 0,
    forecastAmount: 0,
    varianceAmount: 0,
    profitPercent: 0,
  };

  const remaining = budgetData.revisedAmount - budgetData.actualAmount;
  const percentSpent = budgetData.revisedAmount > 0 
    ? Math.round((budgetData.actualAmount / budgetData.revisedAmount) * 100) 
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-budget">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-budget-title">Budget</h1>
          <p className="text-muted-foreground mt-1">
            Track project costs and financial performance
          </p>
        </div>
        <Button
          onClick={() => {
            recalculateMutation.mutate();
            if (budget?.id) {
              recalculateLineItemsMutation.mutate();
            }
          }}
          disabled={recalculateMutation.isPending || recalculateLineItemsMutation.isPending}
          data-testid="button-recalculate"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${recalculateMutation.isPending ? 'animate-spin' : ''}`} />
          Recalculate
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-budget">
              {formatCurrency(budgetData.revisedAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Baseline: {formatCurrency(budgetData.baselineAmount)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actual Spent</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-actual-spent">
              {formatCurrency(budgetData.actualAmount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {percentSpent}% of budget
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getVarianceColor(remaining)}`} data-testid="text-remaining">
              {formatCurrency(remaining)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {100 - percentSpent}% remaining
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forecast</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-forecast">
              {formatCurrency(budgetData.forecastAmount)}
            </div>
            <p className={`text-xs mt-1 ${getVarianceColor(budgetData.varianceAmount)}`}>
              Variance: {formatCurrency(budgetData.varianceAmount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Code Breakdown</CardTitle>
          <CardDescription>
            Budget vs actual costs by cost code
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lineItemsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : lineItems.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No budget breakdown available</h3>
              <p className="text-muted-foreground mb-4">
                Click "Recalculate" to generate budget breakdown from your estimates and bills.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cost Code</TableHead>
                    <TableHead className="text-right">Budgeted</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Forecast</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item) => (
                    <TableRow key={item.id} data-testid={`row-budget-item-${item.id}`}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{item.costCodeTitle || "Uncategorized"}</div>
                          {item.categoryTitle && (
                            <div className="text-xs text-muted-foreground">{item.categoryTitle}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-budgeted-${item.id}`}>
                        {formatCurrency(item.budgetedAmount)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-actual-${item.id}`}>
                        {formatCurrency(item.actualAmount)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-forecast-${item.id}`}>
                        {formatCurrency(item.forecastAmount)}
                      </TableCell>
                      <TableCell className={`text-right ${getVarianceColor(item.variance)}`} data-testid={`text-variance-${item.id}`}>
                        {formatCurrency(item.variance)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={getVarianceBadgeVariant(item.variance)}>
                          {item.variance > 0 ? "Under" : item.variance < 0 ? "Over" : "On Track"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
