import { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InvoiceDocument } from "./pdf/InvoiceDocument";
import type { ClientInvoice } from "@shared/schema";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface InvoiceLineItem {
  label: string;
  description?: string | null;
  claimPct?: number | null;
  amountExTax: number;
  gst: number;
  amountIncTax: number;
}

interface SendInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: ClientInvoice;
  lineItems: InvoiceLineItem[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  paidCents: number;
  balanceDueCents: number;
  company?: Company | null;
  clientName?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  brandColor?: string;
  clientEmail?: string;
  initialSubject?: string;
  initialBody?: string;
  onSuccess?: () => void;
}

export function SendInvoiceDialog({
  open,
  onOpenChange,
  invoice,
  lineItems,
  subtotalCents,
  gstCents,
  totalCents,
  paidCents,
  balanceDueCents,
  company,
  clientName,
  projectName,
  projectAddress,
  brandColor = "#6d28d9",
  clientEmail,
  initialSubject,
  initialBody,
  onSuccess,
}: SendInvoiceDialogProps) {
  const { toast } = useToast();
  const [to, setTo] = useState(clientEmail || "");
  const [subject, setSubject] = useState(initialSubject || "");
  const [body, setBody] = useState(initialBody || "");
  const [attachPdf, setAttachPdf] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(clientEmail || "");
      setSubject(initialSubject || "");
      setBody(initialBody || "");
      setAttachPdf(true);
    }
  }, [open, clientEmail, initialSubject, initialBody]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setIsSending(true);
    try {
      let pdfBase64: string | undefined;
      if (attachPdf) {
        const blob = await pdf(
          <InvoiceDocument
            invoiceNumber={invoice.invoiceNumber || `INV-${invoice.id.slice(0, 8)}`}
            issueDate={invoice.invoiceDate}
            dueDate={invoice.dueDate}
            company={company}
            clientName={clientName}
            projectName={projectName}
            projectAddress={projectAddress}
            lineItems={lineItems}
            subtotalCents={subtotalCents}
            gstCents={gstCents}
            totalCents={totalCents}
            paidCents={paidCents}
            balanceDueCents={balanceDueCents}
            brandColor={brandColor}
          />
        ).toBlob();
        const arrayBuf = await blob.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }
      await apiRequest(`/api/client-invoices/${invoice.id}/send-email`, "POST", {
        to,
        subject,
        body,
        pdfBase64,
        pdfFilename: `invoice-${invoice.invoiceNumber || "export"}.pdf`,
      });
      await queryClient.invalidateQueries({ queryKey: [`/api/client-invoices/${invoice.id}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/client-invoices"] });
      onSuccess?.();
      onOpenChange(false);
      toast({ title: "Invoice sent", description: `Invoice emailed to ${to}` });
    } catch (err: any) {
      toast({ title: "Failed to send email", description: err?.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-send-invoice-email">
        <DialogHeader>
          <DialogTitle>Email Invoice</DialogTitle>
          <DialogDescription>Send this invoice to the client by email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              To
            </label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="client@example.com"
              className="mt-1"
              data-testid="input-invoice-send-to"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Subject
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="inv-attach-pdf"
              type="checkbox"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="inv-attach-pdf" className="text-sm text-muted-foreground">
              Attach PDF copy
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!to.trim() || isSending}
            data-testid="button-confirm-send-invoice-email"
          >
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
