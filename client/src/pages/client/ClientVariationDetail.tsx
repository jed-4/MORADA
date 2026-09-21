import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCents } from "@shared/money";
import { ClientError, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";
import { variationStatus, type ClientVariation } from "./ClientVariations";

/**
 * One variation, as the document the client was sent.
 *
 * Everything shown here is what the server already decided the client may
 * have: lines the builder hid are gone, and cost/markup columns only appear
 * if that document's settings include them. Signing in the app is not built
 * yet — the emailed link is still where a client approves or declines — so
 * this page says so rather than showing a dead button.
 */

interface VariationItem {
  id: string;
  name?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitType?: string | null;
  unitPrice?: number | null;
  totalPrice: number;
}

export default function ClientVariationDetail() {
  const { projectId, variationId } = useParams<{ projectId: string; variationId: string }>();
  const [, navigate] = useLocation();

  const { data: variation, isLoading, isError } = useQuery<ClientVariation & {
    introductionText?: string | null;
    closingText?: string | null;
    subtotal?: number;
    gstAmount?: number;
    termsAndConditions?: string | null;
    attachments?: Array<{ name?: string }> | null;
    rejectionReason?: string | null;
  }>({
    queryKey: [`/api/variations/${variationId}`],
    enabled: !!variationId,
  });

  const { data: items = [] } = useQuery<VariationItem[]>({
    queryKey: [`/api/variations/${variationId}/items`],
    enabled: !!variationId,
  });

  const back = () => navigate(`/projects/${projectId}/variations`);

  if (isLoading) {
    return (
      <ClientPage title="Variation">
        <ClientLoading label="Loading variation…" />
      </ClientPage>
    );
  }

  if (isError || !variation) {
    return (
      <ClientPage title="Variation">
        <ClientError message="This variation isn't available. Your builder may not have sent it yet." />
      </ClientPage>
    );
  }

  const { label, tone } = variationStatus(variation);
  const awaiting = label.startsWith("Awaiting");

  return (
    <ClientPage
      title={variation.name}
      description={variation.variationNumber}
      aside={<ClientStatus label={label} tone={tone} />}
    >
      <Button variant="ghost" size="sm" onClick={back} className="-ml-2" data-testid="button-back-to-variations">
        <ArrowLeft className="h-4 w-4 mr-2" />
        All variations
      </Button>

      <Card>
        <CardContent className="p-4 md:p-6 space-y-5">
          {variation.introductionText && (
            <p className="text-sm whitespace-pre-wrap">{variation.introductionText}</p>
          )}

          <div>
            {items.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
                <div className="min-w-0">
                  <div className="font-medium">{item.name || item.description}</div>
                  {item.name && item.description && (
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p>
                  )}
                  {item.quantity != null && (
                    <p className="text-sm text-muted-foreground">
                      {item.quantity} {item.unitType ?? ""}
                      {item.unitPrice != null ? ` × ${formatCents(item.unitPrice)}` : ""}
                    </p>
                  )}
                </div>
                <div className="tabular-nums font-medium shrink-0">{formatCents(item.totalPrice)}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            {variation.subtotal != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (ex GST)</span>
                <span className="tabular-nums">{formatCents(variation.subtotal)}</span>
              </div>
            )}
            {variation.gstAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatCents(variation.gstAmount)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(variation.totalAmount ?? 0)}</span>
            </div>
          </div>

          {variation.closingText && <p className="text-sm whitespace-pre-wrap">{variation.closingText}</p>}

          {!!variation.attachments?.length && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              {variation.attachments.length} attachment{variation.attachments.length === 1 ? "" : "s"} — see the email your builder sent.
            </div>
          )}

          {variation.termsAndConditions && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Terms and conditions</summary>
              <p className="mt-2 whitespace-pre-wrap">{variation.termsAndConditions}</p>
            </details>
          )}
        </CardContent>
      </Card>

      {awaiting && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Approving this variation</p>
            <p className="text-muted-foreground mt-1">
              Use the approval link in the email your builder sent you. Signing here in the portal is coming shortly.
            </p>
            {variation.approvalDeadline && (
              <p className="text-muted-foreground mt-1">
                Response requested by {format(new Date(variation.approvalDeadline), "d MMM yyyy")}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {variation.status === "approved" && variation.clientSignedName && (
        <p className="text-sm text-muted-foreground">
          Approved by {variation.clientSignedName}
          {variation.clientSignedDate ? ` on ${format(new Date(variation.clientSignedDate), "d MMM yyyy")}` : ""}.
        </p>
      )}
      {variation.status === "rejected" && variation.rejectionReason && (
        <p className="text-sm text-muted-foreground">Declined: {variation.rejectionReason}</p>
      )}
    </ClientPage>
  );
}
