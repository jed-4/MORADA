import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isPlausibleEmail, suggestEmailFix, type EmailLogDetail } from "@shared/emailLog";
import { BouncedAddressWarning } from "./BouncedAddressWarning";

const split = (s: string) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);

/**
 * Send the stored copy again — usually to a corrected address. The email that
 * prompted the whole log went to `name_@gmail.com`; the fix should be one edit
 * and one click, and the address book should learn the right address too.
 */
export function ResendEmailDialog({
  email,
  open,
  onOpenChange,
  onResent,
}: {
  email: EmailLogDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResent: (newId: string | null) => void;
}) {
  const { toast } = useToast();
  const original = email.toAddresses;
  const [to, setTo] = useState("");
  const [updateAddressBook, setUpdateAddressBook] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Pre-fill with the likely fix when there is one, so the common case is
    // a glance and a click.
    setTo(original.map((a) => suggestEmailFix(a) ?? a).join(", "));
  }, [open, original]);

  const addresses = split(to);
  const valid = addresses.length > 0 && addresses.every(isPlausibleEmail);
  // Only an address that FAILED is replaced in the address book. Resending a
  // delivered email to someone else ("send it to my wife too") must never
  // overwrite the client's good address.
  const originalFailed = ["bounced", "complained", "failed"].includes(email.status);
  const changedSingle =
    originalFailed && original.length === 1 && addresses.length === 1 && original[0].toLowerCase() !== addresses[0].toLowerCase();

  const resend = useMutation({
    mutationFn: async () => {
      // apiRequest already parses the body (and throws the server's message).
      return (await apiRequest(`/api/email-deliveries/${email.id}/resend`, "POST", {
        to: addresses,
        updateAddressBook: changedSingle && updateAddressBook,
      })) as {
        deliveryId: string | null;
        addressBook: { contacts: number; suppliers: number; supplierContacts: number } | null;
      };
    },
    onSuccess: (result) => {
      // Every email-log view, including contact histories keyed by URL.
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("/api/email-deliveries"),
      });
      const book = result.addressBook;
      const updated = book ? book.contacts + book.suppliers + book.supplierContacts : 0;
      toast({
        title: `Resent to ${addresses.join(", ")}`,
        description: updated
          ? `Also updated ${updated} address book ${updated === 1 ? "entry" : "entries"} to the new address.`
          : book
            ? "No contact or supplier had the old address, so the address book is unchanged."
            : undefined,
      });
      onOpenChange(false);
      onResent(result.deliveryId);
    },
    onError: (err: any) => {
      toast({ title: "Not resent", description: err?.message || "The email could not be resent.", variant: "destructive" });
    },
  });

  const subjectLabel = email.subject ? `"${email.subject}"` : "this email";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resend email</DialogTitle>
          <DialogDescription>
            Sends {subjectLabel} again exactly as it was{email.attachments.length ? ", attachments included" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="resend-to">To</Label>
            <Input
              id="resend-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@example.com"
              autoFocus
              data-testid="input-resend-to"
            />
            {original.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Originally sent to <span className="break-all">{original.join(", ")}</span>
              </p>
            )}
            <BouncedAddressWarning
              emails={addresses}
              onUseSuggestion={(bad, fix) =>
                setTo(addresses.map((a) => (a.toLowerCase() === bad.toLowerCase() ? fix : a)).join(", "))
              }
            />
          </div>

          {changedSingle && (
            <div className="flex flex-row items-start gap-3 rounded-lg border p-3">
              <Checkbox
                id="resend-update-book"
                checked={updateAddressBook}
                onCheckedChange={(v) => setUpdateAddressBook(v === true)}
                data-testid="checkbox-resend-update-address-book"
              />
              <Label htmlFor="resend-update-book" className="text-sm font-normal leading-snug">
                Replace <span className="font-medium break-all">{original[0]}</span> with the new address on any contact
                or supplier that uses it
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => resend.mutate()} disabled={!valid || resend.isPending} data-testid="button-confirm-resend">
            {resend.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Resend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
