import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, CircleDashed, Clock, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ClientEmpty, ClientLoading, ClientPage, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

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

const STATUS: Record<string, { label: string; tone: ClientTone; icon: typeof CheckCircle2 }> = {
  finalized: { label: "Settled", tone: "done", icon: CheckCircle2 },
  in_progress: { label: "Being priced", tone: "info", icon: Clock },
  pending: { label: "Still to choose", tone: "waiting", icon: CircleDashed },
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
  const percent = rows.length ? Math.round((settled / rows.length) * 100) : 0;

  // Grouped the way the estimate groups them, so an allowance sits next to the
  // part of the house it belongs to.
  const groups = new Map<string, AllowanceRow[]>();
  for (const row of rows) {
    const key = row.item.groupName || "Allowances";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return (
    <ClientPage
      title="Allowances"
      description="Items with a budget set aside in your contract, to be chosen as the job goes."
      aside={
        <div className="w-40">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Settled</span>
            <span className="tabular-nums font-medium">{settled}/{rows.length}</span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>
      }
    >
      {Array.from(groups.entries()).map(([groupName, groupRows]) => (
        <section key={groupName} className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">{groupName}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {groupRows.map(({ item, finalised }) => {
              const status = STATUS[item.allowanceStatus ?? "pending"] ?? STATUS.pending;
              const Icon = finalised ? CheckCircle2 : status.icon;
              return (
                <Card key={item.id} data-testid={`client-allowance-${item.id}`}>
                  <CardContent className="p-4 flex gap-3">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{item.name}</div>
                        <ClientStatus
                          label={finalised ? "Settled" : status.label}
                          tone={finalised ? "done" : status.tone}
                        />
                      </div>
                      {item.allowance && (
                        <div className="text-xs text-muted-foreground">{item.allowance}</div>
                      )}
                      {item.description && (
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-sm text-muted-foreground">
        Talk to your builder about the amount allowed for any of these.
      </p>
    </ClientPage>
  );
}
