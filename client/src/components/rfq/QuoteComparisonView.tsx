import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Check, X, FileText, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import type { RfqQuote } from "@shared/schema";

interface QuoteComparisonViewProps {
  rfqId: string;
  quotes: RfqQuote[];
}

export function QuoteComparisonView({ rfqId, quotes }: QuoteComparisonViewProps) {
  const { toast } = useToast();

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
              </div>
            </Card>
          );
        })}
      </div>

      {/* Desktop: Table view */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium text-sm text-muted-foreground w-32">
                Supplier
              </th>
              {quotes.map((quote) => (
                <th key={quote.id} className="p-3 text-center min-w-[200px]">
                  <div className="font-medium">{quote.supplierName}</div>
                  <div className="text-xs font-normal text-muted-foreground mt-1">
                    {format(new Date(quote.createdAt), "MMM d, yyyy")}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="p-3 font-medium text-sm text-muted-foreground">
                Status
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="p-3 text-center">
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

            <tr className="border-b bg-muted/20">
              <td className="p-3 font-medium text-sm text-muted-foreground">
                Total Amount
              </td>
              {quotes.map((quote) => {
                const isLowest = quote.id === lowestQuote.id && quotes.length > 1;
                
                return (
                  <td key={quote.id} className="p-3 text-center">
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

            <tr className="border-b">
              <td className="p-3 font-medium text-sm text-muted-foreground align-top">
                Notes
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="p-3 text-center">
                  <div className="text-sm text-muted-foreground">
                    {quote.notes || "-"}
                  </div>
                </td>
              ))}
            </tr>

            <tr className="border-b">
              <td className="p-3 font-medium text-sm text-muted-foreground align-top">
                Attachments
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="p-3">
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
                    <div className="text-sm text-muted-foreground text-center">-</div>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <td className="p-3 font-medium text-sm text-muted-foreground">
                Actions
              </td>
              {quotes.map((quote) => (
                <td key={quote.id} className="p-3">
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
                  ) : (
                    <div className="text-sm text-muted-foreground text-center">-</div>
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
