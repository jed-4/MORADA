import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Lock, 
  Unlock, 
  FileText, 
  Calculator,
  Plus,
  Edit,
  Trash2
} from "lucide-react";
import { type Estimate, type EstimateItem, type EstimateSummary, type Project } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface EstimateDetailParams {
  id: string;
}

export default function EstimateDetail() {
  const { id } = useParams<EstimateDetailParams>();
  const [, setLocation] = useLocation();

  if (!id) {
    return <div>Invalid estimate ID</div>;
  }

  // Fetch estimate details
  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery<Estimate>({
    queryKey: ["/api/estimates", id],
  });

  // Fetch estimate items
  const { data: items = [], isLoading: itemsLoading } = useQuery<EstimateItem[]>({
    queryKey: ["/api/estimates", id, "items"],
    enabled: !!id,
  });

  // Fetch estimate summary
  const { data: summary } = useQuery<EstimateSummary>({
    queryKey: ["/api/estimates", id, "summary"],
    enabled: !!id,
  });

  // Fetch project details
  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", estimate?.projectId],
    enabled: !!estimate?.projectId,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  const formatQuantity = (quantity: number, unitType: string | null) => {
    return `${quantity}${unitType ? ` ${unitType}` : ''}`;
  };

  if (estimateLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div className="h-6 bg-gray-300 rounded w-48 animate-pulse"></div>
          </div>
        </div>
        <div className="flex-1 p-4">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-300 rounded"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (estimateError || !estimate) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Estimate Not Found</h2>
            <p className="text-muted-foreground">
              The estimate you're looking for doesn't exist or has been removed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (estimate: Estimate) => {
    if (estimate.isLocked) {
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700"><Lock className="w-3 h-3 mr-1" />Locked v{estimate.version}</Badge>;
    }
    return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" />Draft v{estimate.version}</Badge>;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/estimates")} data-testid="button-back-to-estimates">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Estimates
            </Button>
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-estimate-title">
                {estimate.name}
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="text-project-name">
                Project: {project?.name || 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusBadge(estimate)}
            <Button variant="outline" size="sm" data-testid="button-edit-estimate">
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
            <Button variant="outline" size="sm" data-testid="button-toggle-lock">
              {estimate.isLocked ? (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Unlock
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Lock
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-6">
          {/* Summary Cards */}
          {summary && (
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Subtotal</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-subtotal">
                    {formatCurrency(summary.subtotal)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ex-tax
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Markup ({estimate.projectMarkupPercent}%)</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-markup">
                    {formatCurrency(summary.markupAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estimate.projectMarkupPercent}% of subtotal
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">GST ({estimate.taxRate}%)</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-tax">
                    {formatCurrency(summary.taxAmount)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estimate.taxRate}% on marked-up total
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600" data-testid="text-total">
                    {formatCurrency(summary.total)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Final amount
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Items Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 mr-2" />
                Estimate Items ({items.length})
              </CardTitle>
              <Button size="sm" data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="animate-pulse space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-300 rounded"></div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No items added yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Add your first estimate item to start building this estimate.
                  </p>
                  <Button data-testid="button-add-first-item">
                    <Plus className="w-4 h-4 mr-2" />
                    Add First Item
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Price Ex-Tax</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Total Inc-Tax</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground">{item.description}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.type}</Badge>
                        </TableCell>
                        <TableCell>{formatQuantity(item.quantity, item.unitType)}</TableCell>
                        <TableCell>{formatCurrency(item.priceExTax)}</TableCell>
                        <TableCell>{formatCurrency(item.taxAmount)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.priceIncTax)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={item.status === 'confirmed' ? 'default' : 'secondary'}
                            className={item.status === 'confirmed' ? 'bg-green-100 text-green-700' : ''}
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" data-testid={`button-edit-item-${item.id}`}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" data-testid={`button-delete-item-${item.id}`}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}