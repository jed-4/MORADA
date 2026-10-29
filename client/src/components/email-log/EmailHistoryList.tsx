import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Loader2, Mail, Paperclip } from "lucide-react";
import { EmailStatusChip } from "./EmailStatusChip";
import { emailTypeLabel, isPlausibleEmail, type EmailLogListResponse } from "@shared/emailLog";

/**
 * Every email sent to a person (or a supplier and its contacts), newest
 * first — the answer to "what have we sent them, and did it get there?"
 * without leaving their record. Rows open in the full log.
 */
export function EmailHistoryList({
  addresses,
  emptyHint,
}: {
  addresses: Array<string | null | undefined>;
  emptyHint?: string;
}) {
  const list = useMemo(
    () => Array.from(new Set(addresses.map((a) => (a ?? "").trim().toLowerCase()).filter(isPlausibleEmail))).sort(),
    [addresses],
  );
  const key = list.join(",");

  const { data, isLoading, error } = useQuery<EmailLogListResponse>({
    queryKey: [`/api/email-deliveries?limit=50&addresses=${encodeURIComponent(key)}`],
    enabled: list.length > 0,
    staleTime: 30_000,
  });

  if (!list.length) {
    return <p className="text-xs text-muted-foreground">{emptyHint ?? "No email address on file."}</p>;
  }
  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading emails…
      </p>
    );
  }
  if (error || !data) return <p className="text-xs text-muted-foreground">Emails could not be loaded.</p>;

  if (!data.rows.length) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="h-3.5 w-3.5" />
        Nothing has been emailed to {list.length === 1 ? list[0] : "these addresses"}
        {data.scopeAll ? "" : " by you"} yet.
      </div>
    );
  }

  return (
    <div className="space-y-1" data-testid="list-email-history">
      {!data.scopeAll && <p className="text-[11px] text-muted-foreground mb-1">Showing emails you sent.</p>}
      <ul className="divide-y divide-border rounded-md border border-border">
        {data.rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/emails?id=${r.id}`}
              className="flex items-center gap-3 px-3 py-2 text-xs hover-elevate"
              data-testid={`link-email-history-${r.id}`}
            >
              <span className="w-20 flex-shrink-0 text-muted-foreground">{format(new Date(r.sentAt), "d MMM yy")}</span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1">
                  <span className="truncate">{r.subject || "(no subject)"}</span>
                  {r.attachmentCount > 0 && <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {emailTypeLabel(r.contextType)}
                  {r.contextRef ? ` ${r.contextRef}` : ""}
                  {r.projectName ? ` · ${r.projectName}` : ""}
                  {list.length > 1 ? ` · ${r.toAddresses.join(", ")}` : ""}
                </span>
              </span>
              <EmailStatusChip row={r} trackingEnabled={data.trackingEnabled} />
            </Link>
          </li>
        ))}
      </ul>
      {data.nextCursor && (
        <Link
          href={list.length === 1 ? `/emails?q=${encodeURIComponent(list[0])}` : "/emails"}
          className="inline-block mt-1 text-xs text-primary hover:underline"
        >
          Older emails are in the email log →
        </Link>
      )}
    </div>
  );
}
