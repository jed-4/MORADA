import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Check, X, FileText, TrendingDown, ShoppingCart, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { gstSplit, formatCents } from "@shared/money";
import type { RfqQuote, Rfq } from "@shared/schema";

/**
 * Quote status is a free-text column rather than a pg enum, so the vocabulary
 * lives here. Titles match the tone of RECIPIENT_STATUS_LABEL / RFQ_STATUS_LABEL
 * so one page does not mix "Quoted" with "pending".
 */
const QUOTE_STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting decision",
  accepted: "Accepted",
  declined: "Declined",
};

const quoteStatusLabel = (status: string) => QUOTE_STATUS_LABEL[status] ?? status;

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
      const { exGst, gst } = gstSplit(quote.totalAmount);
      const poData = {
        projectId: rfq?.projectId,
        supplierId: quote.supplierId,
        supplierName: quote.supplierName || "",
        description: `PO from RFQ ${rfq?.rfqNumber} - ${rfq?.title || ""}`,
        rfqId: rfqId,
        rfqQuoteId: quote.id,
        // rfq_quotes.totalAmount is inc GST (the app-wide convention, and now
        // explicitly captured on entry). This used to treat it as the ex-GST
        // subtotal and add 10% on top, so every PO converted from a quote came
        // out 10% high.
        subtotal: exGst,
        gst,
        total: quote.totalAmount,
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
    <div className="p-3">
      {/* One card per quote at every width. This used to be a mobile-only
          fallback behind a transposed matrix (suppliers as columns, attributes
          as rows) which put Accept and Decline as full-width buttons inside a
          table cell. The matrix also stopped being a comparison the moment the
          panel sat in the detail page's ~540px column. Each card now carries
          its own gap to the cheapest quote, so comparison survives without it. */}
      <div className="space-y-3">
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
                    {quoteStatusLabel(quote.status)}
                  </Badge>
                </div>

                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-xl font-bold tabular-nums">
                    {formatCents(quote.totalAmount)}
                  </div>
                  <span className="text-xs text-muted-foreground">inc GST</span>
                  {isLowest ? (
                    <Badge variant="default" className="gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Lowest
                    </Badge>
                  ) : (
                    quotes.length > 1 && (
                      // The gap to the cheapest quote, which is the only thing
                      // the old side-by-side matrix was really there to show.
                      <span className="text-xs text-coral font-medium tabular-nums">
                        +{formatCents(quote.totalAmount - lowestQuote.totalAmount)} vs lowest
                      </span>
                    )
                  )}
                </div>

                {quote.notes && (
                  <div className="text-sm text-muted-foreground">
                    {quote.notes}
                  </div>
                )}

                {Array.isArray(quote.attachments) && quote.attachments.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Real object-storage paths now, so these open. They used
                        to be fabricated /uploads/quotes/ URLs pointing at
                        nothing, rendered as if they were genuine files. */}
                    {(quote.attachments as any[]).map((attachment: any, index: number) => (
                      <a
                        key={index}
                        href={attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        download={attachment.name}
                        data-testid={`link-quote-attachment-${index}`}
                      >
                        <Badge variant="outline" className="gap-1 text-xs hover-elevate cursor-pointer">
                          <FileText className="h-3 w-3" />
                          {attachment.name}
                        </Badge>
                      </a>
                    ))}
                  </div>
                )}

                {quote.status === "pending" && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => acceptMutation.mutate(quote.id)}
                      disabled={acceptMutation.isPending || declineMutation.isPending}
                      className="h-7 text-xs"
                      data-testid={`button-accept-${quote.id}`}
                    >
                      <Check className="h-3 w-3 mr-1.5" />
                      Accept quote
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground"
                          disabled={acceptMutation.isPending || declineMutation.isPending}
                          aria-label="More quote actions"
                          data-testid={`button-quote-menu-${quote.id}`}
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem
                          onClick={() => declineMutation.mutate(quote.id)}
                          data-testid={`button-decline-${quote.id}`}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Decline quote
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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

    </div>
  );
}
