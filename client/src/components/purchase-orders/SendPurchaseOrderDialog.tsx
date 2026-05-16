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
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PurchaseOrderDocument } from "./pdf/PurchaseOrderDocument";
import type { PurchaseOrder, PurchaseOrderItem } from "@shared/schema";

interface Company {
  name: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

interface Supplier {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  abn?: string | null;
}

interface Project {
  name?: string | null;
  address?: string | null;
}

interface SendPurchaseOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseOrder: PurchaseOrder;
  items: PurchaseOrderItem[];
  supplier?: Supplier | null;
  company?: Company | null;
  project?: Project | null;
  brandColor?: string;
  documentStyle?: "style1" | "style2";
  logoUrl?: string | null;
  onSuccess?: () => void;
}

export function SendPurchaseOrderDialog({
  open,
  onOpenChange,
  purchaseOrder,
  items,
  supplier,
  company,
  project,
  brandColor = "#6d28d9",
  documentStyle = "style1",
  logoUrl,
  onSuccess,
}: SendPurchaseOrderDialogProps) {
  const { toast } = useToast();
  const po = purchaseOrder as any;

  const [to, setTo] = useState(supplier?.email || "");
  const [subject, setSubject] = useState(`Purchase Order ${po.poNumber}`);
  const [body, setBody] = useState(
    `Hi ${supplier?.name || ""},\n\nPlease find attached Purchase Order ${po.poNumber}.\n\nKind regards`
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (open) {
      setTo(supplier?.email || "");
      setSubject(`Purchase Order ${po.poNumber}`);
      setBody(
        `Hi ${supplier?.name || ""},\n\nPlease find attached Purchase Order ${po.poNumber}.\n\nKind regards`
      );
      setAttachPdf(true);
    }
  }, [open, supplier, po.poNumber]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setIsSending(true);
    try {
      let pdfBase64: string | undefined;
      if (attachPdf) {
        const blob = await pdf(
          <PurchaseOrderDocument
            purchaseOrder={po}
            items={items as any}
            company={company}
            supplier={supplier}
            project={project}
            brandColor={brandColor}
            documentStyle={documentStyle}
            logoUrl={logoUrl}
          />
        ).toBlob();
        const arrayBuf = await blob.arrayBuffer();
        pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));
      }
      await apiRequest(`/api/purchase-orders/${purchaseOrder.id}/send`, "POST", {
        to,
        subject,
        body,
        pdfBase64,
        pdfFilename: `PO-${po.poNumber}.pdf`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", purchaseOrder.id] });
      await queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      onSuccess?.();
      onOpenChange(false);
      toast({ title: "Purchase order sent", description: `PO emailed to ${to}` });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err?.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send Purchase Order</DialogTitle>
          <DialogDescription>
            {po.poNumber} will be emailed to the supplier and marked as Sent.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Supplier Email
            </Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="supplier@example.com"
              className="mt-1"
              data-testid="input-send-email"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Subject
            </Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Message
            </Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="po-attach-pdf"
              type="checkbox"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="po-attach-pdf" className="text-sm text-muted-foreground">
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
            data-testid="button-confirm-send"
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-1" />
                Send Purchase Order
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
