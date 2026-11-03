import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/queryClient";
import { EmailStatusChip } from "./EmailStatusChip";
import { ResendEmailDialog } from "./ResendEmailDialog";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/hooks/use-auth";
import {
  deliveryHealth,
  emailContextHref,
  emailTypeLabel,
  type EmailLogDetail,
  type EmailTimelineEvent,
} from "@shared/emailLog";
import { ExternalLink, FileText, Lock, Paperclip, RotateCw } from "lucide-react";

const fmt = (iso: string) => format(new Date(iso), "d MMM yyyy, h:mm a");

const DOT: Record<EmailTimelineEvent["kind"], string> = {
  sent: "bg-muted-foreground/40",
  failed: "bg-status-danger",
  delayed: "bg-status-warning",
  delivered: "bg-status-success",
  opened: "bg-status-info",
  clicked: "bg-status-info",
  bounced: "bg-status-danger",
  complained: "bg-status-danger",
  portal_viewed: "bg-primary",
  signed: "bg-status-success",
  rejected: "bg-status-danger",
  quote_submitted: "bg-status-success",
  resent: "bg-muted-foreground/40",
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One email in full: what was sent, to whom, and everything that happened to
 * it afterwards — delivery, opens, the recipient opening the portal, signing.
 */
export function EmailDetailSheet({
  id,
  trackingEnabled,
  onClose,
  onOpenEmail,
}: {
  id: string | null;
  trackingEnabled: boolean;
  onClose: () => void;
  /** Jump to another row (a resent copy). */
  onOpenEmail: (id: string) => void;
}) {
  const { data: email, isLoading, error } = useQuery<EmailLogDetail>({
    queryKey: ["/api/email-deliveries", id],
    enabled: !!id,
    staleTime: 15_000,
  });

  const { user } = useAuth();
  const canResendAny = usePermission("admin.email_log", "send");
  const [resendOpen, setResendOpen] = useState(false);

  const health = email ? deliveryHealth(email, { trackingEnabled }) : null;
  const canResend = !!email?.htmlBody && (canResendAny || email.userId === (user as any)?.id);
  // Resending a problem email is the obvious next step; resending one that
  // arrived is occasionally useful ("can you send it again?") but not the point.
  const resendIsTheFix = !!health?.needsAttention;
  const docHref = email ? emailContextHref(email.contextType, email.contextId, email.projectId) : null;

  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col gap-0" data-testid="sheet-email-detail">
        {isLoading || !email ? (
          <div className="p-6 space-y-3">
            <SheetHeader className="sr-only">
              <SheetTitle>Email</SheetTitle>
              <SheetDescription>Loading</SheetDescription>
            </SheetHeader>
            {error ? (
              <p className="text-sm text-muted-foreground">This email could not be loaded.</p>
            ) : (
              <>
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-64 w-full" />
              </>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SheetHeader className="px-6 pt-6 pb-4 border-b border-border space-y-2 text-left">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{emailTypeLabel(email.contextType)}</span>
                {email.contextRef && <span className="text-foreground font-medium">{email.contextRef}</span>}
                {email.projectName && <span>· {email.projectName}</span>}
              </div>
              <SheetTitle className="text-base leading-snug pr-6" data-testid="text-email-subject">
                {email.subject || "(no subject)"}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2">
                  <EmailStatusChip row={email} trackingEnabled={trackingEnabled} />
                  <span className="text-xs text-muted-foreground">{fmt(email.sentAt)}</span>
                  {docHref && (
                    <Link
                      href={docHref}
                      className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      data-testid="link-email-document"
                    >
                      Open {emailTypeLabel(email.contextType).toLowerCase()} <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            {health?.needsAttention && (
              <div
                className={cn(
                  "mx-6 mt-4 rounded-md border px-3 py-2 text-xs",
                  health.tone === "negative"
                    ? "border-status-danger-bg bg-status-danger-bg/40 text-status-danger"
                    : "border-status-warning-bg bg-status-warning-bg/40 text-status-warning",
                )}
                data-testid="callout-email-problem"
              >
                <p className="font-medium">{health.label}</p>
                <p className="mt-0.5">{health.hint}</p>
                {canResend && (
                  <button
                    type="button"
                    onClick={() => setResendOpen(true)}
                    className="mt-2 h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 inline-flex items-center gap-1"
                    data-testid="button-fix-and-resend"
                  >
                    <RotateCw className="h-3 w-3" /> Fix address and resend
                  </button>
                )}
              </div>
            )}

            <dl className="px-6 py-4 grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">To</dt>
              <dd className="break-all" data-testid="text-email-to">{email.toAddresses.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">From</dt>
              <dd className="break-all">{email.fromAddress || "—"}</dd>
              {email.replyTo && (
                <>
                  <dt className="text-muted-foreground">Replies go to</dt>
                  <dd className="break-all">{email.replyTo}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Sent by</dt>
              <dd>{email.senderName || "Morada (automatic)"}</dd>
            </dl>
            {canResend && !resendIsTheFix && (
              <div className="px-6 -mt-1 pb-3">
                <button
                  type="button"
                  onClick={() => setResendOpen(true)}
                  className="h-6 w-auto px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate active-elevate-2 inline-flex items-center gap-1"
                  data-testid="button-resend-email"
                >
                  <RotateCw className="h-3 w-3" /> Resend
                </button>
              </div>
            )}

            <section className="px-6 pb-4">
              <h3 className="text-xs font-semibold mb-2">What happened</h3>
              <ol className="relative border-l border-border ml-1 space-y-3" data-testid="list-email-timeline">
                {email.timeline.map((e, i) => (
                  <li key={i} className="pl-4 relative">
                    <span className={cn("absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background", DOT[e.kind])} />
                    <p className="text-xs">
                      <span className="font-medium">{e.label}</span>
                      {e.approximate && (
                        <span className="ml-1 text-muted-foreground" title="Some mail apps open every message automatically">(approx.)</span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmt(e.at)}
                      {e.detail ? ` — ${e.detail}` : ""}
                      {e.kind === "opened" && email.openCount > 1 && email.lastOpenedAt ? ` — last opened ${fmt(email.lastOpenedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
              {email.resentAs.length > 0 && (
                <div className="mt-3 text-xs">
                  {email.resentAs.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => onOpenEmail(r.id)}
                    >
                      View the resent copy to {r.toAddresses.join(", ")} →
                    </button>
                  ))}
                </div>
              )}
              {email.resentFromId && (
                <button
                  type="button"
                  className="mt-3 block text-xs text-primary hover:underline"
                  onClick={() => onOpenEmail(email.resentFromId!)}
                >
                  ← View the original that did not arrive
                </button>
              )}
            </section>

            {email.attachments.length > 0 && (
              <section className="px-6 pb-4">
                <h3 className="text-xs font-semibold mb-2">Attachments</h3>
                <ul className="space-y-1">
                  {email.attachments.map((a, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs">
                      <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      {a.stored ? (
                        <a
                          href={`${getApiBaseUrl()}/api/email-deliveries/${email.id}/attachments/${i}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline truncate"
                          data-testid={`link-email-attachment-${i}`}
                        >
                          {a.filename}
                        </a>
                      ) : (
                        <span className="truncate" title="No copy of this file was kept">{a.filename}</span>
                      )}
                      <span className="text-muted-foreground flex-shrink-0">{formatBytes(a.size)}</span>
                      {!a.stored && <span className="text-muted-foreground flex-shrink-0">· not kept</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="px-6 pb-6">
              <h3 className="text-xs font-semibold mb-2">The email as sent</h3>
              {email.htmlBody ? (
                // sandbox="" — no scripts, no forms, and links do nothing. A
                // click here must not count as the client opening their portal.
                <iframe
                  title="Email as sent"
                  sandbox=""
                  srcDoc={email.htmlBody}
                  className="w-full h-[560px] rounded-md border border-border bg-white"
                  data-testid="iframe-email-body"
                />
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {email.bodyRedacted ? <Lock className="h-4 w-4 flex-shrink-0" /> : <FileText className="h-4 w-4 flex-shrink-0" />}
                  <p>
                    {email.bodyRedacted
                      ? "Not kept on purpose — this email carried a personal sign-in link, and a stored copy would let anyone who can read this log use it."
                      : "No copy was kept. This email was sent before Morada started keeping copies."}
                  </p>
                </div>
              )}
            </section>
            {email && (
              <ResendEmailDialog
                email={email}
                open={resendOpen}
                onOpenChange={setResendOpen}
                onResent={(newId) => newId && onOpenEmail(newId)}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
