// Shared task-status helpers (used by TasksScreen and ProjectTasksScreen).
//
// Company status options come from /api/field-categories/by-key/task.status.
// Options carry `isDefault` / `isCompleted` flags; fall back to key/name
// matching, then to position, so custom status sets still behave sensibly.

export interface TaskStatusOption {
  key: string;
  name: string;
  color: string | null;
  sortOrder: number;
  isDefault?: boolean;
  isCompleted?: boolean;
}

const DONE_RE = /^(done|complete|completed|finished)$/i;

/** The status key that marks a task as done. */
export function doneStatusKey(options: TaskStatusOption[]): string {
  if (options.length === 0) return 'done';
  const flagged = options.find(o => o.isCompleted);
  if (flagged) return flagged.key;
  const matched = options.find(o => DONE_RE.test(o.key) || DONE_RE.test((o.name || '').trim()));
  if (matched) return matched.key;
  return options[options.length - 1].key;
}

/** The status key a new (or reopened) task should get. */
export function defaultStatusKey(options: TaskStatusOption[]): string {
  if (options.length === 0) return 'todo';
  const flagged = options.find(o => o.isDefault);
  if (flagged) return flagged.key;
  return options[0].key;
}

/** Whether a task status counts as done under the company's options. */
export function isDoneStatus(status: string | undefined, options: TaskStatusOption[]): boolean {
  if (options.length === 0) return status === 'done' || status === 'completed';
  return (status || defaultStatusKey(options)) === doneStatusKey(options);
}
