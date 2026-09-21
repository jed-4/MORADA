import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCents } from "@shared/money";
import { ClientError, ClientLoading, ClientPage, ClientStatus } from "@/components/client/ClientPage";
import { invoiceStatus, type ClientInvoiceRow } from "./ClientInvoices";

/**
 * One progress claim, as the client's invoice.
 *
 * Lines come from the claim's saved money snapshot (lineBreakdown), which is
 * the same set of figures the builder's PDF prints, minus the Xero account
 * codes the server strips. Payments are shown so the balance is explainable.
 */

interface Payment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod?: string | null;
  reference?: string | null;
}

interface BreakdownLine {
  source: string;
  description: string;
  amountIncCents: number;
}

interface CustomItem {
  id: string;
  name?: string | null;
  description: string;
  totalPrice: number;
}

export default function ClientInvoiceDetail() {
  const { projectId, invoiceId } = useParams<{ projectId: string; invoiceId: string }>();
  const [, navigate] = useLocation();

  const { data: invoice, isLoading, isError } = useQuery<ClientInvoiceRow & {
    introductionText?: string | null;
    closingText?: string | null;
    termsAndConditions?: string | null;
    subtotal?: number;
    gstAmount?: number;
    lineBreakdown?: BreakdownLine[] | null;
  }>({
    queryKey: [`/api/client-invoices/${invoiceId}`],
    enabled: !!invoiceId,
  });

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: [`/api/client-invoices/${invoiceId}/payments`],
    enabled: !!invoiceId,
  });

  const { data: customItems = [] } = useQuery<CustomItem[]>({
    queryKey: [`/api/client-invoices/${invoiceId}/items`],
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Invoice">
        <ClientLoading label="Loading invoice…" />
      </ClientPage>
    );
  }

  if (isError || !invoice) {
    return (
      <ClientPage title="Invoice">
        <ClientError message="This invoice isn't available. Your builder may not have sent it yet." />
      </ClientPage>
    );
  }

  const { label, tone } = invoiceStatus(invoice);
  const lines = invoice.lineBreakdown ?? [];

  return (
    <ClientPage
      title={invoice.name}
      description={[invoice.invoiceNumber, `Issued ${format(new Date(invoice.invoiceDate), "d MMM yyyy")}`].filter(Boolean).join(" · ")}
      aside={<ClientStatus label={label} tone={tone} />}
    >
      <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${projectId}/client-invoices`)} className="-ml-2" data-testid="button-back-to-invoices">
        <ArrowLeft className="h-4 w-4 mr-2" />
        All invoices
      </Button>

      <Card>
        <CardContent className="p-4 md:p-6 space-y-5">
          {invoice.introductionText && <p className="text-sm whitespace-pre-wrap">{invoice.introductionText}</p>}

          <div>
            {lines.map((line, i) => (
              <div key={`${line.source}-${i}`} className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
                <div className="min-w-0 font-medium">{line.description}</div>
                <div className="tabular-nums shrink-0">{formatCents(line.amountIncCents)}</div>
              </div>
            ))}
            {customItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
                <div className="min-w-0">
                  <div className="font-medium">{item.name || item.description}</div>
                  {item.name && item.description && (
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <div className="tabular-nums shrink-0">{formatCents(item.totalPrice)}</div>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            {invoice.subtotal != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (ex GST)</span>
                <span className="tabular-nums">{formatCents(invoice.subtotal)}</span>
              </div>
            )}
            {invoice.gstAmount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">GST</span>
                <span className="tabular-nums">{formatCents(invoice.gstAmount)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCents(invoice.totalAmount ?? 0)}</span>
            </div>
            {!!invoice.paidAmount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span className="tabular-nums">−{formatCents(invoice.paidAmount)}</span>
              </div>
            )}
            {invoice.balanceAmount != null && (
              <div className="flex justify-between font-medium">
                <span>Balance due</span>
                <span className="tabular-nums">{formatCents(invoice.balanceAmount)}</span>
              </div>
            )}
          </div>

          {invoice.closingText && <p className="text-sm whitespace-pre-wrap">{invoice.closingText}</p>}

          {invoice.termsAndConditions && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Terms and conditions</summary>
              <p className="mt-2 whitespace-pre-wrap">{invoice.termsAndConditions}</p>
            </details>
          )}
        </CardContent>
      </Card>

      {payments.length > 0 && (
        <Card>
          <CardContent className="p-4 md:p-6">
            <h2 className="font-medium mb-2">Payments received</h2>
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-b last:border-b-0">
                <span className="text-muted-foreground">
                  {format(new Date(p.paymentDate), "d MMM yyyy")}
                  {p.paymentMethod ? ` · ${p.paymentMethod}` : ""}
                  {p.reference ? ` · ${p.reference}` : ""}
                </span>
                <span className="tabular-nums">{formatCents(p.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </ClientPage>
  );
}
