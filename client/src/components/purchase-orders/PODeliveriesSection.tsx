import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Check, Copy, Mail, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DocumentSection } from "@/components/detail/DocumentSection";
import { formatCents } from "@shared/money";
import {
  DELIVERY_CONDITION_LABELS,
  DELIVERY_STATUS_LABELS,
  supplierIssueEmail,
  type DeliveryLine,
  type DeliveryRecord,
  type DeliveryStatus,
} from "@shared/deliveries";

/** GET /api/purchase-orders/:id/delivery-summary — the office's view, with money. */
export interface PODeliverySummary {
  purchaseOrderId: string;
  deliveryStatus: DeliveryStatus;
  poTotalCents: number;
  receivedValueCents: number;
  billedCents: number;
  deliveryCount: number;
  issueCount: number;
  lastDeliveryAt: string | null;
  lines: DeliveryLine[];
  deliveries: DeliveryRecord[];
}

export function deliverySummaryKey(poId: string | null | undefined) {
  return ["/api/purchase-orders", poId, "delivery-summary"] as const;
}

export function usePODeliverySummary(poId: string | null | undefined, enabled = true) {
  return useQuery<PODeliverySummary>({
    queryKey: deliverySummaryKey(poId),
    enabled: !!poId && enabled,
  });
}

const STATUS_TONE: Record<DeliveryStatus, string> = {
  none: "bg-muted text-muted-foreground",
  partial: "bg-amber-light text-foreground",
  delivered: "bg-sage-light text-foreground",
  issues: "bg-coral-light text-foreground",
};

export function DeliveryStatusChip({ status, className = "" }: { status: DeliveryStatus | string | null | undefined; className?: string }) {
  const s = (status && status in DELIVERY_STATUS_LABELS ? status : "none") as DeliveryStatus;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_TONE[s]} ${className}`}
      data-testid={`chip-delivery-status-${s}`}
    >
      {s === "issues" && <AlertTriangle className="w-3 h-3" />}
      {DELIVERY_STATUS_LABELS[s]}
    </span>
  );
}

/**
 * "Billed $X, received about $Y" — shown on a bill whose PO is only part
 * delivered or had a problem. A warning only: approval is never blocked.
 */
export function BillDeliveryWarning({ poId, billTotalCents }: { poId: string; billTotalCents?: number }) {
  const { data } = usePODeliverySummary(poId);
  if (!data || (data.deliveryStatus !== "partial" && data.deliveryStatus !== "issues")) return null;
  const billed = data.billedCents || billTotalCents || 0;
  return (
    <div
      className="mt-1.5 flex items-start gap-2 rounded-md px-2.5 py-2 text-xs"
      style={{ background: "hsl(var(--coral-light))", borderLeft: "3px solid hsl(var(--coral))" }}
      data-testid="warning-bill-delivery"
    >
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "hsl(var(--coral))" }} />
      <div>
        <div className="font-medium">
          {data.deliveryStatus === "issues" ? "A delivery on this PO had a problem." : "This PO is only part delivered."}
        </div>
        <div className="text-muted-foreground">
          Billed {formatCents(billed)}, received about {formatCents(data.receivedValueCents)} so far
          {data.poTotalCents ? ` of ${formatCents(data.poTotalCents)} ordered` : ""}. Check before approving.
        </div>
      </div>
    </div>
  );
}

function CopyToSupplier({
  delivery,
  poNumber,
  supplierName,
  supplierEmail,
  projectName,
  deliveryAddress,
}: {
  delivery: DeliveryRecord;
  poNumber: string;
  supplierName?: string | null;
  supplierEmail?: string | null;
  projectName?: string | null;
  deliveryAddress?: string | null;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const email = supplierIssueEmail({ poNumber, supplierName, projectName, deliveryAddress, delivery });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${email.subject}\n\n${email.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied", description: "Paste it into an email to the supplier." });
    } catch {
      toast({ title: "Couldn't copy", description: "Use Open email instead.", variant: "destructive" });
    }
  };
  const mailto = `mailto:${encodeURIComponent(supplierEmail || "")}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copy} data-testid={`button-copy-supplier-email-${delivery.id}`}>
        {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
        Copy to supplier email
      </Button>
      <Button size="sm" variant="ghost" className="h-7 text-xs" asChild data-testid={`button-mailto-supplier-${delivery.id}`}>
        <a href={mailto}>
          <Mail className="w-3 h-3 mr-1" />
          Open email
        </a>
      </Button>
    </div>
  );
}

