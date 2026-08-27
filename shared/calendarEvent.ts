/**
 * The event shape every Morada calendar surface renders.
 *
 * Lives in `shared/` rather than beside the renderer so the logic that *builds*
 * events can be a plain function with no React in its import graph — testable
 * from a script, and reusable by the server if a calendar feed ever needs it.
 * `EnhancedCalendar` re-exports it, so `@/components/EnhancedCalendar` remains a
 * valid import path for every existing consumer.
 *
 * Note the date/time split: `startDate`/`endDate` are real `Date`s at local
 * midnight, and the time of day is carried separately as `"HH:mm"` strings.
 * An event with no `startTime` is an all-day event.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  startTime?: string | null;
  endTime?: string | null;
  color?: string | null;
  projectId?: string | null;
  projectColor?: string | null;
  projectName?: string | null;
  assigneeName?: string | null;
  assigneeId?: string | null;
  /**
   * Every *Morada user* this event is assigned to — filter on this, never on
   * `assigneeId`, which only ever holds the legacy single assignee.
   *
   * Empty for schedule items: `scheduleItems.assignedToId` references `contacts`
   * (subbies and suppliers), so no user owns one. See `shared/taskAssignees.ts`.
   */
  assigneeIds?: string[] | null;
  /** "projected" is a ghost from a recurring template — read-only, never persisted. */
  type:
    | "task"
    | "schedule"
    | "meeting"
    | "google-calendar"
    | "timesheet"
    | "site_diary"
    | "reminder"
    | "projected";
  status?: string;
  isCompleted?: boolean;
  description?: string | null;
  location?: string | null;
  templateId?: string | null;
  tagIds?: string[] | null;
  isModified?: boolean;
  /** The row this event was built from, for click-through. Never rendered. */
  resource?: any;
}
