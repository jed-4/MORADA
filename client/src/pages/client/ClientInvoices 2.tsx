import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format, isBefore, startOfDay } from "date-fns";
import { Check, Loader2, Receipt } from "lucide-react";
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
 * Progress claims the client has actually been sent (the server hides drafts
 * and internally-approved-but-unsent claims). Read-only: no Record Payment,
 * no Xero, no void. Same row shape as the schedule.
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

  const { data: invoices = [], isLoading } = useQuery<ClientInvoiceRow[]>({
    queryKey: [`/api/client-invoices?projectId=${projectId}`],
    enabled: !!projectId,
  });

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matched = invoices.filter((i) =>
      !term || [i.name, i.invoiceNumber].some((f) => (f ?? "").toLowerCase().includes(term)),
    );
    const outstanding = matched.filter((i) => i.status !== "paid");
    const paid = matched.filter((i) => i.status === "paid");
    return [
      ["Outstanding", outstanding] as const,
      ["Paid", paid] as const,
    ].filter(([, rows]) => rows.length > 0);
  }, [invoices, search]);

  const outstandingTotal = invoices.reduce((sum, i) => sum + (i.balanceAmount ?? 0), 0);
  const overdue = invoices.filter((i) => invoiceStatus(i).label.toLowerCase().includes("overdue")).length;

  return (
    <ClientListPage
      title="Invoices"
      chips={[
        { label: `${formatCents(outstandingTotal)} outstanding` },
        ...(overdue > 0 ? [{ label: `${overdue} overdue`, tone: "alert" as const }] : []),
      ]}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search invoices..."
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices yet"
          description="Progress claims appear here once your builder sends them."
          variant="inline"
          className="py-16"
        />
      ) : groups.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing matches that" description="Try a different search." variant="inline" className="py-16" />
      ) : (
        groups.map(([groupName, rows]) => (
          <div key={groupName}>
            <ClientGroupHeader
              title={groupName}
              meta={`${rows.length} invoice${rows.length === 1 ? "" : "s"}`}
            />
            {rows.map((inv) => {
              const { label, tone } = invoiceStatus(inv);
              const paid = inv.status === "paid";
              return (
                <ClientListRow
                  key={inv.id}
                  marker={<ClientMarker done={paid} icon={paid ? <Check className="h-3 w-3 text-[hsl(147_39%_35%)]" /> : undefined} />}
                  title={inv.name}
                  muted={paid}
                  meta={[
                    inv.invoiceNumber,
                    `Issued ${format(new Date(inv.invoiceDate), "d MMM yyyy")}`,
                    inv.dueDate ? `Due ${format(new Date(inv.dueDate), "d MMM yyyy")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  status={<ClientStatus label={label} tone={tone} />}
                  value={formatCents(inv.totalAmount ?? 0)}
                  onClick={() => navigate(`/projects/${projectId}/client-invoices/${inv.id}`)}
                />
              );
            })}
          </div>
        ))
      )}
    </ClientListPage>
  );
}
