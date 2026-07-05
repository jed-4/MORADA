import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useCircuitContext() {
  return useQuery<{ actionableCount: number; openBlockedCount: number }>({
    queryKey: ["/api/circuit/context"],
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
    refetchOnWindowFocus: true,
  });
}

export function useStartCircuitSession() {
  return useMutation({
    mutationFn: (mode: "full" | "quick" | "brain_dump") =>
      apiRequest("POST", "/api/circuit/session/start", { mode }),
  });
}

export function useSendCircuitMessage(sessionId: string) {
  return useMutation({
    mutationFn: (content: string) =>
      apiRequest("POST", `/api/circuit/session/${sessionId}/message`, { content }),
  });
}

export function useCircuitBlockedItems() {
  return useQuery({ queryKey: ["/api/circuit/blocked-items"] });
}

export function useResolveBlockedItem() {
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/circuit/blocked-items/${id}/resolve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/circuit/blocked-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuit/context"] });
    },
  });
}
