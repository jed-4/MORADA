import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useClientPortal } from "@/hooks/use-client-portal";
import { PORTAL_KEYS } from "@shared/clientPortalPermissions";
import { VariationPreviewContent } from "@/components/variations/VariationPreviewContent";
import type { VariationDocumentColumns } from "@shared/variationDocumentColumns";
import { ClientError, ClientLoading, ClientPage } from "@/components/client/ClientPage";

/**
 * One variation, as the document the client was sent.
 *
 * Renders VariationPreviewContent — the same component the emailed portal link
 * uses — off the same server payload (/client-view calls
 * buildVariationPortalPayload). The client therefore reads ONE document
 * whichever way they arrive, including the signature panel, and a hand-built
 * lookalike can't drift from the PDF they were emailed.
 *
 * Signing posts to the session route instead of the token one; attachments
 * come back through the client's own session for the same reason.
 */

interface ClientVariationView {
  variation: any;
  items: any[];
  bills?: any[];
  attachments?: Array<{ index: number; name: string }>;
  notItemisedIncCents?: number;
  labourTotalCents?: number;
  columns?: VariationDocumentColumns;
  project?: any;
  company?: any;
}

export default function ClientVariationDetail() {
  const { projectId, variationId } = useParams<{ projectId: string; variationId: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { hasPermission } = useClientPortal();
  const { user } = useAuth();
  const canSign = hasPermission(PORTAL_KEYS.variations, "approve");
  const signerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.email || "";

  const { data, isLoading, isError } = useQuery<ClientVariationView>({
    queryKey: [`/api/variations/${variationId}/client-view`],
    enabled: !!variationId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Variation">
        <ClientLoading label="Loading variation…" />
      </ClientPage>
    );
  }

  if (isError || !data?.variation) {
    return (
      <ClientPage title="Variation">
        <ClientError message="This variation isn't available. Your builder may not have sent it yet." />
      </ClientPage>
    );
  }

  const { variation } = data;
  const signed = !!variation.clientSignedName;

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="client-variation-document">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/variations`)}
          className="-ml-2"
          data-testid="button-back-to-variations"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          All variations
        </Button>

        {/* The archived PDF that was emailed — after signing, this is the copy
            the signature belongs to. Absent for variations never sent by email,
            so the link is only offered when the server has one. */}
        <Button variant="outline" size="sm" asChild data-testid="button-download-variation-pdf">
          <a href={`/api/variations/${variationId}/client-document`} target="_blank" rel="noopener noreferrer">
            <FileDown className="h-4 w-4 mr-2" />
            {signed ? "Download signed copy" : "Download PDF"}
          </a>
        </Button>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <VariationPreviewContent
          variation={variation}
          items={data.items ?? []}
          bills={data.bills ?? []}
          labourTotalCents={data.labourTotalCents ?? 0}
          notItemisedIncCents={data.notItemisedIncCents ?? 0}
          attachments={data.attachments ?? []}
          company={data.company}
          companySettings={data.company ? { brandColor: data.company.brandColor } as any : undefined}
          project={data.project}
          columns={data.columns}
          // "portal" is the client-facing render: builder-only controls off,
          // signature panel on. Signing is disabled by swapping the URL out
          // when the role has no approve tick — the server refuses it too.
          mode="portal"
          signUrl={canSign ? `/api/variations/${variationId}/client-sign` : undefined}
          signerName={signerName}
          attachmentHref={(index) => `/api/variations/${variationId}/client-attachments/${index}`}
          onSigned={() => {
            queryClient.invalidateQueries({ queryKey: [`/api/variations/${variationId}/client-view`] });
            queryClient.invalidateQueries({ queryKey: [`/api/variations?projectId=${projectId}`] });
          }}
        />
      </div>
    </div>
  );
}
