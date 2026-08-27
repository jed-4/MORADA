/**
 * Builds the event set for Business → Calendar: tasks and schedule items, merged
 * onto one list and filtered.
 *
 * Extracted verbatim from the `filteredEvents` `useMemo` in `BusinessCalendar.tsx`
 * so the calendar's *data* can be verified independently of whichever grid renders
 * it. The engine swap in Phase 1b replaces the renderer and does not touch this
 * file, so a fingerprint over this function's output across a matrix of filter
 * states is a proof that the swap changed nothing but pixels.
 *
 * Pure: no React, no fetching, no clock, no `Date.now()`. Same inputs, same output.
 *
 * @see BUSINESS_CALENDAR_PLAN.md Part 3a
 */
import { isWithinInterval } from "date-fns";
import type { CalendarEvent } from "./calendarEvent";
import {
  taskAssigneeIds,
  cachedAssigneeNameById,
  formatAssigneeLabel,
  type AssignableTask,
} from "./taskAssignees";

/**
 * A stable, distinct hex colour derived from any string — used when a project has
 * no colour set, so two projects never collide into the same default.
 *
 * Hues in the red band (< 20°, > 340°) are rotated 120° away: red reads as an
 * error state everywhere else in the app.
 */
export function deterministicProjectColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const adjustedHue = hue < 20 || hue > 340 ? (hue + 120) % 360 : hue;
  // Convert HSL to hex
  const s = 0.55, l = 0.48;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + adjustedHue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The filter fields this transform actually reads.
 *
 * Declared structurally rather than importing `CalendarFilters` from the client:
 * that type lives in a `.tsx` full of React imports, and `shared/` has to stay
 * loadable from a plain Node script and from the server. `CalendarFilters` is
 * assignable to this.
 *
 * Note it reads `projects`/`status` — *not* `projectIds`/`statuses`, which is what
 * the user calendar's own inline panel writes. Both name pairs exist on
 * `CalendarFilters`; this surface has always used the first.
 */
