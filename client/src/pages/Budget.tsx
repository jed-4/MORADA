import { useParams } from "wouter";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Target, AlertCircle, Clock, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Budget, BudgetLineItem, LabourHoursBudget, Project } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const PHASE_LABELS: Record<string, string> = {
  lead: "Lead",
  pre_construction: "Pre-Construction",
  construction: "Construction",
  post_construction: "Post-Construction",
  archive: "Archive",
};

export default function BudgetPage() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const pageTitle = usePageTitle({ pageName: "Budget" });
  const [activeTab, setActiveTab] = useState<"costs" | "hours">("costs");
  const [hideEmptyCostCodes, setHideEmptyCostCodes] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('budget-hide-empty-cost-codes');
      return saved ? JSON.parse(saved) : false;
    } catch { return false; }
  });

  // Fetch project to get current phase
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: budget, isLoading: budgetLoading } = useQuery<Budget>({
    queryKey: [`/api/projects/${projectId}/budget`],
    enabled: !!projectId,
  });

  const { data: lineItems = [], isLoading: lineItemsLoading } = useQuery<BudgetLineItem[]>({
    queryKey: [`/api/budgets/${budget?.id}/line-items`],
    enabled: !!budget?.id,
  });

  const { data: labourHours = [], isLoading: labourHoursLoading } = useQuery<LabourHoursBudget[]>({
    queryKey: [`/api/projects/${projectId}/labour-hours-budget`],
    enabled: !!projectId,
  });

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

  const recalculateLabourHoursMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/projects/${projectId}/labour-hours-budget/recalculate`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/labour-hours-budget`] });
      toast({
        title: "Labour hours recalculated",
        description: "Hours budget has been updated from labour estimate items.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to recalculate hours",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    }
  });

  const formatCurrency = (cents: number) => {
    const dollars = cents / 100;
    const isWholeNumber = dollars % 1 === 0;
    
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: isWholeNumber ? 0 : 2,
      maximumFractionDigits: 2
    }).format(dollars);
  };

  const formatHours = (hours: string | number) => {
    const numHours = typeof hours === 'string' ? parseFloat(hours) : hours;
    return `${numHours.toFixed(1)}hrs`;
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

  const totalBudgetedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.budgetedHours || "0"), 0);
  const totalPendingHours = labourHours.reduce((sum, item) => sum + parseFloat(item.pendingHours || "0"), 0);
  const totalApprovedHours = labourHours.reduce((sum, item) => sum + parseFloat(item.approvedHours || "0"), 0);
  const totalActualHours = totalPendingHours + totalApprovedHours;
  const hoursRemaining = totalBudgetedHours - totalActualHours;
  const hoursPercentUsed = totalBudgetedHours > 0 ? Math.round((totalActualHours / totalBudgetedHours) * 100) : 0;

  const filteredLabourHours = hideEmptyCostCodes
    ? labourHours.filter(item => {
        const budgeted = parseFloat(item.budgetedHours || "0");
        const pending = parseFloat(item.pendingHours || "0");
        const approved = parseFloat(item.approvedHours || "0");
        return budgeted !== 0 || pending !== 0 || approved !== 0;
      })
    : labourHours;

  const handleToggleEmpty = (checked: boolean) => {
    setHideEmptyCostCodes(checked);
    try { localStorage.setItem('budget-hide-empty-cost-codes', JSON.stringify(checked)); } catch {}
  };

  const handleRecalculate = () => {
    if (activeTab === "costs") {
      recalculateMutation.mutate();
      if (budget?.id) {
        recalculateLineItemsMutation.mutate();
      }
    } else {
      recalculateLabourHoursMutation.mutate();
    }
  };

  const isRecalculating = activeTab === "costs" 
    ? (recalculateMutation.isPending || recalculateLineItemsMutation.isPending)
    : recalculateLabourHoursMutation.isPending;

  if (budgetLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="h-9 bg-background flex items-center px-2 gap-4 flex-shrink-0">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="h-9 bg-background flex items-center px-2 border-b border-border flex-shrink-0">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="p-2 space-y-2">
          <div className="grid gap-2 grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
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
    <div className="flex flex-col h-full" data-testid="page-budget">
      {/* Row 1 - Title & Actions (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold" data-testid="text-budget-title">
            {pageTitle}
          </h2>
          {project?.currentSystemPhase && (
            <Badge 
              variant="outline" 
              className="text-xs bg-[#bba7db]/10 text-[#bba7db] border-[#bba7db]/30"
              data-testid="badge-project-phase"
            >
              {PHASE_LABELS[project.currentSystemPhase] || project.currentSystemPhase}
            </Badge>
          )}
          {activeTab === "costs" && (
            <Badge variant="secondary" className="text-xs">
              {lineItems.length} cost codes
            </Badge>
          )}
          {activeTab === "hours" && (
            <Badge variant="secondary" className="text-xs">
              {labourHours.length} items
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            className="h-6 w-auto px-2 text-xs border rounded-md bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90 active-elevate-2 flex items-center gap-1 disabled:opacity-50"
            onClick={handleRecalculate}
            disabled={isRecalculating}
            data-testid="button-recalculate"
          >
            <RefreshCw className={`w-3 h-3 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>
        </div>
      </div>

      {/* Row 2 - Tabs (36px) */}
      <div className="h-9 bg-background flex items-center justify-between px-2 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('costs')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === 'costs' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-costs"
          >
            <DollarSign className="w-3 h-3" />
            <span>Costs</span>
          </button>
          <button
            onClick={() => setActiveTab('hours')}
            className={`h-6 w-auto px-2 text-xs border rounded-md ${
              activeTab === 'hours' 
                ? 'bg-[#bba7db] text-white border-[#bba7db]/20 hover:bg-[#bba7db]/90' 
                : 'hover-elevate'
            } active-elevate-2 flex items-center gap-1`}
            data-testid="tab-labour-hours"
          >
            <Clock className="w-3 h-3" />
            <span>Labour Hours</span>
          </button>
        </div>

        {/* Summary stats in header */}
        {activeTab === "costs" && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>Budget: <span className="font-medium text-foreground">{formatCurrency(budgetData.revisedAmount)}</span></span>
            <span>Spent: <span className="font-medium text-foreground">{formatCurrency(budgetData.actualAmount)}</span></span>
            <span className={getVarianceColor(remaining)}>Remaining: <span className="font-medium">{formatCurrency(remaining)}</span></span>
          </div>
        )}
        {activeTab === "hours" && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span>Budget: <span className="font-medium text-foreground">{formatHours(totalBudgetedHours)}</span></span>
            <span>Used: <span className="font-medium text-foreground">{formatHours(totalActualHours)}</span></span>
            <span className={getVarianceColor(hoursRemaining)}>Remaining: <span className="font-medium">{formatHours(hoursRemaining)}</span></span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2 space-y-2">
        {activeTab === "costs" && (
          <>
            {/* Compact Summary Cards */}
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Total Budget</p>
                    <p className="text-base font-bold" data-testid="text-total-budget">
                      {formatCurrency(budgetData.revisedAmount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Baseline: {formatCurrency(budgetData.baselineAmount)}
                    </p>
                  </div>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Actual Spent</p>
                    <p className="text-base font-bold" data-testid="text-actual-spent">
                      {formatCurrency(budgetData.actualAmount)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{percentSpent}% of budget</p>
                  </div>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Remaining</p>
                    <p className={`text-base font-bold ${getVarianceColor(remaining)}`} data-testid="text-remaining">
                      {formatCurrency(remaining)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{100 - percentSpent}% remaining</p>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Forecast</p>
                    <p className="text-base font-bold" data-testid="text-forecast">
                      {formatCurrency(budgetData.forecastAmount)}
                    </p>
                    <p className={`text-[10px] ${getVarianceColor(budgetData.varianceAmount)}`}>
                      Variance: {formatCurrency(budgetData.varianceAmount)}
                    </p>
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </div>

            {/* Cost Code Breakdown Table */}
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm">Cost Code Breakdown</CardTitle>
                <CardDescription className="text-xs">Budget vs actual costs by cost code</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {lineItemsLoading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : lineItems.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">No budget breakdown available</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Click "Recalculate" to generate budget breakdown from your estimates and bills.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Cost Code</TableHead>
                          <TableHead className="text-xs text-right">Budgeted</TableHead>
                          <TableHead className="text-xs text-right">Actual</TableHead>
                          <TableHead className="text-xs text-right">Forecast</TableHead>
                          <TableHead className="text-xs text-right">Variance</TableHead>
                          <TableHead className="text-xs text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lineItems.map((item) => (
                          <TableRow key={item.id} data-testid={`row-budget-item-${item.id}`}>
                            <TableCell className="text-xs">
                              <div>
                                <div className="font-medium">{item.costCodeTitle || "Uncategorized"}</div>
                                {item.categoryTitle && (
                                  <div className="text-[10px] text-muted-foreground">{item.categoryTitle}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-right" data-testid={`text-budgeted-${item.id}`}>
                              {formatCurrency(item.budgetedAmount)}
                            </TableCell>
                            <TableCell className="text-xs text-right" data-testid={`text-actual-${item.id}`}>
                              {formatCurrency(item.actualAmount)}
                            </TableCell>
                            <TableCell className="text-xs text-right" data-testid={`text-forecast-${item.id}`}>
                              {formatCurrency(item.forecastAmount)}
                            </TableCell>
                            <TableCell className={`text-xs text-right ${getVarianceColor(item.variance)}`} data-testid={`text-variance-${item.id}`}>
                              {formatCurrency(item.variance)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant={getVarianceBadgeVariant(item.variance)} className="h-4 px-1.5 text-[10px]">
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
          </>
        )}

        {activeTab === "hours" && (
          <>
            {/* Labour Hours Summary Cards */}
            <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Budgeted Hours</p>
                    <p className="text-base font-bold" data-testid="text-budgeted-hours">
                      {formatHours(totalBudgetedHours)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">From estimates</p>
                  </div>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Pending Hours</p>
                    <p className="text-base font-bold text-amber-600 dark:text-amber-400" data-testid="text-pending-hours">
                      {formatHours(totalPendingHours)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Awaiting approval</p>
                  </div>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Approved Hours</p>
                    <p className="text-base font-bold" data-testid="text-approved-hours">
                      {formatHours(totalApprovedHours)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{hoursPercentUsed}% of budget</p>
                  </div>
                  <TrendingDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Remaining</p>
                    <p className={`text-base font-bold ${getVarianceColor(hoursRemaining)}`} data-testid="text-remaining-hours">
                      {formatHours(hoursRemaining)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{100 - hoursPercentUsed}% remaining</p>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>

              <Card className="p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Efficiency</p>
                    <p className="text-base font-bold" data-testid="text-efficiency">
                      {hoursPercentUsed}%
                    </p>
                    <Progress value={hoursPercentUsed} className="mt-1 h-1.5" />
                  </div>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            </div>

            {/* Labour Hours Breakdown Table */}
            <Card>
              <CardHeader className="py-2 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm">Hours by Cost Code</CardTitle>
                    <CardDescription className="text-xs">Labour hours budget vs actual by cost code</CardDescription>
                  </div>
                  {labourHours.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Switch
                        id="hide-empty"
                        checked={hideEmptyCostCodes}
                        onCheckedChange={handleToggleEmpty}
                      />
                      <Label htmlFor="hide-empty" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                        Hide empty
                      </Label>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {labourHoursLoading ? (
                  <div className="p-3 space-y-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : labourHours.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <h3 className="text-sm font-semibold mb-1">No labour hours budget</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Click "Recalculate" to generate hours budget from estimates and timesheets.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Cost Code</TableHead>
                          <TableHead className="text-xs text-right">Budgeted</TableHead>
                          <TableHead className="text-xs text-right">Pending</TableHead>
                          <TableHead className="text-xs text-right">Approved</TableHead>
                          <TableHead className="text-xs text-right">Total</TableHead>
                          <TableHead className="text-xs text-right">Variance</TableHead>
                          <TableHead className="text-xs text-right">% Used</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLabourHours.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                              {hideEmptyCostCodes ? "All cost codes have zero hours. Turn off \"Hide empty\" to see all." : "No labour hours data available."}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredLabourHours.map((item) => {
                          const budgeted = parseFloat(item.budgetedHours || "0");
                          const pending = parseFloat(item.pendingHours || "0");
                          const approved = parseFloat(item.approvedHours || "0");
                          const total = pending + approved;
                          const variance = budgeted - total;
                          const percentUsed = budgeted > 0 ? Math.round((total / budgeted) * 100) : 0;

                          return (
                            <TableRow key={item.id} data-testid={`row-labour-hours-${item.id}`}>
                              <TableCell className="text-xs">
                                <div>
                                  <div className="font-medium">{item.costCodeTitle || "Uncategorized"}</div>
                                  {item.categoryTitle && (
                                    <div className="text-[10px] text-muted-foreground">{item.categoryTitle}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-right" data-testid={`text-budgeted-${item.id}`}>
                                {formatHours(budgeted)}
                              </TableCell>
                              <TableCell className="text-xs text-right text-amber-600 dark:text-amber-400" data-testid={`text-pending-${item.id}`}>
                                {formatHours(pending)}
                              </TableCell>
                              <TableCell className="text-xs text-right" data-testid={`text-approved-${item.id}`}>
                                {formatHours(approved)}
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium" data-testid={`text-total-${item.id}`}>
                                {formatHours(total)}
                              </TableCell>
                              <TableCell className={`text-xs text-right ${getVarianceColor(variance)}`} data-testid={`text-variance-${item.id}`}>
                                {formatHours(variance)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xs">{percentUsed}%</span>
                                  <Progress value={percentUsed} className="w-12 h-1.5" />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
