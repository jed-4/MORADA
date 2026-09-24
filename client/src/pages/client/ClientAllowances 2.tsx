import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { CheckCircle2, CircleDashed, Clock, Loader2, Wallet } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import {
  ClientGroupHeader,
  ClientListPage,
  ClientListRow,
  ClientMarker,
} from "@/components/client/ClientListPage";
import { ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Allowances (Prime Cost and Provisional Sum) as the client sees them.
 *
 * The list only. The builder's allowance pages are a cost ledger — supplier
 * bills, staff cost rates, markup — and the server refuses that route for a
 * client outright, so there is no detail page to link to.
 *
 * No money is shown. The figure the builder's page holds per line is the
 * PRE-margin amount, which is not what the client's contract says; the
 * finalised "allowance vs final vs difference" view waits on how that final
 * client price is derived. Until then this answers what a client actually
 * asks here: what am I still choosing, and what is settled?
 */

interface AllowanceRow {
  item: {
    id: string;
    estimateId?: string | null;
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
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery<AllowanceRow[]>({
    queryKey: [`/api/projects/${projectId}/allowances`],
    enabled: !!projectId,
  });

  // Grouped the way the estimate groups them, so an allowance sits with the
  // part of the house it belongs to.
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = rows.filter(({ item }) =>
      !term || [item.name, item.description, item.groupName, item.allowance]
        .some((f) => (f ?? "").toLowerCase().includes(term)),
    );
    const by = new Map<string, AllowanceRow[]>();
    for (const row of matched) {
      const key = row.item.groupName || "Allowances";
      by.set(key, [...(by.get(key) ?? []), row]);
    }
    return Array.from(by.entries());
  }, [rows, search]);

  const settled = rows.filter((r) => r.finalised).length;
  const toChoose = rows.length - settled;

  return (
    <ClientListPage
      title="Allowances"
      chips={[
        ...(toChoose > 0 ? [{ label: `${toChoose} to settle`, tone: "alert" as const }] : []),
        { label: `${settled} of ${rows.length} settled` },
      ]}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search allowances..."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No allowances on this project"
          description="Prime Cost and Provisional Sum items will appear here once they're part of your contract."
          variant="inline"
          className="py-16"
        />
      ) : groups.length === 0 ? (
        <EmptyState icon={Wallet} title="Nothing matches that" description="Try a different search." variant="inline" className="py-16" />
      ) : (
        <>
          {groups.map(([groupName, groupRows]) => {
            const groupSettled = groupRows.filter((r) => r.finalised).length;
            return (
              <div key={groupName}>
                <ClientGroupHeader title={groupName} meta={`${groupSettled} of ${groupRows.length} settled`} />
                {groupRows.map(({ item, finalised }) => {
                  const status = STATUS[item.allowanceStatus ?? "pending"] ?? STATUS.pending;
                  const Icon = finalised ? CheckCircle2 : status.icon;
                  return (
                    <ClientListRow
                      key={item.id}
                      marker={
                        <ClientMarker
                          done={finalised}
                          icon={<Icon className={finalised ? "h-3 w-3 text-[hsl(147_39%_35%)]" : "h-3 w-3 text-muted-foreground"} />}
                        />
                      }
                      title={item.name}
                      muted={finalised}
                      meta={[item.allowance || "Allowance", item.description].filter(Boolean).join(" · ")}
                      status={<ClientStatus label={finalised ? "Settled" : status.label} tone={finalised ? "done" : status.tone} />}
                    />
                  );
                })}
              </div>
            );
          })}
          <p className="text-sm text-muted-foreground px-4 py-3">
            Talk to your builder about the amount allowed for any of these.
          </p>
        </>
      )}
    </ClientListPage>
  );
}
