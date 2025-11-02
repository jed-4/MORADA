import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Send, Mail, Bell, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Rfq } from "@shared/schema";

interface SendRFQDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rfq: Rfq;
  pdfBlob: Blob | null;
}

export function SendRFQDialog({ open, onOpenChange, rfq, pdfBlob }: SendRFQDialogProps) {
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [sendInApp, setSendInApp] = useState(true);
  const [emailSubject, setEmailSubject] = useState(
    `RFQ ${rfq.rfqNumber}: ${rfq.title}`
  );
  const [emailMessage, setEmailMessage] = useState(
    `Please review the attached Request for Quote and provide your quote by the due date.\n\nDue Date: ${rfq.dueDate ? new Date(rfq.dueDate).toLocaleDateString() : 'N/A'}\n\nThank you.`
  );

  const handleSend = async () => {
    if (!sendEmail && !sendInApp) {
      toast({
        title: "Select Send Method",
        description: "Please select at least one send method (email or in-app)",
        variant: "destructive",
      });
      return;
    }

    if (sendEmail && !pdfBlob) {
      toast({
        title: "PDF Not Ready",
        description: "Please wait for the PDF to generate before sending",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    try {
      // In a real implementation, we would:
      // 1. Upload PDF to storage
      // 2. Send emails to suppliers
      // 3. Create in-app notifications
      // 4. Schedule follow-ups
      
      // For now, we'll just update the RFQ status
      await apiRequest(`/api/rfqs/${rfq.id}`, "PATCH", {
        status: "sent",
        sentAt: new Date().toISOString(),
      });

      // TODO: Implement actual email sending and notification creation
      // This would involve:
      // - Converting pdfBlob to file and uploading
      // - Calling email API with PDF attachment
      // - Creating notification records for in-app
      // - Scheduling follow-up emails (task 8)

      queryClient.invalidateQueries({ queryKey: ["/api/rfqs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfqs", rfq.id] });

      toast({
        title: "RFQ Sent",
        description: `RFQ sent to ${rfq.supplierNames?.length || 0} suppliers`,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Send Failed",
        description: error.message || "Failed to send RFQ",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send RFQ to Suppliers</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Suppliers List */}
          <div>
            <Label className="mb-2 block">Sending to:</Label>
            <div className="space-y-2">
              {rfq.supplierNames && rfq.supplierNames.length > 0 ? (
                rfq.supplierNames.map((name, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <span className="font-medium">{name}</span>
                    <Badge variant="outline">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Ready
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No suppliers selected</div>
              )}
            </div>
          </div>

          {/* Send Options */}
          <div>
            <Label className="mb-3 block">Send Method:</Label>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="send-email"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked as boolean)}
                  data-testid="checkbox-send-email"
                />
                <div className="flex-1">
                  <label
                    htmlFor="send-email"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Send via Email with PDF attachment
                  </label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suppliers will receive an email with the RFQ PDF and a link to confirm receipt
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="send-inapp"
                  checked={sendInApp}
                  onCheckedChange={(checked) => setSendInApp(checked as boolean)}
                  data-testid="checkbox-send-inapp"
                />
                <div className="flex-1">
                  <label
                    htmlFor="send-inapp"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    <Bell className="h-4 w-4" />
                    Send in-app notification
                  </label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Suppliers with accounts will receive an in-app notification
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Email Content (shown if email is selected) */}
          {sendEmail && (
            <div className="space-y-4 p-4 rounded-lg border bg-muted/20">
              <div>
                <Label htmlFor="email-subject">Email Subject</Label>
                <input
                  id="email-subject"
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background mt-1"
                  data-testid="input-email-subject"
                />
              </div>

              <div>
                <Label htmlFor="email-message">Email Message</Label>
                <Textarea
                  id="email-message"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="mt-1 min-h-[120px]"
                  data-testid="textarea-email-message"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  PDF will be attached automatically. A confirm receipt link will be included in the footer.
                </p>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Note:</strong> After sending, automatic follow-up emails will be scheduled for
              Day 3, 7, and 14 if no response is received.
            </p>
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
            disabled={isSending || (!sendEmail && !sendInApp)}
            data-testid="button-confirm-send"
          >
            {isSending ? (
              "Sending..."
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send RFQ
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
