import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export default function AllowanceDetail() {
  const { projectId, allowanceId } = useParams<{ projectId: string; allowanceId: string }>();
  const [, setLocation] = useLocation();
  const { getStatusInfo } = useAllowanceStatusOptions();

  // Fetch all allowances for the project
  const { data: allowances = [], isLoading } = useQuery<AllowanceWithCosts[]>({
    queryKey: ["/api/projects", projectId, "allowances"],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/allowances`);
      if (!response.ok) throw new Error("Failed to fetch allowances");
      return response.json();
    },
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
          <Card>
            <CardHeader>
              <CardTitle>PC Item Pricing</CardTitle>
              <p className="text-sm text-muted-foreground">
                Set the actual cost by entering a simple amount or selecting from bill line items
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">PC item interface will go here</p>
            </CardContent>
          </Card>
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
