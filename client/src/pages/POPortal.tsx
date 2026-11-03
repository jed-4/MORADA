import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PortalLayout } from "@/components/portal/PortalLayout";
import { PortalLoading, PortalError } from "@/components/portal/PortalStateBoundary";
import { formatCents } from "@shared/money";
import { sanitizeNoteHtml } from "@/lib/sanitize";

interface PortalPOData {
  purchaseOrder: {
    poNumber: string;
    title: string | null;
    description: string | null;
    scope: string | null;
    termsAndConditions: string | null;
    poDate: string;
    requiredByDate: string | null;
    deliveryAddress: string | null;
    deliveryInstructions: string | null;
    supplierName: string | null;
    gstMode: "inclusive" | "exclusive" | "gst_free";
    subtotal: number;
    gstAmount: number;
    total: number;
    status: string;
  };
  items: { description: string; quantity: string | number; unit: string | null; unitPrice: number; total: number }[];
  companyName: string | null;
  projectName: string | null;
  projectAddress: string | null;
  acceptance: { name: string; acceptedAt: string } | null;
}

export default function POPortal() {
  const { token } = useParams<{ token: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PortalPOData | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/portal/po/${token}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) setError(body.error || "Failed to load purchase order");
        else setData(body);
      })
      .catch(() => setError("Failed to connect to server"))
      .finally(() => setIsLoading(false));
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/portal/po/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to accept purchase order");
      setData((d) => (d ? { ...d, acceptance: body.acceptance, purchaseOrder: { ...d.purchaseOrder, status: "accepted" } } : d));
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <PortalLoading message="Loading purchase order…" />;
  if (error) return <PortalError title="Unable to load purchase order" description={error} />;
  if (!data) return null;

  const { purchaseOrder: po, items, acceptance } = data;
  const exclusive = po.gstMode === "exclusive";

  return (
    <PortalLayout
      title={`Purchase Order ${po.poNumber}`}
      subtitle={data.companyName ?? undefined}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{po.title || `Purchase Order ${po.poNumber}`}</CardTitle>
            {po.supplierName && <CardDescription>To {po.supplierName}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {data.projectName && (
                <div>
                  <dt className="text-muted-foreground">Project</dt>
                  <dd>{data.projectName}</dd>
                  {data.projectAddress && <dd className="text-muted-foreground">{data.projectAddress}</dd>}
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">PO date</dt>
                <dd>{format(new Date(po.poDate), "d MMM yyyy")}</dd>
              </div>
              {po.requiredByDate && (
                <div>
                  <dt className="text-muted-foreground">Required by</dt>
                  <dd>{format(new Date(po.requiredByDate), "d MMM yyyy")}</dd>
                </div>
              )}
              {po.deliveryAddress && (
                <div>
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="whitespace-pre-line">{po.deliveryAddress}</dd>
                  {po.deliveryInstructions && (
                    <dd className="text-muted-foreground whitespace-pre-line">{po.deliveryInstructions}</dd>
                  )}
                </div>
              )}
            </dl>
            {po.description && <p className="whitespace-pre-line">{po.description}</p>}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.description}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(item.quantity)} {item.unit ?? ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(item.unitPrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCents(item.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t px-4 py-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal (ex GST)</span>
                  <span className="tabular-nums">{formatCents(po.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST</span>
                  <span className="tabular-nums">{formatCents(po.gstAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total (inc GST)</span>
                  <span className="tabular-nums" data-testid="text-portal-po-total">{formatCents(po.total)}</span>
                </div>
                {exclusive && (
                  <p className="text-xs text-muted-foreground pt-1">Line prices are ex GST.</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {po.scope && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scope of work</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(po.scope) }} />
            </CardContent>
          </Card>
        )}

        {po.termsAndConditions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Terms and conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(po.termsAndConditions) }} />
            </CardContent>
          </Card>
        )}

        {acceptance ? (
          <Card data-testid="card-po-accepted">
            <CardContent className="flex items-center gap-3 py-5">
              <CheckCircle2 className="h-6 w-6 text-status-success shrink-0" />
              <div>
                <p className="font-medium">Accepted by {acceptance.name}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(acceptance.acceptedAt), "d MMM yyyy, h:mm a")}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : po.status === "sent" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Accept this purchase order</CardTitle>
              <CardDescription>
                By accepting, you agree to supply the above for the amount shown.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAccept} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="accept-name">Your name</Label>
                    <Input
                      id="accept-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      data-testid="input-accept-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="accept-email">Email (optional)</Label>
                    <Input
                      id="accept-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-accept-email"
                    />
                  </div>
                </div>
                {submitError && <p className="text-sm text-destructive">{submitError}</p>}
                <Button type="submit" disabled={isSubmitting || !name.trim()} data-testid="button-accept-po">
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Accept purchase order
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-5 text-sm text-muted-foreground">
              {po.status === "cancelled"
                ? "This purchase order has been cancelled."
                : po.status === "draft"
                  ? "This purchase order hasn't been issued yet."
                  : "This purchase order is already under way. Contact the builder if anything needs to change."}
            </CardContent>
          </Card>
        )}
      </div>
    </PortalLayout>
  );
}
