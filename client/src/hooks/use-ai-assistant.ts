import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AiMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface CircuitData {
  message: string;
  quickReplies: string[];
  currentStop: number;
  stopName: string;
}

export interface AiContextData {
  actionableCount: number;
  openBlockedCount: number;
}

export interface BlockedItem {
  id: string;
  description: string;
  resolvedAt: string | null;
  createdAt: string;
}

export function useAiContext() {
  return useQuery<AiContextData>({
    queryKey: ["/api/ai/context"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useAiBlockedItems() {
  return useQuery<BlockedItem[]>({
    queryKey: ["/api/ai/blocked-items"],
    staleTime: 0,
  });
}

export function useAiAssistant() {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [isCircuitMode, setIsCircuitMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const isMounted = useRef(true);

  const createConversation = useCallback(async (): Promise<string> => {
    const conv = await apiRequest("POST", "/api/ai/conversations", { title: null }) as any;
    return conv.id;
  }, []);

  const sendMessage = useCallback(async (content: string, circuitMode?: boolean) => {
    if (!content.trim() || isSending) return;
    setIsSending(true);

    const userMsg: AiMessage = { role: "user", content };
    setMessages(prev => [...prev, userMsg]);

    try {
      let convId = conversationId;
      if (!convId) {
        convId = await createConversation();
        setConversationId(convId);
      }

      const mode = circuitMode ?? isCircuitMode;
      const result = await apiRequest("POST", `/api/ai/conversations/${convId}/messages`, {
        content, circuitMode: mode,
      }) as any;

      const assistantMsg: AiMessage = { role: "assistant", content: result.message };
      setMessages(prev => [...prev, assistantMsg]);

      if (result.circuitData) {
        setCircuitData(result.circuitData);
      }

      qc.invalidateQueries({ queryKey: ["/api/ai/context"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/blocked-items"] });
    } catch (err: any) {
      const errMsg: AiMessage = {
        role: "assistant",
        content: "Sorry, something went wrong. Please try again.",
      };
      if (isMounted.current) setMessages(prev => [...prev, errMsg]);
    } finally {
      if (isMounted.current) setIsSending(false);
    }
  }, [conversationId, createConversation, isCircuitMode, isSending, qc]);

  const startCircuit = useCallback(async (mode: "full" | "quick" = "full") => {
    setIsSending(true);
    setIsCircuitMode(true);
    setMessages([]);

    try {
      const result = await apiRequest("POST", "/api/ai/circuit/start", { mode }) as any;
      setConversationId(result.conversationId);
      setMessages([
        { role: "user", content: mode === "quick" ? "Quick check please" : "Run the full circuit" },
        { role: "assistant", content: result.message },
      ]);
      if (result.circuitData) setCircuitData(result.circuitData);
    } catch (err) {
      setMessages([{ role: "assistant", content: "Couldn't start the circuit. Please try again." }]);
    } finally {
      if (isMounted.current) setIsSending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setCircuitData(null);
    setIsCircuitMode(false);
  }, []);

  const resolveBlockedItem = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/ai/blocked-items/${id}/resolve`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ai/blocked-items"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/context"] });
    },
  });

  return {
    conversationId,
    messages,
    circuitData,
    isCircuitMode,
    isSending,
    sendMessage,
    startCircuit,
    reset,
    resolveBlockedItem,
  };
}
