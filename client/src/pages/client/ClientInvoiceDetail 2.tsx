import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientError, ClientLoading, ClientPage, ClientScroll } from "@/components/client/ClientPage";
import { ClientInvoiceDocument, type ClientInvoiceView } from "./ClientInvoiceDocument";

/**
 * One progress claim, as a document — the same treatment as a variation, which
 * is what Jed asked for: letterhead, who it is to, the lines, the totals and
 * the payments, rather than a screen of figures.
 */

export default function ClientInvoiceDetail() {
  const { projectId, invoiceId } = useParams<{ projectId: string; invoiceId: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, isError } = useQuery<ClientInvoiceView>({
    queryKey: [`/api/client-invoices/${invoiceId}/client-view`],
    enabled: !!invoiceId,
  });

  if (isLoading) {
    return (
      <ClientPage title="Invoice">
        <ClientLoading label="Loading invoice…" />
      </ClientPage>
    );
  }

  if (isError || !data?.invoice) {
    return (
      <ClientPage title="Invoice">
        <ClientError message="This invoice isn't available. Your builder may not have sent it yet." />
      </ClientPage>
    );
  }

  return (
    <ClientScroll>
      <div className="p-4 md:p-6 space-y-4" data-testid="client-invoice-document">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/projects/${projectId}/client-invoices`)}
          className="-ml-2"
          data-testid="button-back-to-invoices"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          All invoices
        </Button>

        <div className="rounded-lg border bg-white overflow-hidden">
          <ClientInvoiceDocument data={data} />
        </div>
      </div>
    </ClientScroll>
  );
}
