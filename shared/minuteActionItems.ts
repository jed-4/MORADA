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

/**
 * Where an action item SITS: the four fields that put a task in a project's
 * To-Dos or in the business list.
 *
 * One function because two places need the same answer and must not drift: the
 * route that raises an action item off a minute, and the one that moves a
 * minute to another job. A minute written against the wrong project used to be
 * unfixable, and the first attempt at fixing it moved the minute alone — which
 * leaves this meeting's work in the old job's To-Dos, where nobody is looking
 * for it, while the meeting it came out of lives somewhere else.
 *
 * `taskContextId` falls back to the company, not to null: a business-level task
 * is anchored to the company, which is what the task lists filter on.
 */
export function actionItemPlacement(projectId: string | null | undefined, companyId: string) {
  // `|| null`, not `?? null`: the project picker sends "" for Business, and
  // notes.project_id is plain text with no foreign key, so an empty string
  // would be stored happily and match no project at all.
  const inProject = !!projectId;
  return {
    projectId: projectId || null,
    scope: inProject ? "project" : "personal",
    taskContextType: inProject ? "project" : "business",
    taskContextId: inProject ? projectId! : companyId,
  };
}
