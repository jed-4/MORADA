import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Check, Download, Eye, FileText, MailCheck, PenLine, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What has actually happened to this variation, derived from its own records.
 *
 * Deliberately not a `variation_activity` table. RFQ's feed makes the argument
 * and it holds here: "deriving also means the feed can't drift from reality the
 * way a separately-written log can" — every entry below is a timestamp the
 * system needed anyway, on the variation or on one of its sends.
 *
 * This is also the only place `clientSignedIp` and `clientSignedUserAgent` are
 * ever shown. They have been recorded since the portal shipped and displayed
 * nowhere, which made the strongest evidence the app holds invisible to the
 * person who might need it.
 */

export interface VariationSendRow {
  id: string;
  sentAt: string | Date;
  sentTo?: Array<{ name?: string; email: string }> | null;
  subject?: string | null;
  body?: string | null;
  hasPdf?: boolean;
  firstViewedAt?: string | Date | null;
  lastViewedAt?: string | Date | null;
  viewCount?: number | null;
  /** From the delivery log. Null for sends made before it shipped. */
  delivery?: {
    status?: string | null;
    detail?: string | null;
    updatedAt?: string | Date | null;
    provider?: string | null;
  } | null;
}

interface Entry {
  at: Date;
  icon: typeof Send;
  label: string;
  detail?: ReactNode;
  tone?: "normal" | "good" | "bad";
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

const when = (d: Date) =>
  format(d, "d MMM yyyy 'at' h:mma").replace("AM", "am").replace("PM", "pm");

export function VariationActivityFeed({
  variation,
  variationId,
}: {
  variation: any;
  variationId: string;
}) {
  const { data: sends = [] } = useQuery<VariationSendRow[]>({
    queryKey: ["/api/variations", variationId, "sends"],
    enabled: !!variationId,
  });

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    const created = toDate(variation?.createdAt);
    if (created) out.push({ at: created, icon: FileText, label: "Created" });

    for (const s of sends) {
      const sentAt = toDate(s.sentAt);
      if (sentAt) {
        const to = (s.sentTo ?? []).map((r) => r.name || r.email).join(", ");
        out.push({
          at: sentAt,
          icon: Send,
          label: "Sent",
          detail: (
            <span className="flex items-center gap-1.5 flex-wrap">
              {to || "client"}
              {s.hasPdf && (
                <a
                  href={`/api/variations/${variationId}/sends/${s.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  data-testid={`link-sent-pdf-${s.id}`}
                >
                  <Download className="h-3 w-3" />
                  the document sent
                </a>
              )}
            </span>
          ),
        });
      }

      // What the receiving server did with it, once it told us. "sent" adds
      // nothing here — the Sent entry above already says that — so only an
      // actual outcome earns a row.
      const d = s.delivery;
      const outcomeAt = toDate(d?.updatedAt);
      if (d && d.status && d.status !== "sent" && outcomeAt) {
        const bad = d.status === "bounced" || d.status === "failed" || d.status === "complained";
        out.push({
          at: outcomeAt,
          icon: bad ? AlertTriangle : MailCheck,
          label:
            d.status === "delivered"
              ? "Delivered"
              : d.status === "bounced"
                ? "Bounced"
                : d.status === "complained"
                  ? "Marked as spam"
                  : "Failed to send",
          tone: bad ? "bad" : "good",
          detail: d.detail || undefined,
        });
      }

      // First open is the meaningful event; later opens are a count rather than
      // a row, or a client who re-reads it becomes the whole feed.
      const firstViewed = toDate(s.firstViewedAt);
      if (firstViewed) {
        const n = s.viewCount ?? 0;
        out.push({
          at: firstViewed,
          icon: Eye,
          label: "Opened",
          detail: n > 1 ? `${n} times · last ${when(toDate(s.lastViewedAt) ?? firstViewed)}` : undefined,
        });
      }
    }

    const signed = toDate(variation?.clientSignedDate);
    if (signed) {
      const rejected = variation?.status === "rejected";
      out.push({
        at: signed,
        icon: rejected ? X : PenLine,
        label: rejected ? "Rejected by client" : "Signed by client",
        tone: rejected ? "bad" : "good",
        detail: (
          <span className="flex flex-col gap-0.5">
            <span>{variation?.clientSignedName}</span>
            {/* The audit line. Quiet, but this is the part that matters if the
                signature is ever questioned. */}
            {(variation?.clientSignedIp || variation?.clientSignedUserAgent) && (
              <span className="text-data text-muted-foreground/70 break-all">
                {variation?.clientSignedIp ? `IP ${variation.clientSignedIp}` : null}
                {variation?.clientSignedIp && variation?.clientSignedUserAgent ? " · " : null}
                {variation?.clientSignedUserAgent}
              </span>
            )}
            {rejected && variation?.rejectionReason && (
              <span className="text-muted-foreground">{variation.rejectionReason}</span>
            )}
          </span>
        ),
      });
    }

    const approved = toDate(variation?.approvedDate);
    // Only a distinct entry when someone at the builder's end approved it. A
    // client signature stamps the same field in the same second, and showing
    // both would read as two approvals.
    if (approved && (!signed || Math.abs(approved.getTime() - signed.getTime()) > 5000)) {
      out.push({ at: approved, icon: Check, label: "Approved", tone: "good" });
    }

    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [variation, sends, variationId]);

  if (entries.length === 0) {
    return <p className="doc-body-muted px-3.5 py-3">Nothing has happened yet.</p>;
  }

  return (
    <ol className="px-3.5 py-3 flex flex-col gap-3" data-testid="variation-activity-feed">
      {entries.map((e, i) => {
        const Icon = e.icon;
        return (
          <li key={`${e.label}-${e.at.getTime()}-${i}`} className="flex items-start gap-2.5">
            <span
              className={cn(
                "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                e.tone === "good" && "bg-sage/15 text-sage",
                e.tone === "bad" && "bg-coral/15 text-coral",
                (!e.tone || e.tone === "normal") && "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              <Icon className="h-2.5 w-2.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-foreground">{e.label}</p>
              {e.detail && <div className="text-body-sm text-muted-foreground">{e.detail}</div>}
              <p className="text-data text-muted-foreground/70">{when(e.at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
