import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardHat, Clock } from "lucide-react";
import type { Timesheet } from "@shared/schema";
import type { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { WidgetSkeleton, WidgetEmpty, WidgetError } from "@/components/ui/widget-states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TimesheetWithUser extends Timesheet {
  userName?: string;
  user?: { firstName?: string; lastName?: string; email?: string };
}

function startOfDayIso(d: Date): string {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString();
}
function endOfDayIso(d: Date): string {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt.toISOString();
}

export default function WhoIsOnSiteWidget({ widget }: WidgetProps) {
  const { currentProject } = useProject();
  const projectId = currentProject?.id;

  const { data, isLoading, isError, refetch } = useQuery<TimesheetWithUser[]>({
    queryKey: ["/api/timesheets", projectId, "today"],
    queryFn: async () => {
      if (!projectId) return [];
      const today = new Date();
      const url = `/api/timesheets?projectId=${projectId}&startDate=${encodeURIComponent(
        startOfDayIso(today),
      )}&endDate=${encodeURIComponent(endOfDayIso(today))}`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!projectId,
    refetchInterval: 60_000,
  });

  type Person = {
    userId: string;
    name: string;
    totalHours: number;
    isActive: boolean;
    earliestStart: string | null;
  };

  const people = useMemo<Person[]>(() => {
    const rows = data || [];
    const map = new Map<string, Person>();
    for (const ts of rows) {
      const uid = ts.userId;
      if (!uid) continue;
      const display =
        ts.userName ||
        [ts.user?.firstName, ts.user?.lastName].filter(Boolean).join(" ") ||
        ts.user?.email ||
        "Unknown";
      const cur = map.get(uid) ?? {
        userId: uid,
        name: display,
        totalHours: 0,
        isActive: false,
        earliestStart: null,
      };
      const dur = Number(ts.duration) || 0;
      cur.totalHours += dur;
      if (ts.isActive) cur.isActive = true;
      const start = ts.actualStartTime || ts.startTime;
      if (start && (!cur.earliestStart || start < cur.earliestStart)) {
        cur.earliestStart = start;
      }
      map.set(uid, cur);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.totalHours - a.totalHours;
    });
  }, [data]);

  if (!currentProject) return <WidgetEmpty message="Select a project to see who's on site" />;
  if (isLoading) return <WidgetSkeleton />;
  if (isError) return <WidgetError onRetry={() => refetch()} />;
  if (people.length === 0) return <WidgetEmpty message="Nobody on site today" />;

  const onsiteNow = people.filter((p) => p.isActive).length;

  return (
    <div className="flex flex-col h-full" data-testid="widget-who-on-site">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-xs text-muted-foreground">{people.length} on site today</span>
        {onsiteNow > 0 && (
          <span className="text-xs font-medium text-bp-green flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bp-green animate-pulse" />
            {onsiteNow} clocked in now
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto px-2 pb-3 space-y-1">
        {people.map((p) => {
          const initials = p.name
            .split(/\s+/)
            .map((s) => s[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          return (
            <div
              key={p.userId}
              className="flex items-center gap-3 px-2 py-2 rounded-md"
              data-testid={`onsite-${p.userId}`}
            >
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback className="text-xs">
                  {initials || <HardHat className="h-3 w-3" />}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {p.name}
                  {p.isActive && (
                    <span className="text-[10px] text-bp-green font-semibold">ON SITE</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {p.totalHours.toFixed(2)} h
                  {p.earliestStart &&
                    ` · started ${new Date(p.earliestStart).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
