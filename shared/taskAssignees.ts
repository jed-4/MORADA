/**
 * Who is a task assigned to?
 *
 * Two columns mean the same thing and both are live:
 *   • `assigneeId`  — the legacy single assignee, still set on older rows and by
 *                     some create paths.
 *   • `assigneeIds` — the array, which is the normal path since multi-assignee
 *                     shipped.
 *
 * A row can carry either, or both. Reading only one of them silently loses tasks,
 * and because `shared/schema.ts` declares `notes` as `pgTable` with an `any`
 * annotation, `Task` infers as `any` and **the compiler will not catch it**. That
 * failure mode has now cost us the same bug three times: the user calendar's
 * client filter, `DbStorage.getTasks`, and the business calendar's assignee filter.
 *
 * So: never test either column directly. Go through here.
 */

/** The subset of a task these helpers need. */
export interface AssignableTask {
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  assigneeName?: string | null;
  /** Cached display names, parallel to `assigneeIds`. Stored as json, so untyped. */
  assigneeNames?: unknown;
}

/**
 * Every user id this task is assigned to — the array plus the legacy single
 * column, de-duplicated, in a stable order (legacy first, since when both are set
 * the legacy value is normally also the first array entry).
 */
export function taskAssigneeIds(task: AssignableTask | null | undefined): string[] {
  if (!task) return [];
  const ids: string[] = [];
  if (task.assigneeId) ids.push(String(task.assigneeId));
  if (Array.isArray(task.assigneeIds)) {
    for (const id of task.assigneeIds) {
      if (id) ids.push(String(id));
    }
  }
  return Array.from(new Set(ids));
}

/** Is this task assigned to the given user, by either column? */
export function isAssignedTo(
  task: AssignableTask | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return taskAssigneeIds(task).includes(String(userId));
}

/** Is this task assigned to any of the given users? Empty selection means "no filter applied". */
export function isAssignedToAny(
  task: AssignableTask | null | undefined,
  userIds: readonly string[] | null | undefined,
): boolean {
  if (!userIds || userIds.length === 0) return true;
  const assigned = taskAssigneeIds(task);
  return userIds.some((id) => assigned.includes(String(id)));
}

/**
 * The names cached on the row, keyed by the user id each one belongs to.
 *
 * Pairing matters: `assigneeName` goes with the legacy `assigneeId`, and
 * `assigneeNames[i]` with `assigneeIds[i]`. Flattening the two lists and matching
 * by position across them would mislabel people. Used only as a fallback for an
 * id that no longer resolves against the live user list — someone who has left.
 */
export function cachedAssigneeNameById(
  task: AssignableTask | null | undefined,
): Map<string, string> {
  const byId = new Map<string, string>();
  if (!task) return byId;

  if (task.assigneeId && task.assigneeName?.trim()) {
    byId.set(String(task.assigneeId), task.assigneeName.trim());
  }
  if (Array.isArray(task.assigneeIds) && Array.isArray(task.assigneeNames)) {
    task.assigneeIds.forEach((id, i) => {
      const name = (task.assigneeNames as unknown[])[i];
      if (id && typeof name === "string" && name.trim()) {
        byId.set(String(id), name.trim());
      }
    });
  }
  return byId;
}

/**
 * A chip-sized label for however many people a task is assigned to:
 * nobody → null, one → "Kye Smith", several → "Kye Smith +2".
 */
export function formatAssigneeLabel(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}
