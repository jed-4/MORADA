import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPlausibleEmail, suggestEmailFix, type AddressProblem } from "@shared/emailLog";

/**
 * "This address bounced last time" — shown in a send dialog BEFORE the email
 * goes, so a known-bad address is caught by the person typing it instead of
 * by a client who never got their variation.
 *
 * Silent unless there is a problem. A failed lookup shows nothing: a warning
 * must never get in the way of sending.
 */
export function BouncedAddressWarning({
  emails,
  onUseSuggestion,
  className,
}: {
  emails: Array<string | null | undefined>;
  /** Offer a one-click fix when a likely correction exists. */
  onUseSuggestion?: (bad: string, suggestion: string) => void;
  className?: string;
}) {
  const normalised = useMemo(
    () => Array.from(new Set(emails.map((e) => (e ?? "").trim().toLowerCase()).filter(isPlausibleEmail))).sort(),
    [emails],
  );
  const key = normalised.join(",");

  // Debounced: this sits under an input people are typing into.
  const [debounced, setDebounced] = useState(key);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(key), 400);
    return () => clearTimeout(t);
  }, [key]);

  const { data } = useQuery<{ problems: AddressProblem[] }>({
    queryKey: [`/api/email-deliveries/address-check?emails=${encodeURIComponent(debounced)}`],
    enabled: debounced.length > 0,
    staleTime: 60_000,
    retry: false,
  });

  const problems = (data?.problems ?? []).filter((p) => normalised.includes(p.address));
  // A likely typo is worth a nudge even with no history — a first email to
  // gmial.com has not bounced yet, but it will.
  // Only once typing has paused — "sam@gmail.co" is on its way to ".com".
  const typos = onUseSuggestion && key === debounced
    ? Array.from(new Set(emails.map((e) => (e ?? "").trim()).filter(Boolean)))
        .filter((e) => !problems.some((p) => p.address === e.toLowerCase()))
        .map((e) => ({ address: e, suggestion: suggestEmailFix(e) }))
        .filter((t): t is { address: string; suggestion: string } => !!t.suggestion)
    : [];
  if (!problems.length && !typos.length) return null;
  const rawOf = (lower: string) => emails.map((e) => (e ?? "").trim()).find((e) => e.toLowerCase() === lower) ?? lower;

  return (
    <div
      className={cn(
        "rounded-md border border-status-warning-bg bg-status-warning-bg/40 px-3 py-2 text-xs text-status-warning-fg space-y-1",
        className,
      )}
      role="alert"
      data-testid="warning-bounced-address"
    >
      {problems.map((p) => {
        const suggestion = suggestEmailFix(p.address);
        return (
          <div key={p.address} className="flex items-start gap-2" data-testid="warning-bounced-address-row">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p>
                <span className="font-medium break-all">{p.address}</span>{" "}
                {p.status === "complained" ? "marked a previous email as spam" : "bounced"} on {format(new Date(p.at), "d MMM yyyy")}
                {p.detail ? ` — ${p.detail}` : ""}. Check the address before sending.
              </p>
              {suggestion && onUseSuggestion && (
                <button
                  type="button"
                  className="mt-0.5 underline underline-offset-2 hover:no-underline"
                  // Hand back the address as the user typed it, so a plain
                  // string replace in the caller finds it.
                  onClick={() => onUseSuggestion(rawOf(p.address), suggestion)}
                  data-testid="button-use-email-suggestion"
                >
                  Did you mean {suggestion}?
                </button>
              )}
            </div>
          </div>
        );
      })}
      {typos.map((t) => (
        <div key={t.address} className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <button
            type="button"
            className="text-left underline underline-offset-2 hover:no-underline"
            onClick={() => onUseSuggestion!(t.address, t.suggestion)}
            data-testid="button-use-email-suggestion"
          >
            {t.address} looks like a typo — did you mean {t.suggestion}?
          </button>
        </div>
      ))}
    </div>
  );
}
