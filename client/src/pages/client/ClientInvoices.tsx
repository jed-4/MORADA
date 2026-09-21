import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format, isBefore, startOfDay } from "date-fns";
import { Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@shared/money";
import { ClientEmpty, ClientLoading, ClientPage, ClientRow, ClientStatus, type ClientTone } from "@/components/client/ClientPage";

/**
 * Progress claims the client has actually been sent (the server hides drafts
 * and internally-approved-but-unsent claims). Read-only: no Record Payment,
 * no Xero, no void.
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

  const { data: invoices = [], isLoading } = useQuery<ClientInvoiceRow[]>({
    queryKey: [`/api/client-invoices?projectId=${projectId}`],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Invoices">
        <ClientLoading label="Loading invoices…" />
      </ClientPage>
    );
  }

  if (invoices.length === 0) {
    return (
      <ClientPage title="Invoices" description="Progress claims for your project.">
        <ClientEmpty
          icon={Receipt}
          title="No invoices yet"
          description="Progress claims appear here once your builder sends them."
        />
      </ClientPage>
    );
  }

  const outstanding = invoices.reduce((sum, i) => sum + (i.balanceAmount ?? 0), 0);

  return (
    <ClientPage
      title="Invoices"
      description="Progress claims for your project."
      aside={
        <div className="text-sm text-right">
          <div className="text-muted-foreground">Outstanding</div>
          <div className="font-medium tabular-nums">{formatCents(outstanding)}</div>
        </div>
      }
    >
      <Card>
        <CardContent className="p-0">
          {invoices.map((inv) => {
            const { label, tone } = invoiceStatus(inv);
            return (
              <ClientRow
                key={inv.id}
                title={inv.name}
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
        </CardContent>
      </Card>
    </ClientPage>
  );
}
