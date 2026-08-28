import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Mail, MailX, Paperclip, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Rfq, RfqRecipient } from "@shared/schema";
import { cn } from "@/lib/utils";

/**
 * Sends the RFQ. Actually sends it.
 *
 * The previous version orchestrated four calls from the browser, none of which
 * emailed anything (there was a literal "TODO: implement actual email sending"),
 * and its status PATCH was silently stripped by the server's schema — yet it
 * still toasted "RFQ sent to N suppliers". One server call now mints a portal
 * token per supplier, emails them with the PDF and their own link, and stamps
 * the status.
 */
export function SendRFQDialog({
  open,
  onOpenChange,
  rfq,
  getPdf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: Rfq;
  /** Builds the PDF on demand. Called only if the user keeps the attachment
   *  checked, so opening this dialog costs nothing. */
  getPdf: () => Promise<Blob | null>;
}) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [attachPdf, setAttachPdf] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: recipients = [] } = useQuery<RfqRecipient[]>({
    queryKey: ["/api/rfqs", rfq.id, "recipients"],
    enabled: open,
  });

  const [subject, setSubject] = useState("Request for quote: {{rfq_number}} — {{rfq_title}}");
  const [message, setMessage] = useState(
    "Hi {{supplier_name}},\n\n" +
      "We'd like a price for {{rfq_title}}.\n\n" +
      "You can review the details and send your quote back here: {{portal_link}}\n\n" +
      "Thanks,\n{{sender_name}}\n{{company_name}}",
  );

  // Default to everyone not already sent to, so re-opening after adding a
  // supplier chases only the new one rather than spamming the rest.
  useEffect(() => {
    if (!open) return;
    const unsent = recipients.filter((r) => r.status === "not_sent").map((r) => r.id);
    setSelectedIds(unsent.length > 0 ? unsent : recipients.map((r) => r.id));
  }, [open, recipients]);

  const selected = useMemo(
    () => recipients.filter((r) => selectedIds.includes(r.id)),
    [recipients, selectedIds],
  );
  const missingEmail = selected.filter((r) => !r.isExternal && !r.supplierEmail);
  const externals = selected.filter((r) => r.isExternal);
  const emailable = selected.filter((r) => !r.isExternal && r.supplierEmail);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleSend = async () => {
    if (selected.length === 0) {
      toast({ title: "Select at least one supplier", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      let pdfBase64: string | undefined;
      const pdfBlob = attachPdf ? await getPdf() : null;
      if (pdfBlob) {
        const buf = await pdfBlob.arrayBuffer();
        // Chunked: String.fromCharCode(...bytes) blows the argument limit on a
        // multi-page PDF.
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
        }
        pdfBase64 = btoa(binary);
      }

      const result: any = await apiRequest(`/api/rfqs/${rfq.id}/send`, "POST", {
        recipientIds: selectedIds,
        subject,
        message,
        pdfBase64,
        pdfFilename: `RFQ-${rfq.rfqNumber}.pdf`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id, "recipients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfq-recipients"] });

      // Report what actually happened, per supplier — the old dialog claimed
      // success unconditionally.
      const sentCount = result?.sent?.length ?? 0;
      const failedList = result?.failed ?? [];
      if (failedList.length > 0) {
        toast({
          title: sentCount > 0 ? "Sent with problems" : "Send failed",
          description: `${sentCount} sent. Failed: ${failedList.map((f: any) => f.supplierName).join(", ")}`,
          variant: "destructive",
        });
      } else {
        const skipped = result?.skipped ?? [];
        toast({
          title: sentCount > 0 ? `RFQ sent to ${sentCount} supplier${sentCount === 1 ? "" : "s"}` : "RFQ marked as sent",
          description:
            skipped.length > 0
              ? `${skipped.map((s: any) => s.supplierName).join(", ")} — link ready to copy instead.`
              : undefined,
        });
      }
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Send failed", description: error?.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send {rfq.rfqNumber}</DialogTitle>
          <DialogDescription>
            Each supplier gets their own portal link so you can see who opened it and who came back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs">Send to</Label>
            {recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No suppliers on this RFQ yet — add one first.
              </p>
            ) : (
              <div className="border rounded-md divide-y divide-border/40 max-h-[200px] overflow-y-auto">
                {recipients.map((recipient) => (
                  <label
                    key={recipient.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover-elevate"
                  >
                    <Checkbox
                      checked={selectedIds.includes(recipient.id)}
                      onCheckedChange={() => toggle(recipient.id)}
                      data-testid={`checkbox-send-${recipient.id}`}
                    />
                    <span className="text-sm flex-1 truncate">{recipient.supplierName}</span>
                    {recipient.isExternal ? (
                      <Badge variant="outline" className="text-data">External</Badge>
                    ) : recipient.supplierEmail ? (
                      <span className="text-data text-muted-foreground truncate max-w-[200px]">
                        {recipient.supplierEmail}
                      </span>
                    ) : (
                      <span className="text-data text-coral flex items-center gap-1">
                        <MailX className="w-3 h-3" />
                        no email
                      </span>
                    )}
                    {recipient.status !== "not_sent" && (
                      <Badge variant="secondary" className="text-data">already sent</Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {(missingEmail.length > 0 || externals.length > 0) && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 border border-border/50">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                {missingEmail.length > 0 && (
                  <p>
                    {missingEmail.map((r) => r.supplierName).join(", ")} —{" "}
                    {missingEmail.length === 1 ? "has" : "have"} no email address. They'll be marked
                    as sent and you can copy their portal link from the supplier row.
                  </p>
                )}
                {externals.length > 0 && (
                  <p>
                    {externals.map((r) => r.supplierName).join(", ")} —{" "}
                    {externals.length === 1 ? "is" : "are"} tracked outside Morada, so nothing is
                    emailed.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="input-email-subject" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[140px] text-sm"
              data-testid="textarea-email-message"
            />
            <p className="text-data text-muted-foreground">
              {"{{supplier_name}}, {{rfq_number}}, {{rfq_title}}, {{due_date}}, {{portal_link}}, {{sender_name}}, {{company_name}} are filled in per supplier."}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={attachPdf}
              onCheckedChange={(c) => setAttachPdf(c as boolean)}
              data-testid="checkbox-attach-pdf"
            />
            <span className="text-sm flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" />
              Attach the RFQ as a PDF
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isSending || selected.length === 0}
            className="bg-primary hover:bg-primary/90 text-white"
            data-testid="button-confirm-send"
          >
            {isSending ? (
              "Sending..."
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {emailable.length > 0
                  ? `Send to ${emailable.length} supplier${emailable.length === 1 ? "" : "s"}`
                  : "Mark as sent"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
