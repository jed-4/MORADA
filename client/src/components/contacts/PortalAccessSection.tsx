import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Contact } from "@shared/schema";
import { GivePortalAccessDialog } from "./GivePortalAccessDialog";

type PortalAccessInfo = {
  status: "none" | "invited" | "active" | "revoked";
  email?: string | null;
  invitedAt?: string;
  expiresAt?: string;
  expired?: boolean;
  lastLoginAt?: string | null;
  projects: { id: string; name: string }[];
};

export function PortalAccessSection({ contact }: { contact: Contact }) {
  const { toast } = useToast();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);

  const portalAccessKey = ["/api/contacts", contact.id, "portal-access"];

  const { data: access, isLoading } = useQuery<PortalAccessInfo>({
    queryKey: portalAccessKey,
    enabled: !!contact.id,
  });

  const actionMutation = useMutation({
    mutationFn: ({ action }: { action: "resend" | "revoke" | "restore"; successMessage: string }) =>
      apiRequest(`/api/contacts/${contact.id}/portal-access/${action}`, "POST"),
    onSuccess: (_data, { successMessage }) => {
      queryClient.invalidateQueries({ queryKey: portalAccessKey });
      toast({ title: successMessage });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: error?.message || "Please try again.",
      });
    },
  });

  const resend = () => actionMutation.mutate({ action: "resend", successMessage: "Invite resent" });
  const revoke = () => actionMutation.mutate({ action: "revoke", successMessage: "Portal access revoked" });
  const restore = () => actionMutation.mutate({ action: "restore", successMessage: "Portal access restored" });

  const status = access?.status ?? "none";
  const email = access?.email || contact.email;

  return (
    <div className="rounded-md border-2 border-input p-4 space-y-3" data-testid="section-portal-access">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-base font-medium">Portal access</p>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking access…</p>
          ) : status === "none" ? (
            <p className="text-sm text-muted-foreground">
              Let this client log in to view their project
            </p>
          ) : status === "invited" ? (
            <p className="text-sm text-muted-foreground" data-testid="text-portal-status-detail">
              Invite sent to {email}
              {access?.expiresAt && (
                <> · {access.expired ? "expired" : "expires"} {format(new Date(access.expiresAt), "d MMM yyyy")}</>
              )}
            </p>
          ) : status === "active" ? (
            <p className="text-sm text-muted-foreground" data-testid="text-portal-status-detail">
              {email}
              {access?.lastLoginAt
                ? <> · last login {format(new Date(access.lastLoginAt), "d MMM yyyy")}</>
                : <> · hasn't logged in yet</>}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-portal-status-detail">
              {email} can no longer log in
            </p>
          )}
        </div>
        {status !== "none" && !isLoading && (
          <StatusBadge
            status={status === "invited" ? "Invited" : status === "active" ? "Active" : "Revoked"}
            tone={status === "invited" ? "warning" : status === "active" ? "success" : "danger"}
            data-testid="badge-portal-status"
          />
        )}
      </div>

      {!isLoading && (
        <div className="flex justify-end gap-2">
          {status === "none" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInviteDialogOpen(true)}
              disabled={!contact.email}
              title={!contact.email ? "Add an email address first" : undefined}
              data-testid="button-give-portal-access"
            >
              Give portal access
            </Button>
          )}
          {status === "invited" && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resend}
                disabled={actionMutation.isPending}
                data-testid="button-resend-portal-invite"
              >
                {actionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resend invite
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevokeConfirmOpen(true)}
                data-testid="button-revoke-portal-invite"
              >
                Revoke
              </Button>
            </>
          )}
          {status === "active" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRevokeConfirmOpen(true)}
              data-testid="button-revoke-portal-access"
            >
              Revoke access
            </Button>
          )}
          {status === "revoked" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={restore}
              disabled={actionMutation.isPending}
              data-testid="button-restore-portal-access"
            >
              {actionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Restore access
            </Button>
          )}
        </div>
      )}
      {status === "none" && !contact.email && !isLoading && (
        <p className="text-xs text-muted-foreground text-right">Add an email address first</p>
      )}

      <GivePortalAccessDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        contactId={contact.id}
        contactName={contact.firstName || contact.name}
        email={contact.email || ""}
        projects={access?.projects ?? []}
      />

      <AlertDialog open={revokeConfirmOpen} onOpenChange={setRevokeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke portal access?</AlertDialogTitle>
            <AlertDialogDescription>
              {status === "invited"
                ? "The invite link will stop working immediately."
                : `${contact.firstName || contact.name} will be logged out and can no longer log in. You can restore their access later.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={revoke}
              data-testid="button-confirm-revoke"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
