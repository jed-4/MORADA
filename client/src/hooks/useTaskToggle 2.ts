import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, type QueryKey } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isTaskDone } from "@/components/widgets/shared/TaskRow";

/**
 * How long a just-completed task stays on screen, struck through, before the
 * list drops it. Long enough to read as "that one's done" and to click again
 * to undo; short enough that the list doesn't fill up with finished work.
 */
const DEFAULT_LINGER_MS = 4000;

/** Task caches this hook patches optimistically. Neither widget reads
 * `/api/tasks`, but the Tasks page does, so it is kept in step. */
const DEFAULT_QUERY_KEYS: readonly QueryKey[] = [["/api/tasks/my"], ["/api/tasks"]];

interface TaskLike {
  id: string;
  status?: string | null;
}

interface UseTaskToggleOptions {
  /** Task list caches to patch. Defaults to `/api/tasks/my` and `/api/tasks`. */
  queryKeys?: readonly QueryKey[];
  /** Override the linger window (ms). */
  lingerMs?: number;
}

/**
 * Completing a task used to wait on the server: a PATCH, then an invalidate,
 * then a refetch of `/api/tasks/my` (which itself loads every project to attach
 * names) — three sequential round trips to us-east-1 before a single pixel
 * moved, so a click looked like it had done nothing for several seconds.
 *
 * This writes the new status into the task caches immediately, so `TaskRow` /
 * `TaskCard` strike the row through on the click, then holds the row in place
 * for a moment before the list filter drops it. The server is reconciled once
 * the linger is over, off the critical path.
 *
 * Callers keep a lingering task visible themselves — the filter that normally
 * hides done tasks has to admit `isLingering(task.id)`. See `PersonalTasksWidget`.
 */
export function useTaskToggle(options?: UseTaskToggleOptions) {
  const queryKeys = options?.queryKeys ?? DEFAULT_QUERY_KEYS;
  const lingerMs = options?.lingerMs ?? DEFAULT_LINGER_MS;

  // Ids of tasks just marked done that the list should still render.
  const [lingeringIds, setLingeringIds] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const stopLingering = useCallback((taskId: string) => {
    const timer = timers.current.get(taskId);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(taskId);
    }
    setLingeringIds(prev => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }, []);

  // A widget can unmount (dashboard edit, view switch) with timers pending.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const patchCaches = useCallback(
    (taskId: string, status: string) => {
      for (const key of queryKeys) {
        queryClient.setQueryData<unknown>(key, (old: unknown) => {
          if (!Array.isArray(old)) return old;
          let changed = false;
          const next = old.map((t: TaskLike) => {
            if (t?.id !== taskId) return t;
            changed = true;
            return { ...t, status };
          });
          return changed ? next : old;
        });
      }
    },
    [queryKeys],
  );

  const mutation = useMutation({
    mutationFn: async ({ task, nextStatus }: { task: TaskLike; nextStatus: string }) => {
      return apiRequest(`/api/tasks/${task.id}`, "PATCH", { status: nextStatus });
    },
    onMutate: async ({ task, nextStatus }) => {
      // Stop an in-flight refetch from landing on top of the optimistic write.
      await Promise.all(queryKeys.map(key => queryClient.cancelQueries({ queryKey: key })));

      const snapshots = queryKeys.map(
        key => [key, queryClient.getQueryData<unknown>(key)] as const,
      );
      patchCaches(task.id, nextStatus);
      return { snapshots };
    },
    onError: (_error, { task }, context) => {
      // Put the caches back and un-strike the row.
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData<unknown>(key, data));
      stopLingering(task.id);
    },
  });

  const { mutate } = mutation;

  const toggleTask = useCallback(
    (task: TaskLike) => {
      const wasDone = isTaskDone(task.status);
      const nextStatus = wasDone ? "todo" : "done";

      if (wasDone) {
        // Un-completing: the row stays either way, so drop it out of the
        // linger set now rather than letting a stale timer hide it later.
        stopLingering(task.id);
      } else {
        setLingeringIds(prev => new Set(prev).add(task.id));
        const existing = timers.current.get(task.id);
        if (existing) clearTimeout(existing);
        timers.current.set(
          task.id,
          setTimeout(() => {
            timers.current.delete(task.id);
            setLingeringIds(prev => {
              if (!prev.has(task.id)) return prev;
              const next = new Set(prev);
              next.delete(task.id);
              return next;
            });
            // Reconcile with the server now the row is on its way out, so the
            // refetch can't make the list jump while it is still being read.
            queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
          }, lingerMs),
        );
      }

      mutate({ task, nextStatus });
    },
    [mutate, stopLingering, lingerMs, queryKeys],
  );

  const isLingering = useCallback((taskId: string) => lingeringIds.has(taskId), [lingeringIds]);

  return { toggleTask, isLingering, lingeringIds };
}
