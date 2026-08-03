import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Award, CheckCircle2, Eye, FileText, Send, XCircle } from "lucide-react";
import type { Rfq, RfqQuote, RfqRecipient } from "@shared/schema";
import { formatCents } from "@shared/money";

/**
 * What has actually happened to this RFQ, derived from its own records.
 *
 * Deliberately not wired into the project activity feed: logActivity requires a
 * projectId, and a registry RFQ may not have one. Deriving also means the feed
 * can't drift from reality the way a separately-written log can — every entry
 * here is a timestamp that already exists on the RFQ, its recipients or its
 * quotes.
 */
interface Entry {
  at: Date;
  icon: typeof Send;
  label: string;
  detail?: string;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function RfqActivityFeed({ rfq, quotes }: { rfq: Rfq; quotes: RfqQuote[] }) {
  const { data: recipients = [] } = useQuery<RfqRecipient[]>({
    queryKey: ["/api/rfqs", rfq.id, "recipients"],
    enabled: !!rfq.id,
  });

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    const created = toDate(rfq.createdAt);
    if (created) {
      out.push({ at: created, icon: FileText, label: "Created", detail: rfq.createdByName });
    }

    for (const r of recipients) {
      const sent = toDate(r.sentAt);
      if (sent) out.push({ at: sent, icon: Send, label: "Sent", detail: r.supplierName });

      const viewed = toDate(r.viewedAt);
      if (viewed) out.push({ at: viewed, icon: Eye, label: "Opened", detail: r.supplierName });
    }

    for (const q of quotes) {
      const submitted = toDate(q.submittedAt) ?? toDate(q.createdAt);
      if (submitted) {
        out.push({
          at: submitted,
          icon: CheckCircle2,
          label: "Quote received",
          detail: `${q.supplierName || "Supplier"} · ${formatCents(q.totalAmount)}`,
        });
      }
      const accepted = toDate(q.acceptedAt);
      if (accepted) {
        out.push({ at: accepted, icon: Award, label: "Awarded", detail: q.supplierName ?? undefined });
      }
      const declined = toDate(q.declinedAt);
      if (declined) {
        out.push({ at: declined, icon: XCircle, label: "Declined", detail: q.supplierName ?? undefined });
      }
    }

    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [rfq, recipients, quotes]);

  if (entries.length === 0) {
    return <p className="text-data text-muted-foreground px-3 py-2">Nothing has happened yet.</p>;
  }

  return (
    <div className="p-3 space-y-3">
      {entries.map((entry, i) => {
        const Icon = entry.icon;
        return (
          <div key={i} className="flex items-start gap-2" data-testid={`activity-entry-${i}`}>
            <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs">{entry.label}</p>
              <p className="text-data text-muted-foreground truncate">
                {entry.detail ? `${entry.detail} · ` : ""}
                {format(entry.at, "d MMM yyyy")}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
