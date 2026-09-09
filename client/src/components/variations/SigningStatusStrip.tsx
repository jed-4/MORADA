import { format } from "date-fns";
import { Check, Eye, PenLine, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Where a variation is up to with the client: sent → opened → signed.
 *
 * All four timestamps have been recorded since the portal shipped, and none of
 * them were shown anywhere in the app — a grep for `clientSignedName`,
 * `portalViewedAt` and `portalSentAt` across VariationDetail returned nothing.
 * So you could send a variation and have no way to tell whether it had been
 * delivered, opened, or signed.
 *
 * It also disambiguates `pending`, which means two different things: sending
 * sets it, and the client signing ALSO sets it. Nothing on the status chip
 * distinguishes "waiting on them" from "they have signed, waiting on you" —
 * only `clientSignedName` does, and it was invisible.
 */

export interface SigningStatusStripProps {
  portalSentAt?: string | Date | null;
  portalViewedAt?: string | Date | null;
  clientSignedName?: string | null;
  clientSignedDate?: string | Date | null;
  status?: string | null;
  rejectionReason?: string | null;
  className?: string;
}

const when = (d: string | Date | null | undefined) =>
  d ? format(new Date(d), "d MMM yyyy 'at' h:mma").replace("AM", "am").replace("PM", "pm") : null;

function Step({
  icon: Icon,
  label,
  detail,
  done,
  tone = "done",
  last = false,
}: {
  icon: typeof Send;
  label: string;
  detail: string;
  done: boolean;
  tone?: "done" | "bad";
  last?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        className={cn(
          "h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 border",
          !done && "border-dashed border-border bg-card text-muted-foreground/50",
          done && tone === "done" && "border-transparent bg-sage/15 text-sage",
          done && tone === "bad" && "border-transparent bg-coral/15 text-coral",
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0">
        <p className={cn("doc-field-label", done ? "text-muted-foreground" : "text-muted-foreground/50")}>
          {label}
        </p>
        <p
          className={cn(
            "text-body-sm truncate",
            done ? "text-foreground font-medium" : "text-muted-foreground/60",
          )}
        >
          {detail}
        </p>
      </div>
      {/* Connector. Solid once the NEXT step is reached is overkill — a single
          hairline reads as a sequence without implying progress it can't know. */}
      {!last && <div className="hidden sm:block h-px w-6 bg-border flex-shrink-0 ml-1" />}
    </div>
  );
}

export function SigningStatusStrip({
  portalSentAt,
  portalViewedAt,
  clientSignedName,
  clientSignedDate,
  status,
  rejectionReason,
  className,
}: SigningStatusStripProps) {
  const sent = when(portalSentAt);
  const viewed = when(portalViewedAt);
  const signed = when(clientSignedDate);
  const rejected = status === "rejected";

  return (
    <div className={cn("px-3.5 py-3 flex flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <Step
        icon={Send}
        label="Sent"
        detail={sent ?? "Not sent yet"}
        done={!!sent}
      />
      <Step
        icon={Eye}
        label="Opened"
        detail={viewed ?? (sent ? "Not opened yet" : "—")}
        done={!!viewed}
      />
      {rejected ? (
        <Step
          icon={X}
          label="Rejected"
          detail={clientSignedName ? `${clientSignedName}${signed ? ` · ${signed}` : ""}` : (signed ?? "Rejected")}
          done
          tone="bad"
          last
        />
      ) : (
        <Step
          icon={clientSignedName ? Check : PenLine}
          label="Signed"
          detail={
            clientSignedName
              ? `${clientSignedName}${signed ? ` · ${signed}` : ""}`
              : sent
                ? "Awaiting signature"
                : "—"
          }
          done={!!clientSignedName}
          last
        />
      )}

      {rejected && rejectionReason && (
        <p className="w-full text-body-sm text-muted-foreground border-t border-border/60 pt-2.5">
          <span className="doc-field-label mr-1.5">Reason</span>
          {rejectionReason}
        </p>
      )}
    </div>
  );
}
