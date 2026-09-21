import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { FileSignature } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@shared/money";
import { ClientEmpty, ClientLoading, ClientPage, ClientRow, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Variations a client can see — only ones actually sent to them; the server
 * hides drafts. No kanban, no status filters, no Add: a client reads these and
 * signs them.
 */

export interface ClientVariation {
  id: string;
  variationNumber: string;
  name: string;
  totalAmount: number;
  status: string;
  approvalDeadline?: string | null;
  portalSentAt?: string | null;
  clientSignedName?: string | null;
  clientSignedDate?: string | null;
  createdAt?: string | null;
}

export const variationStatus = (v: ClientVariation): { label: string; tone: ClientTone } => {
  if (v.status === "approved") return { label: "Approved", tone: "done" };
  if (v.status === "rejected") return { label: "Declined", tone: "attention" };
  return { label: "Awaiting your approval", tone: "waiting" };
};

export default function ClientVariations() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();

  const { data: variations = [], isLoading } = useQuery<ClientVariation[]>({
    queryKey: [`/api/variations?projectId=${projectId}`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Variations">
        <ClientLoading label="Loading variations…" />
      </ClientPage>
    );
  }

  if (variations.length === 0) {
    return (
      <ClientPage title="Variations" description="Changes to the contracted works, and what they cost.">
        <ClientEmpty
          icon={FileSignature}
          title="No variations yet"
          description="If something changes on your job, your builder will send you a variation to approve. They'll appear here."
        />
      </ClientPage>
    );
  }

  const awaiting = variations.filter((v) => variationStatus(v).label.startsWith("Awaiting")).length;
  const approvedTotal = variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + (v.totalAmount ?? 0), 0);

  return (
    <ClientPage
      title="Variations"
      description="Changes to the contracted works, and what they cost."
      aside={
        <div className="text-sm text-right">
          <div className="text-muted-foreground">Approved to date</div>
          <div className="font-medium tabular-nums">{formatCents(approvedTotal)}</div>
        </div>
      }
    >
      {awaiting > 0 && (
        <p className="text-sm">
          {awaiting === 1 ? "One variation is" : `${awaiting} variations are`} waiting on you.
        </p>
      )}
      <Card>
        <CardContent className="p-0">
          {variations.map((v) => {
            const { label, tone } = variationStatus(v);
            return (
              <ClientRow
                key={v.id}
                title={v.name}
                meta={[
                  v.variationNumber,
                  v.portalSentAt ? `Sent ${format(new Date(v.portalSentAt), "d MMM yyyy")}` : null,
                  v.clientSignedDate ? `Signed ${format(new Date(v.clientSignedDate), "d MMM yyyy")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                status={<ClientStatus label={label} tone={tone} />}
                value={formatCents(v.totalAmount ?? 0)}
                onClick={() => navigate(`/projects/${projectId}/variations/${v.id}`)}
              />
            );
          })}
        </CardContent>
      </Card>
    </ClientPage>
  );
}
