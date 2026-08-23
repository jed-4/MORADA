/**
 * Keeping tasks linked to a schedule item in step with that item.
 *
 * A schedule item can have tasks attached to it (`taskIds`) with a per-task offset
 * (`taskLinkOffsets`): "due 2 days before this finishes", or — for a time booking —
 * "I'm there 09:00-10:00 on the day it starts". When the item moves, those tasks
 * have to move with it, or the booking quietly detaches from reality.
 *
 * This lives on the server because a schedule item's dates change from several
 * places: the Schedule edit modal, single-item Gantt drags, and the bulk endpoint
 * the Gantt uses for cascades. Doing it per-UI meant the Gantt paths silently
 * skipped it.
 */

/** `notes.referenceType` marking a task as time booked against a schedule item. */
export const SCHEDULE_BOOKING_REFERENCE = "schedule_item_booking";

export interface TaskLinkOffset {
  taskId: string;
  offsetDays?: number;
  offsetFrom?: "start" | "end";
  /** Set when the link is a time booking; preserved across moves. */
  startTime?: string | null;
  endTime?: string | null;
}

interface ScheduleItemDates {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  taskLinkOffsets?: unknown;
}

interface TaskUpdater {
  updateTask(id: string, data: any): Promise<any>;
}

/** Whether a date-bearing field actually changed between two versions of an item. */
export function scheduleDatesChanged(before: ScheduleItemDates, after: ScheduleItemDates): boolean {
  const at = (v: Date | string | null | undefined) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d.getTime();
  };
  return at(before.startDate) !== at(after.startDate) || at(before.endDate) !== at(after.endDate);
}

/**
 * Recompute the due date (and booked time, if any) of every task linked to `item`.
 *
 * Failures are swallowed per task: a linked task that has since been deleted must
 * not fail the schedule update that triggered the reflow.
 */
export async function reflowLinkedTasks(
  item: ScheduleItemDates,
  storage: TaskUpdater
): Promise<number> {
  const offsets = Array.isArray(item.taskLinkOffsets)
    ? (item.taskLinkOffsets as TaskLinkOffset[])
    : [];
  if (offsets.length === 0) return 0;

  let updated = 0;

  for (const offset of offsets) {
    if (!offset?.taskId) continue;

    const reference = offset.offsetFrom === "end" ? item.endDate : item.startDate;
    if (!reference) continue;
    const base = reference instanceof Date ? new Date(reference) : new Date(reference);
    if (isNaN(base.getTime())) continue;

    const due = new Date(base);
    due.setDate(due.getDate() + (offset.offsetDays ?? 0));

    const update: Record<string, unknown> = { dueDate: due };
    // Only touch times for bookings. A plain due-date link must not have times
    // imposed on it, and must not have the user's own times wiped either.
    if (offset.startTime !== undefined) update.startTime = offset.startTime;
    if (offset.endTime !== undefined) update.endTime = offset.endTime;

    try {
      await storage.updateTask(offset.taskId, update);
      updated++;
    } catch {
      // Linked task is gone or not updatable — skip it rather than failing the move.
    }
  }

  return updated;
}
