import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AiMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface AiConversation {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
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

// ── Circuit mode persistence (survives page refresh) ─────────────────────────

const CIRCUIT_STATE_KEY = "morada_circuit_state";

interface PersistedCircuitState {
  conversationId: string;
  currentStop: number;
  stopName: string;
}

function saveCircuitState(state: PersistedCircuitState | null) {
  if (state) {
    try { localStorage.setItem(CIRCUIT_STATE_KEY, JSON.stringify(state)); } catch {}
  } else {
    try { localStorage.removeItem(CIRCUIT_STATE_KEY); } catch {}
  }
}

function loadCircuitState(): PersistedCircuitState | null {
  try {
    const raw = localStorage.getItem(CIRCUIT_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Read-only query hooks ─────────────────────────────────────────────────────

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

export function useAiConversations() {
  return useQuery<AiConversation[]>({
    queryKey: ["/api/ai/conversations"],
    staleTime: 30_000,
  });
}

// ── Main assistant hook ───────────────────────────────────────────────────────

export function useAiAssistant() {
  const qc = useQueryClient();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [circuitData, setCircuitData] = useState<CircuitData | null>(null);
  const [isCircuitMode, setIsCircuitMode] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isInitialising, setIsInitialising] = useState(false);
  const isMounted = useRef(true);

  // ── Create a new conversation ─────────────────────────────────────────────

  const createConversation = useCallback(async (): Promise<string> => {
    const conv = await apiRequest("/api/ai/conversations", "POST", { title: null }) as any;
    qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
    return conv.id;
  }, [qc]);

  // ── Load a specific conversation by ID ───────────────────────────────────

  const loadConversation = useCallback(async (id: string) => {
    setIsLoadingHistory(true);
    try {
      const result = await apiRequest(`/api/ai/conversations/${id}/messages`, "GET") as any;
      const msgs: AiMessage[] = Array.isArray(result)
        ? result
        : (result?.messages ?? []);

      if (!isMounted.current) return;
      setConversationId(id);
      setMessages(msgs);

      // Attempt to restore circuit mode from localStorage
      const saved = loadCircuitState();
      if (saved && saved.conversationId === id) {
        setIsCircuitMode(true);
        // Reconstruct a minimal circuitData from persisted state so the
        // progress bar shows the right stop even before the next AI turn.
        setCircuitData(prev => prev ?? {
          message: "",
          quickReplies: [],
          currentStop: saved.currentStop,
          stopName: saved.stopName,
        });
      } else {
        setIsCircuitMode(false);
        setCircuitData(null);
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    } finally {
      if (isMounted.current) setIsLoadingHistory(false);
    }
  }, []);

  // ── Auto-resume the most recent conversation when the panel first opens ──
  // Call this once from the component via useEffect.

  const resumeLatest = useCallback(async () => {
    setIsInitialising(true);
    try {
      // Try to restore an in-progress circuit first
      const saved = loadCircuitState();
      if (saved) {
        await loadConversation(saved.conversationId);
        return;
      }
      // Otherwise load the newest general conversation from the list
      const convs = await apiRequest("/api/ai/conversations", "GET") as AiConversation[];
      if (!isMounted.current) return;
      if (convs && convs.length > 0) {
        await loadConversation(convs[0].id);
      }
    } catch {
      // Silent — just start fresh if the list fetch fails
    } finally {
      if (isMounted.current) setIsInitialising(false);
    }
  }, [loadConversation]);

  // ── Send a chat message ──────────────────────────────────────────────────

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
      const result = await apiRequest(
        `/api/ai/conversations/${convId}/messages`,
        "POST",
        { content, circuitMode: mode },
      ) as any;

      const assistantMsg: AiMessage = { role: "assistant", content: result.message };
      if (isMounted.current) setMessages(prev => [...prev, assistantMsg]);

      if (result.circuitData && isMounted.current) {
        const cd: CircuitData = result.circuitData;
        setCircuitData(cd);
        // Persist circuit state so it survives a page refresh
        saveCircuitState({
          conversationId: convId,
          currentStop: cd.currentStop,
          stopName: cd.stopName,
        });
      }

      qc.invalidateQueries({ queryKey: ["/api/ai/context"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/blocked-items"] });
      qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
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

  // ── Start a circuit run ──────────────────────────────────────────────────

  const startCircuit = useCallback(async (mode: "full" | "quick" = "full") => {
    setIsSending(true);
    setIsCircuitMode(true);
    // Keep existing messages in view — circuit continues in the same thread
    saveCircuitState(null); // clear any previous saved state before new circuit

    try {
      // Pass the active conversationId so circuit starts in the same conversation thread
      const result = await apiRequest("/api/ai/circuit/start", "POST", {
        mode,
        conversationId: conversationId ?? undefined,
      }) as any;
      if (!isMounted.current) return;
      setConversationId(result.conversationId);
      const initialMsgs: AiMessage[] = [
        { role: "user", content: mode === "quick" ? "Quick check please" : "Run the full circuit" },
        { role: "assistant", content: result.message },
      ];
      setMessages(initialMsgs);
      if (result.circuitData) {
        const cd: CircuitData = result.circuitData;
        setCircuitData(cd);
        saveCircuitState({
          conversationId: result.conversationId,
          currentStop: cd.currentStop,
          stopName: cd.stopName,
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/ai/conversations"] });
    } catch (err) {
      if (isMounted.current) {
        setMessages([{ role: "assistant", content: "Couldn't start the circuit. Please try again." }]);
        setIsCircuitMode(false);
        saveCircuitState(null);
      }
    } finally {
      if (isMounted.current) setIsSending(false);
    }
  }, [qc]);

  // ── Reset to blank state ─────────────────────────────────────────────────

  const reset = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setCircuitData(null);
    setIsCircuitMode(false);
    saveCircuitState(null);
  }, []);

  // ── Resolve a blocked item ───────────────────────────────────────────────

  const resolveBlockedItem = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/ai/blocked-items/${id}/resolve`, "PATCH", {}),
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
    isLoadingHistory,
    isInitialising,
    sendMessage,
    startCircuit,
    loadConversation,
    resumeLatest,
    reset,
    resolveBlockedItem,
  };
}
