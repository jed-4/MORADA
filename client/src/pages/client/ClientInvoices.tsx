import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format, isBefore, startOfDay } from "date-fns";
import { Check, CalendarClock, Loader2, Receipt } from "lucide-react";
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
 * The client's payment schedule: what they have been billed, and what is still
 * to come.
 *
 * Two kinds of row, and the difference matters.
 *
 *   - An ISSUED claim is a document their builder has actually sent them. It
 *     has a number, a real total and payments against it, and it opens.
 *   - An UPCOMING claim has not been sent. It carries only a name, a date and
 *     the amount the builder chose to share — see shared/claimSchedule.ts. The
 *     builder is still working on it, so there is nothing to open and nothing
 *     owed yet.
 *
 * The server decides which is which and strips an upcoming claim down to those
 * three fields before it leaves the building, so this page cannot leak a live
 * total even by accident. Nothing appears here at all until the builder shares
 * it — which is what lets them keep editing a claim without the client watching
 * the number move.
 */

export interface ClientInvoiceRow {
  id: string;
  invoiceNumber?: string | null;
  name: string;
  invoiceDate: string;
  dueDate?: string | null;
  totalAmount: number;
  paidAmount?: number | null;
  balanceAmount?: number | null;
  status: string;
}

/** A claim the builder has shared but not yet sent. Note what is NOT here. */
export interface ClientClaimForecastRow {
  id: string;
  projectId: string;
  name: string;
  invoiceDate: string;
  dueDate?: string | null;
  stage: "upcoming";
  amountIncCents: number | null;
  sharedAt: string;
}

type ClaimRow = ClientInvoiceRow | ClientClaimForecastRow;

/** An upcoming claim is the one shape without a `status`. */
export function isForecastRow(row: ClaimRow): row is ClientClaimForecastRow {
  return (row as ClientClaimForecastRow).stage === "upcoming";
}

export const invoiceStatus = (inv: ClientInvoiceRow): { label: string; tone: ClientTone } => {
  if (inv.status === "paid") return { label: "Paid", tone: "done" };
  const overdue = inv.status === "overdue" || (!!inv.dueDate && isBefore(new Date(inv.dueDate), startOfDay(new Date())));
  if (inv.status === "partial") return { label: overdue ? "Part paid · overdue" : "Part paid", tone: overdue ? "attention" : "info" };
  return overdue ? { label: "Overdue", tone: "attention" } : { label: "Due", tone: "waiting" };
};

export default function ClientInvoices() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery<ClaimRow[]>({
    queryKey: [`/api/client-invoices?projectId=${projectId}`],
    enabled: !!projectId,
  });

  const issued = useMemo(() => rows.filter((r): r is ClientInvoiceRow => !isForecastRow(r)), [rows]);
  const forecasts = useMemo(() => rows.filter(isForecastRow), [rows]);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (name: string, number?: string | null) =>
      !term || [name, number].some((f) => (f ?? "").toLowerCase().includes(term));

    const outstanding = issued.filter((i) => i.status !== "paid" && matches(i.name, i.invoiceNumber));
    const paid = issued.filter((i) => i.status === "paid" && matches(i.name, i.invoiceNumber));
    // Soonest first: this is a schedule, so it reads forwards in time.
    const upcoming = forecasts
      .filter((f) => matches(f.name))
      .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());

    return [
      ["Outstanding", outstanding] as const,
      ["Coming up", upcoming] as const,
      ["Paid", paid] as const,
    ].filter(([, group]) => group.length > 0);
  }, [issued, forecasts, search]);

  const outstandingTotal = issued.reduce((sum, i) => sum + (i.balanceAmount ?? 0), 0);
  const overdue = issued.filter((i) => invoiceStatus(i).label.toLowerCase().includes("overdue")).length;
  // Only claims carrying a shared figure count towards the total — a shared
  // claim with no amount would otherwise quietly read as $0.
  const upcomingTotal = forecasts.reduce((sum, f) => sum + (f.amountIncCents ?? 0), 0);

  return (
    <ClientListPage
      title="Payments"
      chips={[
        { label: `${formatCents(outstandingTotal)} outstanding` },
        ...(upcomingTotal > 0 ? [{ label: `${formatCents(upcomingTotal)} still to come` }] : []),
        ...(overdue > 0 ? [{ label: `${overdue} overdue`, tone: "alert" as const }] : []),
      ]}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search payments..."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No payments yet"
          description="Your payment schedule and progress claims appear here once your builder shares them."
          variant="inline"
          className="py-16"
        />
      ) : groups.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing matches that" description="Try a different search." variant="inline" className="py-16" />
      ) : (
        groups.map(([groupName, group]) => (
          <div key={groupName}>
            <ClientGroupHeader
              title={groupName}
              meta={
                groupName === "Coming up"
                  ? `${group.length} expected`
                  : `${group.length} invoice${group.length === 1 ? "" : "s"}`
              }
            />
            {group.map((row) =>
              isForecastRow(row) ? (
                // Not clickable on purpose: there is no document behind an
                // upcoming claim, and nothing is owed on it yet.
                <ClientListRow
                  key={row.id}
                  marker={<ClientMarker icon={<CalendarClock className="h-3 w-3 text-muted-foreground" />} />}
                  title={row.name}
                  meta={`Expected ${format(new Date(row.invoiceDate), "d MMM yyyy")}`}
                  status={<ClientStatus label="Not yet invoiced" tone="info" />}
                  value={row.amountIncCents == null ? "—" : formatCents(row.amountIncCents)}
                  data-testid={`row-upcoming-claim-${row.id}`}
                />
              ) : (
                (() => {
                  const { label, tone } = invoiceStatus(row);
                  const paid = row.status === "paid";
                  return (
                    <ClientListRow
                      key={row.id}
                      marker={<ClientMarker done={paid} icon={paid ? <Check className="h-3 w-3 text-[hsl(147_39%_35%)]" /> : undefined} />}
                      title={row.name}
                      muted={paid}
                      meta={[
                        row.invoiceNumber,
                        `Issued ${format(new Date(row.invoiceDate), "d MMM yyyy")}`,
                        row.dueDate ? `Due ${format(new Date(row.dueDate), "d MMM yyyy")}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      status={<ClientStatus label={label} tone={tone} />}
                      value={formatCents(row.totalAmount ?? 0)}
                      onClick={() => navigate(`/projects/${projectId}/client-invoices/${row.id}`)}
                    />
                  );
                })()
              ),
            )}
          </div>
        ))
      )}
    </ClientListPage>
  );
}
