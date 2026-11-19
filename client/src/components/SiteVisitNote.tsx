import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Arrived on site about 6:42 · left about 3:40pm" beside a timesheet (#46).
 *
 * From the phone's geofence sign-in register (site_visits). It is a hint for
 * the approver only — it never changes the timesheet. The server returns []
 * when the company has the feature off, or the caller isn't the person or a
 * timesheet approver, so this renders nothing in those cases.
 */
interface SiteVisitRow {
  id: string;
  userId: string;
  projectId: string;
  arrivedTime: string;
  leftTime: string | null;
}

function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function SiteVisitNote({
  userId,
  projectId,
  date,
  className,
}: {
  userId?: string | null;
  projectId?: string | null;
  /** The timesheet's date — a midnight-UTC timestamp or a YYYY-MM-DD string. */
  date?: string | Date | null;
  className?: string;
}) {
  const day = date ? (typeof date === "string" ? date : date.toISOString()).slice(0, 10) : null;
  const enabled = !!userId && !!projectId && !!day && /^\d{4}-\d{2}-\d{2}$/.test(day);
  const url = enabled
    ? `/api/site-visits?userId=${encodeURIComponent(userId!)}&projectId=${encodeURIComponent(projectId!)}&date=${day}`
    : "";
  const { data: visits = [] } = useQuery<SiteVisitRow[]>({
    queryKey: [url],
    enabled,
    retry: false,
    staleTime: 60_000,
  });
  if (!enabled || visits.length === 0) return null;

  // Several visits in a day: first arrival, last departure.
  const first = visits[0];
  const last = visits[visits.length - 1];
  return (
    <div
      className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", className)}
      data-testid="display-site-visit"
      title="From the phone's arrival alert. It doesn't change the timesheet."
    >
      <MapPin className="h-3 w-3 flex-shrink-0" />
      <span>
        Arrived on site about <span className="font-medium text-foreground">{to12h(first.arrivedTime)}</span>
        {last.leftTime && (
          <>
            {" · left about "}
            <span className="font-medium text-foreground">{to12h(last.leftTime)}</span>
          </>
        )}
        {visits.length > 1 && <> ({visits.length} visits)</>}
      </span>
    </div>
  );
}
