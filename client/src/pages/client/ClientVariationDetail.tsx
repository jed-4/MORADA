import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@shared/money";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useClientPortal } from "@/hooks/use-client-portal";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";
import { ClientError, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";
import { variationStatus, type ClientVariation } from "./ClientVariations";

/**
 * One variation, as the document the client was sent, with the approve/decline
 * panel.
 *
 * Everything shown is what the server already decided the client may have:
 * lines the builder hid are gone, and cost/markup columns only appear if that
 * document's settings include them.
 *
 * Signing posts to /client-sign, which runs the SAME handler as the emailed
 * link — same guards, same audit trail, same approval side effects. The
 * signature is the signed-in client's name, taken from the session server-side
 * rather than typed, so it cannot be anyone else's.
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
  const { toast } = useToast();
  const { user } = useAuth();
  const { hasPermission } = useClientPortal();
  const canSign = hasPermission(PORTAL_KEYS.variations, "approve");
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const sign = useMutation({
    mutationFn: (input: { action: "approve" | "reject"; rejectionReason?: string }) =>
      apiRequest(`/api/variations/${variationId}/client-sign`, "POST", input),
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({ queryKey: [`/api/variations/${variationId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/variations?projectId=${projectId}`] });
      setDeclining(false);
      setReason("");
      toast({
        title: input.action === "approve" ? "Variation approved" : "Variation declined",
        description: input.action === "approve"
          ? "Your builder has been notified."
          : "Your builder has been notified of your reasons.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "We couldn't record that",
        description: error?.message || "Please try again, or contact your builder.",
        variant: "destructive",
      });
    },
  });

  const signerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "";

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

      {awaiting && canSign && (
        <Card data-testid="client-variation-sign">
          <CardContent className="p-4 md:p-6 space-y-3">
            <div>
              <p className="font-medium">Do you approve this variation?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Approving adds {formatCents(variation.totalAmount ?? 0)} to your contract
                {variation.daysChanged ? ` and ${variation.daysChanged} day${variation.daysChanged === 1 ? "" : "s"} to the programme` : ""}.
                It will be signed as {signerName}.
              </p>
              {variation.approvalDeadline && (
                <p className="text-sm text-muted-foreground mt-1">
                  Response requested by {format(new Date(variation.approvalDeadline), "d MMM yyyy")}.
                </p>
              )}
            </div>

            {declining ? (
              <div className="space-y-2">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell your builder what needs to change"
                  rows={3}
                  data-testid="input-decline-reason"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={sign.isPending}
                    onClick={() => sign.mutate({ action: "reject", rejectionReason: reason.trim() || undefined })}
                    data-testid="button-confirm-decline"
                  >
                    {sign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Send to builder
                  </Button>
                  <Button variant="ghost" onClick={() => setDeclining(false)} disabled={sign.isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={sign.isPending}
                  onClick={() => sign.mutate({ action: "approve" })}
                  data-testid="button-approve-variation"
                >
                  {sign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Approve
                </Button>
                <Button variant="outline" onClick={() => setDeclining(true)} disabled={sign.isPending} data-testid="button-decline-variation">
                  Request changes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {awaiting && !canSign && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Approving this variation</p>
            <p className="text-muted-foreground mt-1">
              Use the approval link in the email your builder sent you.
            </p>
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
