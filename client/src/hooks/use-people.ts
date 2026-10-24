import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { sortPeople, staffOnly, type PersonLike } from "@/lib/people";

/**
 * The people a picker offers: active staff (you first, then A–Z) and, for the
 * collapsed section at the bottom, archived staff (A–Z). `archived` is fetched
 * only when `withArchived` is on, so a picker that never opens it costs nothing.
 */
export function usePeople<T extends PersonLike = any>({ withArchived = true }: { withArchived?: boolean } = {}) {
  const { user } = useAuth();
  const meId = (user as any)?.id ?? null;
  const activeQ = useQuery<T[]>({ queryKey: ["/api/users"] });
  const archivedQ = useQuery<T[]>({ queryKey: ["/api/users?status=archived"], enabled: withArchived });

  const active = useMemo(() => sortPeople(staffOnly(activeQ.data ?? []), meId), [activeQ.data, meId]);
  const archived = useMemo(
    () => sortPeople((archivedQ.data ?? []).filter((p) => p.userCategory === "team")),
    [archivedQ.data],
  );
  const byId = useMemo(() => {
    const m = new Map<string, T>();
    for (const p of [...archived, ...active]) m.set(p.id, p);
    return m;
  }, [active, archived]);

  return { active, archived, byId, meId, isLoading: activeQ.isLoading };
}
