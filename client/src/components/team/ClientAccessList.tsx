import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { AlertTriangle, Briefcase, Mail, MoreHorizontal, KeyRound, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface ClientAccessRow {
  kind: "user" | "invite";
  userId: string | null;
  contactId: string | null;
  name: string;
  email: string | null;
  status: "active" | "revoked" | "invited";
  lastLoginAt: string | null;
  invitedAt?: string | null;
  expired?: boolean;
  projects: { id: string; name: string; finished: boolean }[];
  flags: string[];
}

const CLIENT_ACCESS_KEY = ["/api/team/client-access"];

/** Why the access looks stale, in words. */
const FLAG_TEXT: Record<string, string> = {
  jobs_finished: "All their jobs are finished",
  no_jobs: "Not linked to any job",
  inactive_90_days: "Hasn't signed in for 90+ days",
  never_signed_in: "Never signed in",
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

/**
 * Who can sign in to the client portal — kept off the staff list, but in the
 * same place so access doesn't get lost. Stale access is flagged so it can be
 * taken away. Actions use the per-contact portal routes, the same ones the
 * contact page uses.
 */
export function ClientAccessList({ search }: { search: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [confirmRevoke, setConfirmRevoke] = useState<ClientAccessRow | null>(null);

  const { data: rows = [], isLoading, isError } = useQuery<ClientAccessRow[]>({ queryKey: CLIENT_ACCESS_KEY });

  const action = useMutation({
    mutationFn: ({ contactId, verb }: { contactId: string; verb: "revoke" | "restore" | "resend" }) =>
      apiRequest(`/api/contacts/${contactId}/portal-access/${verb}`, "POST"),
    onSuccess: (_d, { verb }) => {
      queryClient.invalidateQueries({ queryKey: CLIENT_ACCESS_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: verb === "revoke" ? "Access removed" : verb === "restore" ? "Access restored" : "Invitation resent",
      });
    },
    onError: (error: any) =>
      toast({
        title: "That didn't work",
        description: String(error?.message || "").replace(/^\d+:\s*/, "") || undefined,
        variant: "destructive",
      }),
  });

  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    (r.email ?? "").toLowerCase().includes(q) ||
    r.projects.some((p) => p.name.toLowerCase().includes(q)),
  );
  const staleCount = rows.filter((r) => r.flags.length > 0).length;

  if (isLoading) {
    return <div className="flex items-center justify-center h-40 text-muted-foreground">Loading…</div>;
  }
  if (isError) {
    return <div className="text-sm text-muted-foreground p-4">Couldn't load client access.</div>;
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
        <KeyRound className="h-10 w-10 text-muted-foreground" />
        <h3 className="text-base font-semibold">No clients have portal access</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Invite a client from their contact page and they'll appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="client-access-list">
      {staleCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-[hsl(var(--amber))]/40 bg-[hsl(var(--amber-light))] px-3 py-2 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[hsl(var(--amber))]" />
          <span>
            {staleCount} client{staleCount === 1 ? "" : "s"} may no longer need access — their jobs are finished or
            they haven't signed in for a while. Review the flagged cards below.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {shown.map((row) => {
          const key = row.userId ?? `invite-${row.contactId ?? row.email}`;
          const lastSeen = row.lastLoginAt
            ? `Last signed in ${formatDistanceToNow(new Date(row.lastLoginAt), { addSuffix: true })}`
            : row.status === "invited"
              ? row.expired ? "Invitation expired" : `Invited ${row.invitedAt ? format(new Date(row.invitedAt), "d MMM yyyy") : ""}`
              : "Never signed in";
          return (
            <Card key={key} className="border-2" data-testid={`client-access-${key}`}>
              <CardContent className="p-3 flex gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-[hsl(var(--teal-light))] text-[hsl(var(--teal))] font-semibold text-xs">
                    {initials(row.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-medium truncate flex-1">{row.name}</h3>
                    <StatusBadge
                      status={row.status === "active" ? "Active" : row.status === "invited" ? (row.expired ? "Expired" : "Invited") : "Revoked"}
                      tone={row.status === "active" ? "success" : row.status === "invited" ? "warning" : "neutral"}
                      className="shrink-0"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label={`Actions for ${row.name}`} data-testid={`button-client-actions-${key}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {row.contactId && (
                          <DropdownMenuItem onClick={() => navigate(`/business/contacts?id=${row.contactId}`)}>
                            Open contact
                          </DropdownMenuItem>
                        )}
                        {row.contactId && row.status === "invited" && (
                          <DropdownMenuItem onClick={() => action.mutate({ contactId: row.contactId!, verb: "resend" })}>
                            Resend invitation
                          </DropdownMenuItem>
                        )}
                        {row.contactId && row.status === "revoked" && (
                          <DropdownMenuItem onClick={() => action.mutate({ contactId: row.contactId!, verb: "restore" })}>
                            Restore access
                          </DropdownMenuItem>
                        )}
                        {row.contactId && (row.status === "active" || row.status === "invited") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmRevoke(row)}>
                              Remove access
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {row.email && (
                    <div className="flex items-center gap-1.5 text-data text-muted-foreground">
                      <Mail className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{row.email}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5 text-data text-muted-foreground">
                    <Briefcase className="h-2.5 w-2.5 shrink-0 mt-0.5" />
                    <span className="min-w-0">
                      {row.projects.length === 0
                        ? "No jobs"
                        : row.projects.map((p, i) => (
                            <span key={p.id} className={p.finished ? "line-through decoration-muted-foreground/60" : undefined}>
                              {i > 0 ? ", " : ""}{p.name}
                            </span>
                          ))}
                    </span>
                  </div>
                  <div className="text-data text-muted-foreground">{lastSeen}</div>
                  {row.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {row.flags.map((f) => (
                        <span key={f} className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--amber-light))] border border-[hsl(var(--amber))]/40 px-1.5 py-0.5 text-[10px]">
                          <AlertTriangle className="w-2.5 h-2.5 text-[hsl(var(--amber))]" />
                          {FLAG_TEXT[f] ?? f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {shown.length === 0 && <p className="text-sm text-muted-foreground px-1">Nothing matches that search.</p>}

      <ConfirmDialog
        open={!!confirmRevoke}
        onOpenChange={(o) => { if (!o) setConfirmRevoke(null); }}
        title={`Remove ${confirmRevoke?.name ?? "this client"}'s portal access?`}
        description="They'll be signed out and won't be able to open the client portal. Their comments and choices stay. You can restore access later."
        confirmLabel="Remove access"
        destructive
        onConfirm={() => {
          if (confirmRevoke?.contactId) action.mutate({ contactId: confirmRevoke.contactId, verb: "revoke" });
          setConfirmRevoke(null);
        }}
      />
      {action.isPending && (
        <div className="fixed bottom-4 right-4 rounded-md bg-card border px-3 py-2 text-xs flex items-center gap-1.5 shadow">
          <Loader2 className="w-3 h-3 animate-spin" /> Working…
        </div>
      )}
    </div>
  );
}
