import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, Loader2, MessageSquare, Settings2, Sparkles } from "lucide-react";
import { format, isToday, isYesterday, formatDistanceToNowStrict, isValid } from "date-fns";
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

// One drag cascades to every successor, and each moved item is written as its
// own entry — so a single action can fill the Changes tab with near-identical
// lines. Entries this close together, by the same person, doing the same thing,
// are one action as far as a reader is concerned, so they are shown as one row
// that opens to reveal the items.
const BURST_WINDOW_MS = 60_000;
const MIN_BURST = 2;

type FeedRow =
  | { type: "single"; key: string; entry: ActivityFeedEntry }
  | { type: "burst"; key: string; entries: ActivityFeedEntry[] };

function burstSignature(e: ActivityFeedEntry) {
  return [e.userId ?? "", e.authorType, e.kind ?? "", e.action ?? ""].join("|");
}

/** Collapses runs of same-action change entries. Comments are never collapsed. */
function collapseBursts(entries: ActivityFeedEntry[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let run: ActivityFeedEntry[] = [];

  const flush = () => {
    if (run.length === 0) return;
    rows.push(
      run.length >= MIN_BURST
        ? { type: "burst", key: `burst:${run[0].id}:${run.length}`, entries: run }
        : { type: "single", key: run[0].id, entry: run[0] },
    );
    run = [];
  };

  for (const e of entries) {
    if (e.source !== "change") {
      flush();
      rows.push({ type: "single", key: e.id, entry: e });
      continue;
    }
    const head = run[0];
    const sameAction = head
      && burstSignature(head) === burstSignature(e)
      // Entries arrive newest first, so the head is the latest of its run.
      && Math.abs(new Date(head.createdAt).getTime() - new Date(e.createdAt).getTime()) <= BURST_WINDOW_MS;
    if (!sameAction) flush();
    run.push(e);
  }
  flush();
  return rows;
}

const PAGE_SIZE = 20;
const MAX_PAGES = 5; // backend caps limit at 100

function lastSeenKey(scheduleId: string, userId?: string | null) {
  return `schedule-activity-feed:lastSeen:${userId || "anon"}:${scheduleId}`;
}

function filterKey(scheduleId: string, userId?: string | null) {
  return `schedule-activity-feed:filter:${userId || "anon"}:${scheduleId}`;
}

// Comments first: the feed opens on what people said, not on what the machine
// did. Changes are a click away for when you need to know what moved.
const DEFAULT_FILTER: FilterMode = "notes";

function readFilter(scheduleId: string, userId?: string | null): FilterMode {
  try {
    const stored = localStorage.getItem(filterKey(scheduleId, userId));
    return stored === "all" || stored === "notes" || stored === "changes" ? stored : DEFAULT_FILTER;
  } catch {
    return DEFAULT_FILTER;
  }
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

// Parse a change value into a Date. All-day schedule dates are stored at UTC
// midnight, so read the calendar date directly to avoid a timezone day-shift.
function parseChangeDate(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  const s = String(v);
  const midnight = s.match(/^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.000)?Z?$/);
  if (midnight) return new Date(Number(midnight[1]), Number(midnight[2]) - 1, Number(midnight[3]));
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const d = new Date(s);
  return isValid(d) ? d : null;
}

// Friendly single date: "10 Jul" (year omitted when it's the current year).
function formatDay(d: Date): string {
  return d.getFullYear() === new Date().getFullYear()
    ? format(d, "d MMM")
    : format(d, "d MMM yyyy");
}

// Compact date range: "10–13 Jul", "28 Jun – 3 Jul", or with year when not current.
function formatRange(start: Date, end: Date): string {
  const currentYear = new Date().getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (start.getTime() === end.getTime()) return formatDay(start);
  const yearSuffix = sameYear && end.getFullYear() !== currentYear ? ` ${end.getFullYear()}` : "";
  if (sameMonth) return `${format(start, "d")}–${format(end, "d MMM")}${yearSuffix}`;
  if (sameYear) return `${format(start, "d MMM")} – ${format(end, "d MMM")}${yearSuffix}`;
  return `${formatDay(start)} – ${formatDay(end)}`;
}

type AssigneeResolver = (raw: any) => string;

function makeAssigneeResolver(nameMap: Map<string, string>): AssigneeResolver {
  return (raw: any) => {
    if (raw === null || raw === undefined || raw === "") return "Unassigned";
    let id = String(raw);
    if (id.startsWith("company:")) return "The Business";
    if (id.startsWith("user:")) id = id.slice(5);
    return nameMap.get(id) || nameMap.get(String(raw)) || "another person";
  };
}

// Note-source diff line (single field with old/new on metadata). Unchanged from
// the original behaviour so note/system/AI entries render exactly as before.
function noteDetails(entry: ActivityFeedEntry): string[] {
  const meta = entry.metadata || {};
  if (entry.source === "note" && (meta.field || meta.oldValue !== undefined || meta.newValue !== undefined)) {
    const oldVal = formatStatusValue(meta.oldValue);
    const newVal = formatStatusValue(meta.newValue);
    const field = meta.field ? `${fieldLabel(meta.field)}: ` : "";
    return [`${field}${oldVal} → ${newVal}`];
  }
  return [];
}

type ChangeDiff = { label?: string; oldText: string; newText: string };
type ChangeSummary = { headline: string; diffs: ChangeDiff[] };

// Build a human-readable headline + restyled diff lines for a change entry.
function buildChangeSummary(entry: ActivityFeedEntry, resolveAssignee: AssigneeResolver): ChangeSummary {
  const meta = entry.metadata || {};
  const changes: any[] = Array.isArray(meta.changes) ? meta.changes : [];
  const byField = new Map<string, { before: any; after: any }>();
  for (const c of changes) {
    const fields = Array.isArray(c?.fields) ? c.fields : [];
    for (const f of fields) {
      if (f && f.field) byField.set(f.field, { before: f.before, after: f.after });
    }
  }

  // No structured diff: fall back to the backend description (covers created /
  // deleted / reordered actions that carry no field-level metadata).
  if (byField.size === 0) {
    return { headline: entry.content?.trim() || "Updated", diffs: [] };
  }

  const diffs: ChangeDiff[] = [];
  const candidates: { key: string; priority: number; headline: string }[] = [];

  const hasStart = byField.has("startDate");
  const hasEnd = byField.has("endDate");
  const collapseDates = hasStart && hasEnd;

  if (collapseDates) {
    const os = parseChangeDate(byField.get("startDate")!.before);
    const oe = parseChangeDate(byField.get("endDate")!.before);
    const ns = parseChangeDate(byField.get("startDate")!.after);
    const ne = parseChangeDate(byField.get("endDate")!.after);
    const oldRange = os && oe ? formatRange(os, oe) : "—";
    const newRange = ns && ne ? formatRange(ns, ne) : "—";
    diffs.push({ label: "Moved", oldText: oldRange, newText: newRange });
    if (ns && ne) candidates.push({ key: "dates", priority: 1, headline: `Rescheduled to ${formatRange(ns, ne)}` });
  }

  for (const [field, { before, after }] of Array.from(byField.entries())) {
    if (collapseDates && (field === "startDate" || field === "endDate")) continue;
    switch (field) {
      case "startDate": {
        const nb = parseChangeDate(after);
        const ob = parseChangeDate(before);
        diffs.push({ label: "Start", oldText: ob ? formatDay(ob) : "—", newText: nb ? formatDay(nb) : "—" });
        if (nb) candidates.push({ key: "startDate", priority: 2, headline: `Start moved to ${formatDay(nb)}` });
        break;
      }
      case "endDate": {
        const nb = parseChangeDate(after);
        const ob = parseChangeDate(before);
        diffs.push({ label: "End", oldText: ob ? formatDay(ob) : "—", newText: nb ? formatDay(nb) : "—" });
        if (nb) candidates.push({ key: "endDate", priority: 2, headline: `Due moved to ${formatDay(nb)}` });
        break;
      }
      case "status": {
        const nv = formatStatusValue(after);
        diffs.push({ label: "Status", oldText: formatStatusValue(before), newText: nv });
        candidates.push({ key: "status", priority: 3, headline: `Status → ${nv}` });
        break;
      }
      case "assigneeId": {
        const nv = resolveAssignee(after);
        const ov = resolveAssignee(before);
        diffs.push({ label: "Assignee", oldText: ov, newText: nv });
        const headline = !before || ov === "Unassigned"
          ? `Assigned to ${nv}`
          : !after || nv === "Unassigned"
            ? "Unassigned"
            : `Reassigned to ${nv}`;
        candidates.push({ key: "assignee", priority: 4, headline });
        break;
      }
      case "progress": {
        const nv = `${after ?? 0}%`;
        diffs.push({ label: "Progress", oldText: `${before ?? 0}%`, newText: nv });
        candidates.push({ key: "progress", priority: 5, headline: `Progress → ${nv}` });
        break;
      }
      case "name": {
        diffs.push({ label: "Renamed", oldText: String(before ?? "—"), newText: String(after ?? "—") });
        candidates.push({ key: "name", priority: 6, headline: `Renamed to "${after}"` });
        break;
      }
      default: {
        diffs.push({ label: fieldLabel(field), oldText: formatStatusValue(before), newText: formatStatusValue(after) });
        candidates.push({ key: field, priority: 7, headline: `${fieldLabel(field)} updated` });
      }
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const headline = candidates[0]?.headline || entry.content?.trim() || "Updated";
  return { headline, diffs };
}

export function ScheduleActivityFeedPopover({ scheduleId, onSelectItem }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth() as any;
  const userId: string | null = user?.id ?? null;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>(() => readFilter(scheduleId, userId));
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

  // Remember which tab you left it on, per user and schedule.
  const chooseFilter = (f: FilterMode) => {
    setFilter(f);
    try { localStorage.setItem(filterKey(scheduleId, userId), f); } catch { /* ignore */ }
  };

  // Pick up the stored choice once userId arrives after mount.
  useEffect(() => { setFilter(readFilter(scheduleId, userId)); }, [scheduleId, userId]);

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

  // Resolve assignee IDs/GUIDs in change diffs to human names. Assignees may be
  // contacts (schedule item assignedToId) or company users, so cover both.
  const { data: contactsData = [] } = useQuery<any[]>({ queryKey: ["/api/contacts"], enabled: open });
  const { data: assignableData = [] } = useQuery<any[]>({ queryKey: ["/api/users/assignable"], enabled: open });
  const resolveAssignee = useMemo<AssigneeResolver>(() => {
    const map = new Map<string, string>();
    for (const c of contactsData) {
      const company = (c?.company || "").trim();
      const name = (c?.name || "").trim();
      const label = company && name && company.toLowerCase() !== name.toLowerCase()
        ? `${company} - ${name}`
        : company || name;
      if (c?.id && label) map.set(String(c.id), label);
    }
    for (const u of assignableData) {
      const label = u?.displayName || [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email;
      if (u?.id && label) map.set(String(u.id), label);
    }
    return makeAssigneeResolver(map);
  }, [contactsData, assignableData]);

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
    // Collapse within a day, so a burst can never span the date heading it sits under.
    return Array.from(map.entries()).map(([day, dayEntries]) => [day, collapseBursts(dayEntries)] as const);
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
            {(["notes", "changes", "all"] as FilterMode[]).map(f => (
              <button
                key={f}
                onClick={() => chooseFilter(f)}
                className={`h-6 px-2 text-xs rounded-md ${filter === f ? "bg-primary text-primary-foreground" : "hover-elevate"} active-elevate-2`}
                data-testid={`filter-feed-${f}`}
              >
                {f === "all" ? "All" : f === "notes" ? "Comments" : "Changes"}
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
                    {items.map(row => row.type === "burst" ? (
                      <FeedBurst key={row.key} entries={row.entries} onSelectItem={onSelectItem} resolveAssignee={resolveAssignee} />
                    ) : (
                      <FeedItem key={row.key} entry={row.entry} onSelectItem={onSelectItem} resolveAssignee={resolveAssignee} />
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

/**
 * A run of same-action changes shown as one line — "Jed moved 4 items" — that
 * opens to the individual entries. The headline is the shared one when every
 * entry in the run says the same thing, which is the usual case for a cascade.
 */
function FeedBurst({ entries, onSelectItem, resolveAssignee }: { entries: ActivityFeedEntry[]; onSelectItem?: (id: string) => void; resolveAssignee: AssigneeResolver }) {
  const [expanded, setExpanded] = useState(false);
  const head = entries[0];
  const summaries = entries.map(e => buildChangeSummary(e, resolveAssignee));
  const headlines = new Set(summaries.map(s => s.headline));
  const sharedHeadline = headlines.size === 1 ? summaries[0].headline : null;
  const itemNames = Array.from(new Set(entries.map(e => e.scheduleItemName).filter(Boolean))) as string[];
  const Icon = head.authorType === "ai" ? Sparkles : Settings2;

  return (
    <div className="rounded-md" data-testid={`feed-burst-${head.id}`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-left hover-elevate active-elevate-2"
        aria-expanded={expanded}
      >
        <Avatar className="h-6 w-6 mt-0.5 flex-shrink-0">
          <AvatarFallback className="text-data">
            {head.authorType === "user" ? initials(head.userName) : <Icon className="w-3 h-3" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <span className="font-medium truncate">
              {head.authorType === "ai" ? "AI" : (head.userName || "System")}
            </span>
            <Badge variant="secondary" className="text-data px-1 py-0 h-4">
              {entries.length} items
            </Badge>
            <span
              className="text-muted-foreground text-table ml-auto flex-shrink-0"
              title={format(new Date(head.createdAt), "PPpp")}
            >
              {formatDistanceToNowStrict(new Date(head.createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="text-xs text-foreground mt-0.5 break-words">
            {sharedHeadline || `Updated ${entries.length} items`}
          </div>
          <div className="text-table text-muted-foreground mt-0.5 truncate">
            {itemNames.slice(0, 3).join(", ")}
            {itemNames.length > 3 ? ` and ${itemNames.length - 3} more` : ""}
          </div>
          <div className="text-table text-muted-foreground/70 mt-0.5">
            {expanded ? "Hide" : "Show each one"}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 pl-6 pb-1">
          {entries.map(e => (
            <FeedItem key={e.id} entry={e} onSelectItem={onSelectItem} resolveAssignee={resolveAssignee} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedItem({ entry, onSelectItem, resolveAssignee }: { entry: ActivityFeedEntry; onSelectItem?: (id: string) => void; resolveAssignee: AssigneeResolver }) {
  const isClickable = !!entry.scheduleItemId && !!onSelectItem;
  const Icon = entry.authorType === "ai"
    ? Sparkles
    : entry.source === "change" || entry.authorType === "system"
      ? Settings2
      : MessageSquare;
  const isChange = entry.source === "change";
  const summary = isChange ? buildChangeSummary(entry, resolveAssignee) : null;
  const noteLines = isChange ? [] : noteDetails(entry);

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
          <span
            className="text-muted-foreground text-table ml-auto flex-shrink-0"
            title={format(new Date(entry.createdAt), "PPpp")}
          >
            {formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}
          </span>
        </div>
        {isChange && summary ? (
          <>
            <div className="text-xs text-foreground mt-0.5 break-words">
              {summary.headline}
            </div>
            {summary.diffs.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {summary.diffs.map((d, i) => (
                  <div key={i} className="text-table break-words">
                    {d.label && <span className="text-muted-foreground">{d.label}: </span>}
                    <span className="text-muted-foreground">{d.oldText}</span>
                    <span className="text-muted-foreground mx-1">→</span>
                    <span className="text-foreground font-medium">{d.newText}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="text-xs text-foreground mt-0.5 break-words whitespace-pre-wrap">
              {entry.content}
            </div>
            {noteLines.length > 0 && (
              <div className="mt-0.5 space-y-0.5">
                {noteLines.map((d, i) => (
                  <div key={i} className="text-table text-muted-foreground font-mono">{d}</div>
                ))}
              </div>
            )}
          </>
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
