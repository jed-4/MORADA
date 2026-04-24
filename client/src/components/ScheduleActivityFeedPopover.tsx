import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, Loader2, MessageSquare, Settings2, Sparkles } from "lucide-react";
import { format, isToday, isYesterday, formatDistanceToNowStrict } from "date-fns";
import { useAuth } from "@/hooks/use-auth";

export type ActivityFeedEntry = {
  id: string;
  source: "note" | "change";
  kind: string;
  authorType: "user" | "system" | "ai";
  userId: string | null;
  userName: string | null;
  scheduleItemId: string | null;
  scheduleItemName: string | null;
  action: string | null;
  content: string;
  metadata: any;
  createdAt: string;
};

type FeedResponse = { entries: ActivityFeedEntry[]; totalCount: number; hasMore: boolean };
type FilterMode = "all" | "notes" | "changes";

interface Props {
  scheduleId: string;
  onSelectItem?: (scheduleItemId: string) => void;
}

const PAGE_SIZE = 20;
const MAX_PAGES = 5; // backend caps limit at 100

function lastSeenKey(scheduleId: string, userId?: string | null) {
  return `schedule-activity-feed:lastSeen:${userId || "anon"}:${scheduleId}`;
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function formatStatusValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function fieldLabel(field: string): string {
  switch (field) {
    case "startDate": return "Start";
    case "endDate": return "End";
    case "assigneeId": return "Assignee";
    default: return field.charAt(0).toUpperCase() + field.slice(1);
  }
}

function changeDetails(entry: ActivityFeedEntry): string[] {
  const meta = entry.metadata || {};
  // Note-source: single field with old/new on metadata
  if (entry.source === "note" && (meta.field || meta.oldValue !== undefined || meta.newValue !== undefined)) {
    const oldVal = formatStatusValue(meta.oldValue);
    const newVal = formatStatusValue(meta.newValue);
    const field = meta.field ? `${fieldLabel(meta.field)}: ` : "";
    return [`${field}${oldVal} → ${newVal}`];
  }
  // Change-source: metadata.changes[].fields[] with before/after
  if (entry.source === "change" && Array.isArray(meta.changes)) {
    const out: string[] = [];
    for (const c of meta.changes) {
      const fields = Array.isArray(c?.fields) ? c.fields : [];
      for (const f of fields) {
        out.push(`${fieldLabel(f.field)}: ${formatStatusValue(f.before)} → ${formatStatusValue(f.after)}`);
      }
    }
    return out;
  }
  return [];
}

export function ScheduleActivityFeedPopover({ scheduleId, onSelectItem }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth() as any;
  const userId: string | null = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [pages, setPages] = useState(1);
  const [lastSeen, setLastSeen] = useState<string>(() => {
    try { return localStorage.getItem(lastSeenKey(scheduleId, userId)) || ""; } catch { return ""; }
  });

  // Refresh last-seen if userId becomes available after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(lastSeenKey(scheduleId, userId)) || "";
      setLastSeen(stored);
    } catch { /* ignore */ }
  }, [scheduleId, userId]);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Reset pagination when filter or schedule changes
  useEffect(() => { setPages(1); }, [filter, scheduleId]);

  const limit = Math.min(pages * PAGE_SIZE, MAX_PAGES * PAGE_SIZE);

  // React-query feed: caches by [scheduleId, filter, pages] and refetches on invalidation
  const feedQuery = useQuery<FeedResponse>({
    queryKey: ["/api/schedules", scheduleId, "activity-feed", { filter, limit }],
    queryFn: async () => {
      const r = await fetch(
        `/api/schedules/${scheduleId}/activity-feed?limit=${limit}&offset=0&filter=${filter}`,
        { credentials: "include" },
      );
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!scheduleId && open,
  });

  const entries = feedQuery.data?.entries ?? [];
  const hasMore = !!feedQuery.data?.hasMore && pages < MAX_PAGES;

  // Backend-driven unread count, polled every 60s
  const unreadQuery = useQuery<{ count: number }>({
    queryKey: ["/api/schedules", scheduleId, "activity-feed", "unread-count", lastSeen],
    queryFn: async () => {
      const url = lastSeen
        ? `/api/schedules/${scheduleId}/activity-feed/unread-count?since=${encodeURIComponent(lastSeen)}`
        : `/api/schedules/${scheduleId}/activity-feed/unread-count`;
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    refetchInterval: 60_000,
    enabled: !!scheduleId,
  });

  const unreadCount = unreadQuery.data?.count ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // Stamp "seen" using now so unread resets
      const stamp = new Date().toISOString();
      try { localStorage.setItem(lastSeenKey(scheduleId, userId), stamp); } catch {}
      setLastSeen(stamp);
      // Force refetch of feed when opening
      queryClient.invalidateQueries({
        queryKey: ["/api/schedules", scheduleId, "activity-feed"],
      });
    }
  };

  // Auto-load more when sentinel becomes visible
  useEffect(() => {
    if (!open) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !feedQuery.isFetching && pages < MAX_PAGES) {
        setPages(p => Math.min(p + 1, MAX_PAGES));
      }
    }, { root: null, threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, hasMore, feedQuery.isFetching, pages]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityFeedEntry[]>();
    for (const e of entries) {
      const d = new Date(e.createdAt);
      const key = format(d, "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  const loading = feedQuery.isFetching;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="relative h-6 w-6 inline-flex items-center justify-center text-xs border rounded-md hover-elevate active-elevate-2"
          data-testid="button-schedule-activity-feed"
          aria-label="Activity feed"
        >
          <Bell className="w-3.5 h-3.5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-data font-semibold flex items-center justify-center"
              data-testid="badge-activity-feed-unread"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0" data-testid="popover-schedule-activity-feed">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b">
          <div className="text-sm font-semibold">Schedule activity</div>
          <div className="flex items-center gap-0.5">
            {(["all", "notes", "changes"] as FilterMode[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`h-6 px-2 text-xs rounded-md ${filter === f ? "bg-primary text-primary-foreground" : "hover-elevate"} active-elevate-2`}
                data-testid={`filter-feed-${f}`}
              >
                {f === "all" ? "All" : f === "notes" ? "Notes" : "Changes"}
              </button>
            ))}
          </div>
        </div>
        <ScrollArea className="max-h-[28rem]">
          <div className="px-2 py-2">
            {entries.length === 0 && loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-8">No activity yet</div>
            ) : (
              grouped.map(([dayKey, items]) => (
                <div key={dayKey} className="mb-3 last:mb-0">
                  <div className="px-2 py-1 text-table uppercase tracking-wide text-muted-foreground">
                    {dayLabel(new Date(dayKey))}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {items.map(e => (
                      <FeedItem key={e.id} entry={e} onSelectItem={onSelectItem} />
                    ))}
                  </div>
                </div>
              ))
            )}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-2">
                <Button variant="ghost" size="sm" onClick={() => setPages(p => p + 1)} data-testid="button-feed-load-more">
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : "Load more"}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function FeedItem({ entry, onSelectItem }: { entry: ActivityFeedEntry; onSelectItem?: (id: string) => void }) {
  const isClickable = !!entry.scheduleItemId && !!onSelectItem;
  const Icon = entry.authorType === "ai"
    ? Sparkles
    : entry.source === "change" || entry.authorType === "system"
      ? Settings2
      : MessageSquare;
  const details = changeDetails(entry);

  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={() => isClickable && onSelectItem!(entry.scheduleItemId!)}
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md text-left ${isClickable ? "hover-elevate active-elevate-2" : ""}`}
      data-testid={`feed-item-${entry.id}`}
    >
      <Avatar className="h-6 w-6 mt-0.5 flex-shrink-0">
        <AvatarFallback className="text-data">
          {entry.authorType === "user" ? initials(entry.userName) : <Icon className="w-3 h-3" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          <span className="font-medium truncate">
            {entry.authorType === "ai" ? "AI" : (entry.userName || "System")}
          </span>
          {entry.authorType === "ai" && (
            <Badge variant="secondary" className="text-data px-1 py-0 h-4">AI</Badge>
          )}
          {entry.authorType === "system" && (
            <Badge variant="secondary" className="text-data px-1 py-0 h-4">System</Badge>
          )}
          {entry.source === "change" && entry.authorType === "user" && (
            <Badge variant="outline" className="text-data px-1 py-0 h-4">Change</Badge>
          )}
          <span
            className="text-muted-foreground text-table ml-auto flex-shrink-0"
            title={format(new Date(entry.createdAt), "PPpp")}
          >
            {formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="text-xs text-foreground mt-0.5 break-words whitespace-pre-wrap">
          {entry.content}
        </div>
        {details.length > 0 && (
          <div className="mt-0.5 space-y-0.5">
            {details.map((d, i) => (
              <div key={i} className="text-table text-muted-foreground font-mono">{d}</div>
            ))}
          </div>
        )}
        {entry.scheduleItemName && (
          <div className="text-table text-muted-foreground mt-0.5 truncate">
            on {entry.scheduleItemName}
          </div>
        )}
      </div>
    </button>
  );
}
