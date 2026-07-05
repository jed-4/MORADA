import { useState, useRef, useEffect } from "react";
import { useCircuitContext, useStartCircuitSession, useSendCircuitMessage } from "@/hooks/use-circuit";
import { Input } from "@/components/ui/input";
import { X, Zap, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface CircuitChatMessage {
  role: "assistant" | "user";
  message: string;
  quickReplies?: string[];
  currentStop?: number;
  stopName?: string;
}

const STOP_COLORS: Record<number, string> = {
  1: "#7B6B9E", 2: "#7B6B9E", 3: "#7B6B9E",
  4: "#C8922A", 5: "#C8922A", 6: "#7B6B9E",
  7: "#3BA86B", 8: "#C8922A", 9: "#7B6B9E",
};

export function CircuitWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CircuitChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStop, setCurrentStop] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: circuitCtx } = useCircuitContext();
  const startSession = useStartCircuitSession();
  const sendMessage = useSendCircuitMessage(sessionId || "");

  const totalActionable = (circuitCtx?.actionableCount || 0) + (circuitCtx?.openBlockedCount || 0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  async function handleStart(mode: "full" | "quick" | "brain_dump") {
    setIsLoading(true);
    setError(null);
    try {
      const result: any = await startSession.mutateAsync(mode);
      setSessionId(result.session.id);
      setMessages([{
        role: "assistant",
        message: result.message.message,
        quickReplies: result.message.quickReplies,
        currentStop: result.message.currentStop,
        stopName: result.message.stopName,
      }]);
      setCurrentStop(result.message.currentStop || 1);
    } catch (e: any) {
      setError(e?.message || "Couldn't start Circuit. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSend(content: string) {
    if (!content.trim() || !sessionId || isLoading) return;
    const userMsg = content.trim();
    setInputValue("");
    setError(null);
    setMessages(prev => [...prev, { role: "user", message: userMsg }]);
    setIsLoading(true);
    try {
      const result: any = await sendMessage.mutateAsync(userMsg);
      const m = result.message;
      setMessages(prev => [...prev, {
        role: "assistant",
        message: m.message,
        quickReplies: m.quickReplies,
        currentStop: m.currentStop,
        stopName: m.stopName,
      }]);
      if (m.currentStop) setCurrentStop(m.currentStop);
    } catch (e: any) {
      setError(e?.message || "Couldn't send that. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const progressPct = Math.round((currentStop / 9) * 100);

  return (
    <>
      {/* Header button */}
      <button
        onClick={() => setIsOpen(true)}
        data-testid="button-circuit-open"
        className="relative flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "#7B6B9E" }}
      >
        <Zap size={14} />
        <span>Circuit</span>
        {totalActionable > 0 && (
          <span className="flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-xs font-bold"
            style={{ background: "#C8922A", color: "white" }}>
            {totalActionable > 9 ? "9+" : totalActionable}
          </span>
        )}
      </button>

      {/* Chat panel overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:justify-end p-0 sm:p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="relative w-full sm:w-[420px] h-[90vh] sm:h-[680px] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "#F6F1EB" }}>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 text-white" style={{ background: "#2E1F14" }}>
              <div className="flex items-center gap-2">
                <Zap size={16} style={{ color: "#C8922A" }} />
                <span className="font-semibold text-sm">Circuit</span>
                {sessionId && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "#7B6B9E", color: "white" }}>
                    Stop {currentStop} of 9
                  </span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} data-testid="button-circuit-close" className="opacity-70 hover:opacity-100">
                <X size={18} />
              </button>
            </div>

            {/* Progress bar */}
            {sessionId && (
              <div className="h-1 w-full" style={{ background: "#D4CCBF" }}>
                <div className="h-full transition-all duration-500 rounded-r"
                  style={{ width: `${progressPct}%`, background: STOP_COLORS[currentStop] || "#7B6B9E" }} />
              </div>
            )}

            {/* Messages or start screen */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-3">
                {!sessionId ? (
                  /* Start screen */
                  <div className="space-y-4 pt-4">
                    <div>
                      <p className="font-bold text-lg" style={{ color: "#2E1F14" }}>Ready to run your circuit?</p>
                      <p className="text-sm mt-1" style={{ color: "#9A9389" }}>
                        I'll ask the questions — you just react. Picks up from where blocked items left off last time.
                      </p>
                    </div>
                    {totalActionable > 0 && (
                      <div className="p-3 rounded-xl text-sm" style={{ background: "#EAE7F2" }}>
                        <span style={{ color: "#7B6B9E" }} className="font-semibold">{totalActionable} items</span>
                        <span style={{ color: "#2E1F14" }}> need your attention</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      <button onClick={() => handleStart("full")} disabled={isLoading}
                        data-testid="button-circuit-mode-full"
                        className="w-full p-4 rounded-xl text-left font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "#7B6B9E" }}>
                        Full Circuit — all 9 stops
                        <p className="text-xs font-normal opacity-80 mt-0.5">~15 minutes · complete business review</p>
                      </button>
                      <button onClick={() => handleStart("quick")} disabled={isLoading}
                        data-testid="button-circuit-mode-quick"
                        className="w-full p-4 rounded-xl text-left font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "white", color: "#2E1F14", border: "1px solid #D4CCBF" }}>
                        Quick Check — sites & clients only
                        <p className="text-xs font-normal opacity-60 mt-0.5">~5 minutes · daily morning check</p>
                      </button>
                      <button onClick={() => handleStart("brain_dump")} disabled={isLoading}
                        data-testid="button-circuit-mode-braindump"
                        className="w-full p-4 rounded-xl text-left font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ background: "white", color: "#2E1F14", border: "1px solid #D4CCBF" }}>
                        Brain Dump
                        <p className="text-xs font-normal opacity-60 mt-0.5">Type everything on your mind · I'll sort it</p>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Chat messages */
                  messages.map((msg, i) => (
                    <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                      <div className="max-w-[85%] space-y-2">
                        {msg.role === "assistant" && msg.stopName && (
                          <div className="text-xs font-semibold px-2 py-0.5 rounded-full inline-block"
                            style={{ background: `${STOP_COLORS[msg.currentStop || 1]}20`, color: STOP_COLORS[msg.currentStop || 1] }}>
                            Stop {msg.currentStop} — {msg.stopName}
                          </div>
                        )}
                        <div className={cn("px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap",
                          msg.role === "user"
                            ? "text-white rounded-br-sm"
                            : "rounded-bl-sm shadow-sm")}
                          style={{
                            background: msg.role === "user" ? "#7B6B9E" : "white",
                            color: msg.role === "user" ? "white" : "#2E1F14",
                          }}>
                          {msg.message}
                        </div>
                        {msg.role === "assistant" && msg.quickReplies && msg.quickReplies.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.quickReplies.map((reply, ri) => (
                              <button key={ri} onClick={() => handleSend(reply)} disabled={isLoading}
                                data-testid={`button-circuit-quickreply-${ri}`}
                                className="px-3 py-1.5 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 disabled:opacity-50"
                                style={{ borderColor: "#7B6B9E", color: "#7B6B9E", background: "white" }}>
                                {reply}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex gap-1 px-4 py-3 rounded-2xl rounded-bl-sm w-fit shadow-sm" style={{ background: "white" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                        style={{ background: "#7B6B9E", animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                )}
                {error && (
                  <div className="px-3 py-2 rounded-xl text-xs" style={{ background: "#F8D7DA", color: "#842029" }}>
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Input bar */}
            {sessionId && (
              <div className="p-3 border-t flex gap-2 items-center" style={{ borderColor: "#D4CCBF", background: "white" }}>
                <Input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(inputValue); } }}
                  placeholder="Or type anything..."
                  data-testid="input-circuit-message"
                  className="flex-1 border-0 bg-transparent focus-visible:ring-0 text-sm"
                  style={{ color: "#2E1F14" }}
                  disabled={isLoading}
                />
                <button onClick={() => handleSend(inputValue)} disabled={isLoading || !inputValue.trim()}
                  data-testid="button-circuit-send"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity disabled:opacity-40"
                  style={{ background: "#7B6B9E" }}>
                  <Send size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
