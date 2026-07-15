import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Check, X, FileText, TrendingDown, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import type { RfqQuote, Rfq } from "@shared/schema";

interface QuoteComparisonViewProps {
  rfqId: string;
  quotes: RfqQuote[];
  rfq?: Rfq;
}

export function QuoteComparisonView({ rfqId, quotes, rfq }: QuoteComparisonViewProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const acceptMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      return apiRequest(`/api/rfq-quotes/${quoteId}`, "PATCH", {
        status: "accepted",
        acceptedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfqId, "quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfqId] });
      toast({
        title: "Quote accepted",
        description: "The supplier quote has been accepted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error accepting quote",
        description: error.message || "Failed to accept quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      return apiRequest(`/api/rfq-quotes/${quoteId}`, "PATCH", {
        status: "declined",
        declinedAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfqId, "quotes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfqId] });
      toast({
        title: "Quote declined",
        description: "The supplier quote has been declined.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error declining quote",
        description: error.message || "Failed to decline quote. Please try again.",
        variant: "destructive",
      });
    },
  });

  const convertToPOMutation = useMutation({
    mutationFn: async (quote: RfqQuote) => {
      const poData = {
        projectId: rfq?.projectId,
        supplierId: quote.supplierId,
        supplierName: quote.supplierName || "",
        description: `PO from RFQ ${rfq?.rfqNumber} - ${rfq?.title || ""}`,
        rfqId: rfqId,
        rfqQuoteId: quote.id,
        subtotal: quote.totalAmount,
        gst: Math.round(quote.totalAmount * 0.1),
        total: quote.totalAmount + Math.round(quote.totalAmount * 0.1),
        status: "draft",
      };
      return apiRequest("/api/purchase-orders", "POST", poData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({
        title: "Purchase Order Created",
        description: "The quote has been converted to a Purchase Order.",
      });
      if (rfq?.projectId) {
        navigate(`/projects/${rfq.projectId}/purchase-orders/${data.id}`);
      } else {
        navigate(`/purchase-orders/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error creating Purchase Order",
        description: error.message || "Failed to create Purchase Order. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (quotes.length === 0) {
    return null;
  }

  // Find the lowest quote
  const lowestQuote = quotes.reduce((min, quote) => 
    quote.totalAmount < min.totalAmount ? quote : min
  , quotes[0]);

  return (
    <div className="space-y-4">
      {/* Mobile: Card view */}
      <div className="md:hidden space-y-4">
        {quotes.map((quote) => {
          const isLowest = quote.id === lowestQuote.id && quotes.length > 1;
          
          return (
            <Card key={quote.id} className="p-4" data-testid={`quote-card-${quote.id}`}>
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-medium text-lg mb-1">
                      {quote.supplierName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Uploaded {format(new Date(quote.createdAt), "MMM d, yyyy")}
                    </div>
                  </div>
                  <Badge
                    variant={
                      quote.status === "accepted"
                        ? "default"
                        : quote.status === "declined"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {quote.status}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold">
                    ${(quote.totalAmount / 100).toFixed(2)}
                  </div>
                  {isLowest && (
                    <Badge variant="default" className="gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Best Price
                    </Badge>
                  )}
                </div>

                {quote.notes && (
                  <div className="text-sm text-muted-foreground">
                    {quote.notes}
                  </div>
                )}

                {quote.attachments && Array.isArray(quote.attachments) && quote.attachments.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {(quote.attachments as any[]).map((attachment: any, index: number) => (
                      <Badge key={index} variant="outline" className="gap-1 text-xs">
                        <FileText className="h-3 w-3" />
                        {attachment.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {quote.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => acceptMutation.mutate(quote.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="flex-1"
                      data-testid={`button-accept-${quote.id}`}
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => declineMutation.mutate(quote.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="flex-1"
                      data-testid={`button-decline-${quote.id}`}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                )}

                {quote.status === "accepted" && (
                  <Button
                    size="sm"
                    onClick={() => convertToPOMutation.mutate(quote)}
                    disabled={convertToPOMutation.isPending}
                    className="w-full"
                    data-testid={`button-convert-po-${quote.id}`}
                  >
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {convertToPOMutation.isPending ? "Creating PO..." : "Convert to Purchase Order"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop: Comparison matrix. Suppliers are columns and attributes are
          rows, so this intentionally is NOT the shared DataTable (its
          row-model, sorting and persisted column layout don't apply here);
          instead it mirrors DataTable's visual language: h-7 uppercase muted
          header, ~36px rows, border-border/40 dividers, hover-elevate,
          auto-hide scrollbars. */}
      <div className="hidden md:block overflow-x-auto dt-autohide-scrollbar">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="h-7 px-2 text-left text-data font-medium uppercase tracking-wide text-muted-foreground/70 border-b border-border bg-muted w-32">
                Supplier
              </th>
              {quotes.map((quote) => (
                <th
                  key={quote.id}
                  className="h-7 px-2 text-center text-data font-medium uppercase tracking-wide text-muted-foreground/70 border-b border-border bg-muted min-w-[200px]"
                >
                  {quote.supplierName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="hover-elevate" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground">
                Uploaded
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-2 py-1.5 border-b border-border/40 text-center">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(quote.createdAt), "MMM d, yyyy")}
                  </span>
                </td>
              ))}
            </tr>

            <tr className="hover-elevate" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground">
                Status
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-2 py-1.5 border-b border-border/40 text-center">
                  <div className="flex justify-center">
                    <Badge
                      variant={
                        quote.status === "accepted"
                          ? "default"
                          : quote.status === "declined"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {quote.status}
                    </Badge>
                  </div>
                </td>
              ))}
            </tr>

            <tr className="hover-elevate bg-muted/20" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground">
                Total Amount
              </td>
              {quotes.map((quote) => {
                const isLowest = quote.id === lowestQuote.id && quotes.length > 1;

                return (
                  <td key={quote.id} className="px-2 py-1.5 border-b border-border/40 text-center">
                    <div className="text-xl font-bold">
                      ${(quote.totalAmount / 100).toFixed(2)}
                    </div>
                    {isLowest && (
                      <Badge variant="default" className="gap-1 mt-2">
                        <TrendingDown className="h-3 w-3" />
                        Best Price
                      </Badge>
                    )}
                  </td>
                );
              })}
            </tr>

            <tr className="hover-elevate" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground align-top">
                Notes
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-2 py-1.5 border-b border-border/40 text-center">
                  <div className="text-xs text-muted-foreground">
                    {quote.notes || "-"}
                  </div>
                </td>
              ))}
            </tr>

            <tr className="hover-elevate" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground align-top">
                Attachments
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-2 py-1.5 border-b border-border/40">
                  {quote.attachments && Array.isArray(quote.attachments) && quote.attachments.length > 0 ? (
                    <div className="flex flex-col gap-1 items-center">
                      {(quote.attachments as any[]).map((attachment: any, index: number) => (
                        <Badge key={index} variant="outline" className="gap-1 text-xs">
                          <FileText className="h-3 w-3" />
                          {attachment.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center">-</div>
                  )}
                </td>
              ))}
            </tr>

            <tr className="hover-elevate" style={{ height: 36 }}>
              <td className="px-2 py-1.5 border-b border-border/40 text-xs font-medium text-muted-foreground">
                Actions
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="px-2 py-1.5 border-b border-border/40">
                  {quote.status === "pending" ? (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => acceptMutation.mutate(quote.id)}
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        data-testid={`button-accept-${quote.id}`}
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => declineMutation.mutate(quote.id)}
                        disabled={acceptMutation.isPending || declineMutation.isPending}
                        data-testid={`button-decline-${quote.id}`}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    </div>
                  ) : quote.status === "accepted" ? (
                    <div className="flex justify-center">
                      <Button
                        size="sm"
                        onClick={() => convertToPOMutation.mutate(quote)}
                        disabled={convertToPOMutation.isPending}
                        data-testid={`button-convert-po-${quote.id}`}
                      >
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        {convertToPOMutation.isPending ? "Creating..." : "Convert to PO"}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center">-</div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
