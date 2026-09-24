import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Send, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { formatCents } from "@shared/money";
import { expiryFromDays } from "@shared/proposalExpiry";
import { format } from "date-fns";
import type { Contact, Proposal } from "@shared/schema";

interface Recipient {
  name?: string;
  email: string;
}

interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  client?: Contact;
  companyName?: string;
  /** The rendered document. Send is blocked until the preview has produced it. */
  pdfBlob: Blob | null;
}

/**
 * Convert the rendered PDF to base64 for the send request.
 * FileReader handles documents of any size natively — hand-rolling the
 * encoding means chunking around the call-stack limit in String.fromCharCode.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // Strip the "data:application/pdf;base64," prefix.
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the generated PDF"));
    reader.readAsDataURL(blob);
  });
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function SendProposalDialog({
  open,
  onOpenChange,
  proposal,
  client,
  companyName,
  pdfBlob,
}: SendProposalDialogProps) {
  const { toast } = useToast();

  // Residential proposals usually go to both partners, and the contact record
  // already carries the second address.
  const suggested = useMemo<Recipient[]>(() => {
    const out: Recipient[] = [];
    if (client?.email) out.push({ name: client.name ?? undefined, email: client.email });
    if (client?.spouseEmail) {
      out.push({ name: client.spouseName ?? undefined, email: client.spouseEmail });
    }
    return out;
  }, [client]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [chase, setChase] = useState(false);
  // How long the pricing holds. Blank means open-ended — no expiry, and the
  // "price about to lapse" follow-up has nothing to fire from.
  const [validDays, setValidDays] = useState<string>("30");

  // Re-seed each time the dialog opens so an abandoned edit doesn't persist.
  useEffect(() => {
    if (!open) return;
    setRecipients(suggested);
    setNewEmail("");
    setSubject(`${companyName || "Our"} proposal ${proposal.proposalNumber}: ${proposal.name}`);
    setMessage("");
    // Chasing is opt-in every time, deliberately: it is never carried over
    // from a previous send or pre-ticked.
    setChase(false);
    // Only offer to set an expiry when the proposal does not already carry one.
    setValidDays(proposal.expiryDate ? "" : "30");
  }, [open, suggested, companyName, proposal.proposalNumber, proposal.name]);

  const addRecipient = () => {
    const email = newEmail.trim();
    if (!isValidEmail(email)) {
      toast({ title: "Enter a valid email address", variant: "destructive" });
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === email.toLowerCase())) {
      toast({ title: "That address is already on the list" });
      setNewEmail("");
      return;
    }
    setRecipients((prev) => [...prev, { email }]);
    setNewEmail("");
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!pdfBlob) throw new Error("The proposal PDF is still generating");
      const pdfBase64 = await blobToBase64(pdfBlob);
      const res = await fetch(`/api/proposals/${proposal.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
          pdfBase64,
          pdfFilename: `${proposal.proposalNumber}.pdf`,
          remindersEnabled: chase,
          ...(expiresOn ? { expiryDate: expiresOn.toISOString() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.details || body.error || "Failed to send proposal");
      return body as { sent: string[]; failed: { email: string; error: string }[] };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", proposal.id] });
      // The proposal is sent either way — its snapshot is frozen and the link
      // is live — so a partial failure is reported, not treated as a failure.
      if (result.failed?.length) {
        toast({
          variant: "destructive",
          title: `Sent to ${result.sent.length}, failed for ${result.failed.length}`,
          description: result.failed.map((f) => `${f.email}: ${f.error}`).join("; "),
        });
      } else {
        toast({
          title: "Proposal sent",
          description: `Emailed to ${result.sent.join(", ")}.`,
        });
      }
      onOpenChange(false);
    },
    onError: (e: unknown) => {
      toast({
        variant: "destructive",
        title: "Could not send proposal",
        description: e instanceof Error ? e.message : "Something went wrong",
      });
    },
  });

  // Parsed once: an empty or junk value means "no expiry", never day zero.
  const parsedDays = Number.parseInt(validDays, 10);
  const expiresOn =
    Number.isFinite(parsedDays) && parsedDays > 0 ? expiryFromDays(parsedDays) : null;

  const total = Number(proposal.totalAmount ?? 0);
  const canSend = recipients.length > 0 && !!pdfBlob && !sendMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-send-proposal">
        <DialogHeader>
          <DialogTitle>Send proposal</DialogTitle>
          <DialogDescription>
            The client gets the PDF attached and a link to review and sign it online.
            Sending freezes a copy of the proposal as it stands now.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Recipients</Label>
            {recipients.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="text-no-recipients">
                {client
                  ? "This project's client has no email address on file. Add one below."
                  : "No client is linked to this project. Add a recipient below."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {recipients.map((r) => (
                  <Badge
                    key={r.email}
                    variant="secondary"
                    className="gap-1.5 py-1 pl-2.5 pr-1"
                    data-testid={`badge-recipient-${r.email}`}
                  >
                    <span>{r.name ? `${r.name} · ${r.email}` : r.email}</span>
                    <button
                      type="button"
                      onClick={() => setRecipients((prev) => prev.filter((x) => x.email !== r.email))}
                      aria-label={`Remove ${r.email}`}
                      className="rounded-sm p-0.5 hover-elevate"
                      data-testid={`button-remove-recipient-${r.email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRecipient();
                  }
                }}
                placeholder="Add another email address"
                type="email"
                data-testid="input-add-recipient"
              />
              <Button type="button" variant="outline" onClick={addRecipient} data-testid="button-add-recipient">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-subject">Subject</Label>
            <Input
              id="send-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="input-send-subject"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="send-message">Message</Label>
            <Textarea
              id="send-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Leave blank to use the standard covering note."
              data-testid="textarea-send-message"
            />
          </div>

          {!proposal.expiryDate && (
            <div className="space-y-2">
              <Label htmlFor="valid-days">Pricing valid for</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="valid-days"
                  type="number"
                  min={1}
                  max={365}
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                  className="w-24"
                  data-testid="input-valid-days"
                />
                <span className="text-sm text-muted-foreground">
                  {expiresOn
                    ? `days — until ${format(expiresOn, "d MMM yyyy")}`
                    : "days — leave blank for no expiry"}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 rounded-md border p-3">
            <Switch
              checked={chase}
              onCheckedChange={setChase}
              id="send-chase"
              className="mt-0.5"
              data-testid="switch-send-reminders"
            />
            <div className="space-y-1">
              <Label htmlFor="send-chase" className="cursor-pointer">
                Follow up if there's no reply
              </Label>
              <p className="text-xs text-muted-foreground">
                A gentle nudge 5 days after sending
                {expiresOn || proposal.expiryDate
                  ? ", and a note 3 days before the price lapses"
                  : " (the \u201cprice about to lapse\u201d note needs an expiry date to fire)"}
                . Both stop the moment the client responds. You can change the
                wording, or turn this off, from the proposal at any time.
              </p>
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Proposal total (inc GST)</span>
              <span className="font-semibold tabular-nums" data-testid="text-send-total">
                {formatCents(total)}
              </span>
            </div>
            {total === 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  The total is recalculated from the linked estimate when you send. If it
                  stays $0.00, check that an estimate revision is linked.
                </span>
              </p>
            )}
          </div>

          {!pdfBlob && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-pdf-pending">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for the PDF to finish generating…
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-send">
            Cancel
          </Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!canSend}
            data-testid="button-confirm-send"
          >
            {sendMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send to {recipients.length || 0} recipient{recipients.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