export interface BusinessCalendarFilters {
  projects?: string[];
  status?: string[];
  eventTypes?: string[];
  assignees?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

/** Only the task fields that reach an event. `Task` infers as `any`, so this is the real contract. */
export interface CalendarTaskInput extends AssignableTask {
  id: string;
  title: string;
  dueDate?: Date | string | null;
  startTime?: string | null;
  endTime?: string | null;
  projectId?: string | null;
  status?: string | null;
  templateId?: string | null;
}

/** Only the schedule-item fields that reach an event. */
export interface CalendarScheduleItemInput {
  id: string;
  name: string;
  scheduleId?: string | null;
  parentItemId?: string | null;
  startDate: Date | string;
  endDate: Date | string;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
  /** References `contacts`, never `users`. */
  assignedToId?: string | null;
  assignedToName?: string | null;
}

export interface BusinessCalendarInput {
  tasks: CalendarTaskInput[];
  scheduleItems: CalendarScheduleItemInput[];
  schedules: Array<{ id: string; projectId?: string | null }>;
  projects: Array<{ id: string; name?: string | null; color?: string | null }>;
  users: Array<{ id: string; firstName?: string | null; lastName?: string | null; email?: string | null }>;
  /** The status key that counts as done, from the `task.status` field category. */
  completedStatusKey?: string | null;
  filters: BusinessCalendarFilters;
  /** A user id, or `"all"` for no per-person filtering. */
  viewAsUserId: string;
  showParentItems: boolean;
  showChildItems: boolean;
}

export function buildBusinessCalendarEvents({
  tasks,
  scheduleItems,
  schedules,
  projects,
  users,
  completedStatusKey,
  filters,
  viewAsUserId,
  showParentItems,
  showChildItems,
}: BusinessCalendarInput): CalendarEvent[] {
  // Convert tasks to calendar events
  const taskEvents: CalendarEvent[] = tasks
    .filter(task => task.dueDate)
    .map(task => {
      const project = projects.find(p => p.id === task.projectId);
      // Both assignee columns, not just the legacy single one — see shared/taskAssignees.ts.
      const assigneeIds = taskAssigneeIds(task);
      // Resolve per id, not all-or-nothing: someone who has left the company is
      // no longer in `users`, and the row's cached name is all we have for them.
      // Falling back for the whole task would have dropped everyone else's name.
      const cachedNames = cachedAssigneeNameById(task);
      const assigneeNames = assigneeIds
        .map(id => {
          const u = users.find(candidate => candidate.id === id);
          const live = u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email : null;
          return live || cachedNames.get(id) || null;
        })
        .filter((name): name is string => !!name);
      const isCompleted = task.status === completedStatusKey;

      return {
        id: task.id,
        title: task.title,
        startDate: new Date(task.dueDate!),
        endDate: new Date(task.dueDate!),
        startTime: task.startTime,
        endTime: task.endTime,
        color: project?.color || deterministicProjectColor(task.projectId || task.id),
        projectId: task.projectId,
        projectColor: project?.color || deterministicProjectColor(task.projectId || task.id),
        projectName: project?.name || null,
        assigneeName: formatAssigneeLabel(assigneeNames),
        assigneeId: task.assigneeId,
        assigneeIds,
        type: "task" as const,
        status: task.status ?? undefined,
        isCompleted,
        templateId: task.templateId,
        resource: task,
      };
    });

  // Convert schedule items to calendar events with parent/child visibility toggles
  const parentItemIds = new Set(
    scheduleItems
      .filter(item => item.parentItemId)
      .map(item => item.parentItemId)
  );

  const filteredScheduleItems = scheduleItems.filter(item => {
    const isParent = parentItemIds.has(item.id);
    const isChild = !!item.parentItemId;
    if (isParent && !showParentItems) return false;
    if (isChild && !showChildItems) return false;
    return true;
  });

  const scheduleEvents: CalendarEvent[] = filteredScheduleItems
    .map(item => {
      const schedule = schedules.find(s => s.id === item.scheduleId);
      const project = schedule ? projects.find(p => p.id === schedule.projectId) : undefined;
      // `assignedToId` references CONTACTS, not users — a subbie or supplier — so
      // there is nothing to look up in `users`. The row caches the name already,
      // and for in-house work it caches the company's name with a null id.
      const assigneeName = item.assignedToName || null;
      const isCompleted = item.status === "completed";
      const projectColor = project?.color || deterministicProjectColor(project?.id || item.id);

      return {
        id: item.id,
        title: item.name,
        startDate: new Date(item.startDate),
        endDate: new Date(item.endDate),
        startTime: item.startTime,
        endTime: item.endTime,
        color: projectColor,
        projectId: project?.id,
        projectColor: projectColor,
        projectName: project?.name || null,
        assigneeName,
        assigneeId: item.assignedToId,
        // No Morada user owns a schedule item, so it never belongs to one person's
        // view. Filtering by person deliberately excludes them.
        assigneeIds: [],
        type: "schedule" as const,
        status: item.status ?? undefined,
        isCompleted,
      };
    });

  const allEvents = [...taskEvents, ...scheduleEvents];

  // Apply filters
  let filtered = allEvents;

  // Apply "View as User" filter first (separate from assignee multi-select filter).
  // Matches on `assigneeIds`, which carries both assignee columns — testing
  // `assigneeId` alone dropped every multi-assignee task.
  if (viewAsUserId !== "all") {
    filtered = filtered.filter(event => (event.assigneeIds ?? []).includes(viewAsUserId));
  }

  // Event type filter
  if (filters.eventTypes && filters.eventTypes.length > 0) {
    filtered = filtered.filter(event => {
      if (event.type === "schedule") {
        return filters.eventTypes!.includes("schedule-item");
      }
      return filters.eventTypes!.includes(event.type);
    });
  }

  // Project filter
  if (filters.projects && filters.projects.length > 0) {
    filtered = filtered.filter(event =>
      event.projectId && filters.projects!.includes(event.projectId)
    );
  }

  // Status filter
  if (filters.status && filters.status.length > 0) {
    filtered = filtered.filter(event =>
      event.status && filters.status!.includes(event.status)
    );
  }

  // Assignee filter — same rule as "View as User" above.
  if (filters.assignees && filters.assignees.length > 0) {
    filtered = filtered.filter(event =>
      (event.assigneeIds ?? []).some(id => filters.assignees!.includes(id))
    );
  }

  // Date range filter
  if (filters.dateFrom || filters.dateTo) {
    filtered = filtered.filter(event => {
      const eventDate = event.startDate;
      if (filters.dateFrom && filters.dateTo) {
        return isWithinInterval(eventDate, { start: filters.dateFrom, end: filters.dateTo });
      } else if (filters.dateFrom) {
        return eventDate >= filters.dateFrom;
      } else if (filters.dateTo) {
        return eventDate <= filters.dateTo;
      }
      return true;
    });
  }

  return filtered;
}
