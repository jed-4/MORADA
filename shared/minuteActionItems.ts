/**
 * Action items on meeting minutes.
 *
 * An action item IS a task — a `notes` row with `type: "task"` — linked back to
 * the minute it came out of. Not a table of its own.
 *
 * The obvious design was a `minute_action_items` table with a description, an
 * assignee, a due date and a done flag. That is the same four columns tasks
 * already have, and it would have meant a second place to assign work, a second
 * place to chase it, and a synchroniser between them. Worse, the items would
 * live where nobody looks: the point of writing "Dave to chase the frame
 * delivery" is that Dave sees it on Monday, in the list he actually opens.
 *
 * Being a task gets assignment, due dates, status, comments, @mentions,
 * notifications and the whole To-Dos UI for free, and an action item cannot
 * drift out of step with its own task because there is only one row.
 *
 * `notes.referenceType` / `referenceId` is the existing hook for exactly this —
 * schedule bookings and insurance reminders already use it — so there is no
 * schema change.
 */

/** `notes.referenceType` marking a task as an action item from meeting minutes. */
export const MINUTE_ACTION_REFERENCE = "minute_action_item";

export type MinuteActionTask = {
  id: string;
  title: string;
  status?: string | null;
  dueDate?: Date | string | null;
  assigneeIds?: string[] | null;
  assigneeNames?: unknown;
  referenceId?: string | null;
  completedAt?: Date | string | null;
};

export function isDone(task: Pick<MinuteActionTask, "status" | "completedAt">): boolean {
  return task.status === "done" || !!task.completedAt;
}

/**
 * Open items from EARLIER meetings, for carrying forward.
 *
 * A meeting that does not revisit what it agreed last time is how action items
 * quietly stop meaning anything, so the minutes show what is still outstanding
 * from the ones before — excluding this meeting's own items, which are already
 * listed, and anything finished.
 */
export function carriedForward<T extends MinuteActionTask>(
  tasks: T[],
  currentMinuteId: string,
): T[] {
  return (tasks || []).filter((t) => t.referenceId !== currentMinuteId && !isDone(t));
}

/** Newest-first within done/not-done: outstanding work reads first. */
export function sortActionItems<T extends MinuteActionTask>(tasks: T[]): T[] {
  return [...(tasks || [])].sort((a, b) => {
    const ad = isDone(a) ? 1 : 0;
    const bd = isDone(b) ? 1 : 0;
    if (ad !== bd) return ad - bd;
    const at = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    return at - bt;
  });
}
