import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { Check, FileSignature, Loader2 } from "lucide-react";
import { formatCents } from "@shared/money";
import { EmptyState } from "@/components/EmptyState";
import {
  ClientGroupHeader,
  ClientListPage,
  ClientListRow,
  ClientMarker,
} from "@/components/client/ClientListPage";
import { ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Variations a client can see — only the ones actually sent to them; the
 * server hides drafts. Same row shape as the schedule (state marker, name,
 * detail, status, money) so the sections read as one product.
 */

export interface ClientVariation {
  id: string;
  variationNumber: string;
  name: string;
  totalAmount: number;
  status: string;
  approvalDeadline?: string | null;
  daysChanged?: number | null;
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
  const [search, setSearch] = useState("");

  const { data: variations = [], isLoading } = useQuery<ClientVariation[]>({
    queryKey: [`/api/variations?projectId=${projectId}`],
    enabled: !!projectId,
  });

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = variations.filter((v) =>
      !term || [v.name, v.variationNumber].some((f) => (f ?? "").toLowerCase().includes(term)),
    );
    const waiting = matched.filter((v) => variationStatus(v).label.startsWith("Awaiting"));
    const decided = matched.filter((v) => !variationStatus(v).label.startsWith("Awaiting"));
    return [
      ["Waiting on you", waiting] as const,
      ["Decided", decided] as const,
    ].filter(([, rows]) => rows.length > 0);
  }, [variations, search]);

  const awaiting = variations.filter((v) => variationStatus(v).label.startsWith("Awaiting")).length;
  const approvedTotal = variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + (v.totalAmount ?? 0), 0);

  return (
    <ClientListPage
      title="Variations"
      chips={[
        ...(awaiting > 0 ? [{ label: `${awaiting} to approve`, tone: "alert" as const }] : []),
        { label: `${formatCents(approvedTotal)} approved` },
      ]}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search variations..."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : variations.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title="No variations yet"
          description="If something changes on your job, your builder will send you a variation to approve. They'll appear here."
          variant="inline"
          className="py-16"
        />
      ) : groups.length === 0 ? (
        <EmptyState icon={FileSignature} title="Nothing matches that" description="Try a different search." variant="inline" className="py-16" />
      ) : (
        groups.map(([groupName, rows]) => (
          <div key={groupName}>
            <ClientGroupHeader title={groupName} meta={`${rows.length} variation${rows.length === 1 ? "" : "s"}`} />
            {rows.map((v) => {
              const { label, tone } = variationStatus(v);
              const decided = !label.startsWith("Awaiting");
              return (
                <ClientListRow
                  key={v.id}
                  marker={<ClientMarker done={v.status === "approved"} icon={v.status === "approved" ? <Check className="h-3 w-3 text-[hsl(147_39%_35%)]" /> : undefined} />}
                  title={v.name}
                  muted={decided}
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
          </div>
        ))
      )}
    </ClientListPage>
  );
}
