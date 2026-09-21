import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ClientEmpty, ClientLoading, ClientPage, ClientRow, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Allowances (Prime Cost and Provisional Sum) as the client sees them.
 *
 * The list only. The builder's allowance pages are a cost ledger — supplier
 * bills, staff cost rates, markup — and the server refuses that route for a
 * client outright, so there is no detail page here to link to.
 *
 * No money is shown. The amount the builder's page holds per line is the
 * PRE-margin figure, which would disagree with the client's contract; the
 * finalised "allowance vs final vs difference" view is waiting on how the
 * final client price is derived. Until then this answers the question a
 * client actually asks of this section: what am I still choosing, and what is
 * settled?
 */

interface AllowanceRow {
  item: {
    id: string;
    name: string;
    description?: string | null;
    groupName?: string | null;
    allowance?: string | null;
    allowanceStatus?: string | null;
    isSelection?: boolean | null;
  };
  finalised: boolean;
}

const STATUS: Record<string, { label: string; tone: ClientTone }> = {
  finalized: { label: "Settled", tone: "done" },
  in_progress: { label: "Being priced", tone: "info" },
  pending: { label: "Still to choose", tone: "waiting" },
};

export default function ClientAllowances() {
  const { projectId } = useParams<{ projectId: string }>();

  const { data: rows = [], isLoading } = useQuery<AllowanceRow[]>({
    queryKey: [`/api/projects/${projectId}/allowances`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Allowances">
        <ClientLoading label="Loading allowances…" />
      </ClientPage>
    );
  }

  if (rows.length === 0) {
    return (
      <ClientPage title="Allowances" description="Items with a budget set aside in your contract, to be chosen as the job goes.">
        <ClientEmpty
          icon={Wallet}
          title="No allowances on this project"
          description="Prime Cost and Provisional Sum items will appear here once they're part of your contract."
        />
      </ClientPage>
    );
  }

  const settled = rows.filter((r) => r.finalised).length;

  return (
    <ClientPage
      title="Allowances"
      description="Items with a budget set aside in your contract, to be chosen as the job goes."
      aside={<div className="text-sm text-muted-foreground">{settled} of {rows.length} settled</div>}
    >
      <Card>
        <CardContent className="p-0">
          {rows.map(({ item, finalised }) => {
            const status = STATUS[item.allowanceStatus ?? "pending"] ?? STATUS.pending;
            return (
              <ClientRow
                key={item.id}
                title={item.name}
                meta={[item.groupName, item.allowance].filter(Boolean).join(" · ") || undefined}
                status={<ClientStatus label={finalised ? "Settled" : status.label} tone={finalised ? "done" : status.tone} />}
              >
                {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
              </ClientRow>
            );
          })}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Talk to your builder about the amount allowed for any of these.
      </p>
    </ClientPage>
  );
}
