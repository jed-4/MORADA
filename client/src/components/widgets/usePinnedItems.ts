import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface PinnedItemSummary {
  id: string;
  itemType: string;
  itemId: string;
  itemName: string;
  category: string | null;
}

/**
 * Shared hook used by row "Pin" buttons across Bills, Variations, Defects,
 * Checklists, Site Diary, and Notes lists. Wraps the project-scoped pinned
 * items API and exposes a quick `isPinned()` lookup plus a `togglePin()`
 * mutation. The widget itself uses its own local query — both share the
 * same query key so unpinning from the widget syncs to row buttons and
 * vice-versa.
 */
export function usePinnedItems(projectId: string | undefined) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["/api/projects", projectId, "pinned-items"] as const;

  const itemsQ = useQuery<PinnedItemSummary[]>({
    queryKey,
    queryFn: () =>
      apiRequest(`/api/projects/${projectId}/pinned-items`, "GET"),
    enabled: !!projectId,
  });

  const lookup = useMemo(() => {
    const map = new Map<string, PinnedItemSummary>();
    for (const it of itemsQ.data || []) {
      map.set(`${it.itemType}:${it.itemId}`, it);
    }
    return map;
  }, [itemsQ.data]);

  const isPinned = (itemType: string, itemId: string): boolean =>
    lookup.has(`${itemType}:${itemId}`);

  const pinMutation = useMutation({
    mutationFn: (data: {
      itemType: string;
      itemId: string;
      itemName: string;
      itemIcon?: string | null;
      category?: string | null;
    }) =>
      apiRequest(`/api/projects/${projectId}/pinned-items`, "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const unpinMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/projects/${projectId}/pinned-items/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const togglePin = async (data: {
    itemType: string;
    itemId: string;
    itemName: string;
    itemIcon?: string | null;
    category?: string | null;
  }) => {
    if (!projectId) return;
    const existing = lookup.get(`${data.itemType}:${data.itemId}`);
    try {
      if (existing) {
        await unpinMutation.mutateAsync(existing.id);
        toast({ title: "Unpinned", description: data.itemName });
      } else {
        await pinMutation.mutateAsync(data);
        toast({ title: "Pinned", description: data.itemName });
      }
    } catch (e: any) {
      toast({
        title: "Couldn't update pin",
        description: e?.message || String(e),
        variant: "destructive",
      });
    }
  };

  return {
    pinnedItems: itemsQ.data || [],
    isPinned,
    togglePin,
    isLoading: itemsQ.isLoading,
  };
}
