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
import { VariationDocument } from "./pdf/VariationDocument";
import type { Variation, VariationItem } from "@shared/schema";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface Project {
  name: string;
  address?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
}

interface SendVariationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variation: Variation;
  variationId: string;
  items: VariationItem[];
  bills?: any[];
  company?: Company | null;
  project?: Project | null;
  brandColor?: string;
  clientEmail?: string;
  initialSubject?: string;
  initialBody?: string;
  currentUser?: { firstName?: string; lastName?: string };
  onSuccess?: () => void;
}

export function SendVariationDialog({
  open,
  onOpenChange,
  variation,
  variationId,
  items,
  bills = [],
  company,
  project,
  brandColor = "#6d28d9",
  clientEmail,
  initialSubject,
  initialBody,
  onSuccess,
}: SendVariationDialogProps) {
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
          <VariationDocument
            variation={variation as any}
            items={items}
            bills={bills}
            company={company}
            project={project}
            brandColor={brandColor}
          />
        ).toBlob();
        const arrayBuf = await blob.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }
      await apiRequest(`/api/variations/${variationId}/send`, "POST", {
        to,
        subject,
        body,
        pdfBase64,
        pdfFilename: `variation-${(variation as any).variationNumber || "export"}.pdf`,
      });
      await queryClient.invalidateQueries({ queryKey: [`/api/variations/${variationId}`] });
      onSuccess?.();
      onOpenChange(false);
      toast({ title: "Email sent", description: `Variation sent to ${to}` });
    } catch (err: any) {
      toast({ title: "Failed to send email", description: err?.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-send-variation">
        <DialogHeader>
          <DialogTitle>Send Variation to Client</DialogTitle>
          <DialogDescription>
            Email the client a link to view and approve this variation online.
          </DialogDescription>
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
              data-testid="input-send-to"
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
              data-testid="input-send-subject"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="mt-1"
              data-testid="textarea-send-body"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="var-attach-pdf"
              type="checkbox"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="var-attach-pdf" className="text-sm text-muted-foreground">
              Attach PDF copy
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
            data-testid="button-cancel-send"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!to.trim() || isSending}
            data-testid="button-confirm-send"
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
