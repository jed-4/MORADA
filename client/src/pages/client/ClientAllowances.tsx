import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, CircleDashed, Clock, Wallet } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
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
  const percent = Math.round((settled / rows.length) * 100);

  // Grouped the way the estimate groups them, so an allowance sits with the
  // part of the house it belongs to — the same shape as the builder's list.
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
        <div className="w-44">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Settled</span>
            <span className="tabular-nums font-medium">{settled}/{rows.length}</span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>
      }
    >
      <div className="space-y-4">
        {Array.from(groups.entries()).map(([groupName, groupRows]) => {
          const groupSettled = groupRows.filter((r) => r.finalised).length;
          return (
            <section key={groupName} className="surface-panel overflow-hidden" data-testid={`client-allowance-group-${groupName.toLowerCase().replace(/\s+/g, "-")}`}>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">{groupName}</h2>
                <span className="text-data text-muted-foreground uppercase tracking-wide">
                  {groupSettled} of {groupRows.length} settled
                </span>
              </div>

              {groupRows.map(({ item, finalised }) => {
                const status = STATUS[item.allowanceStatus ?? "pending"] ?? STATUS.pending;
                const Icon = finalised ? CheckCircle2 : status.icon;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0"
                    data-testid={`client-allowance-${item.id}`}
                  >
                    <div
                      className={cn(
                        "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 border",
                        finalised
                          ? "bg-[hsl(var(--sage-light))] border-[hsl(var(--sage))]"
                          : "bg-muted border-border",
                      )}
                      aria-hidden
                    >
                      <Icon className={cn("h-3 w-3", finalised ? "text-[hsl(147_39%_35%)]" : "text-muted-foreground")} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={cn("font-medium", finalised && "text-muted-foreground")}>{item.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.allowance || "Allowance"}
                        {item.description ? ` · ${item.description}` : ""}
                      </div>
                    </div>

                    <ClientStatus
                      label={finalised ? "Settled" : status.label}
                      tone={finalised ? "done" : status.tone}
                    />
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Talk to your builder about the amount allowed for any of these.
      </p>
    </ClientPage>
  );
}