/** The Deliveries card on a PO: every check-in, with photos and problems. */
export function PODeliveriesSection({
  poId,
  poNumber,
  supplierName,
  supplierEmail,
  projectName,
  deliveryAddress,
}: {
  poId: string;
  poNumber: string;
  supplierName?: string | null;
  supplierEmail?: string | null;
  projectName?: string | null;
  deliveryAddress?: string | null;
}) {
  const { data } = usePODeliverySummary(poId);
  const deliveries = data?.deliveries ?? [];
  const outstanding = (data?.lines ?? []).filter((l) => l.qtyOutstanding > 0).length;

  return (
    <DocumentSection
      title="Deliveries"
      role={data?.deliveryStatus === "issues" ? "exception" : "supplier"}
      count={deliveries.length}
      summary={
        data && deliveries.length > 0 ? (
          <span className="inline-flex items-center gap-2">
            <DeliveryStatusChip status={data.deliveryStatus} />
            <span className="doc-body-muted tabular-nums">
              about {formatCents(data.receivedValueCents)} received
              {outstanding > 0 ? ` · ${outstanding} line${outstanding === 1 ? "" : "s"} to come` : ""}
            </span>
          </span>
        ) : undefined
      }
      defaultOpen={deliveries.length > 0}
      isEmpty={deliveries.length === 0}
      data-testid="card-po-deliveries"
    >
      {deliveries.length > 0 && (
        <div className="divide-y divide-border/60 border-t border-border/60">
          {deliveries.map((d) => (
            <div key={d.id} className="px-3.5 py-2.5 space-y-1.5" data-testid={`row-delivery-${d.id}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Truck className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium">{format(new Date(d.receivedAt), "d MMM yyyy, h:mm a")}</span>
                {d.receivedByName && <span className="doc-body-muted">by {d.receivedByName}</span>}
                {d.docketNumber && <span className="doc-body-muted">· Docket {d.docketNumber}</span>}
                {d.hasIssues && (
                  <Badge variant="destructive" className="text-[10px] h-5">Issue</Badge>
                )}
                <span className="flex-1" />
                {d.hasIssues && (
                  <CopyToSupplier
                    delivery={d}
                    poNumber={poNumber}
                    supplierName={supplierName}
                    supplierEmail={supplierEmail}
                    projectName={projectName}
                    deliveryAddress={deliveryAddress}
                  />
                )}
              </div>
              <ul className="text-xs space-y-0.5 pl-5">
                {d.items.map((it) => (
                  <li key={it.id} className="flex gap-2">
                    <span className="tabular-nums w-24 flex-shrink-0 text-muted-foreground">
                      {it.qtyReceived} of {it.qtyOrdered}
                    </span>
                    <span className="flex-1 min-w-0">
                      {it.description}
                      {it.condition !== "ok" && (
                        <span className="ml-1.5 font-medium" style={{ color: "hsl(var(--coral))" }}>
                          {DELIVERY_CONDITION_LABELS[it.condition]}
                        </span>
                      )}
                      {it.note && <span className="text-muted-foreground"> — {it.note}</span>}
                    </span>
                  </li>
                ))}
              </ul>
              {d.notes && <p className="text-xs text-muted-foreground pl-5 whitespace-pre-wrap">{d.notes}</p>}
              {(d.docketPhotoUrls.length > 0 || d.items.some((i) => i.photoUrls.length > 0)) && (
                <div className="flex gap-1.5 pl-5 flex-wrap">
                  {[...d.docketPhotoUrls, ...d.items.flatMap((i) => i.photoUrls)].map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                      <img src={url} alt="" className="h-14 w-14 rounded object-cover border border-border" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </DocumentSection>
  );
}
