import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot, Send, RotateCcw, CheckCircle2, AlertCircle,
  Loader2, Zap, History, MessageSquare, ChevronLeft,
} from "lucide-react";
import {
  useAiAssistant, useAiContext, useAiBlockedItems, useAiConversations,
} from "@/hooks/use-ai-assistant";

const CIRCUIT_STOPS_COUNT = 9;

const QUICK_CHIPS = [
  "What's overdue?",
  "Any unpaid bills?",
  "How are my projects tracking?",
  "What invoices need chasing?",
];

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current - 1) / total) * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>Stop {current}/{total}</span>
    </div>
  );
}

function MessageBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function QuickReplies({
  replies,
  onSelect,
  disabled,
}: {
  replies: string[];
  onSelect: (r: string) => void;
  disabled: boolean;
}) {
  if (!replies.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {replies.map((r) => (
        <button
          key={r}
          disabled={disabled}
          onClick={() => onSelect(r)}
          className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover-elevate active-elevate-2 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function ConversationList({
  onSelect,
  onNew,
}: {
  onSelect: (id: string, title: string | null) => void;
  onNew: () => void;
}) {
  const { data: convs = [], isLoading } = useAiConversations();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (convs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-4">
        <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs text-muted-foreground mt-1">Start a new chat to get going.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onNew} className="mt-1">
          New chat
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1 p-1">
      {convs.map((conv) => {
        const label = conv.title || "Untitled conversation";
        const date = new Date(conv.updatedAt).toLocaleDateString("en-AU", {
          day: "numeric", month: "short",
        });
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id, conv.title)}
            className="w-full flex items-start gap-2 rounded-md px-3 py-2.5 text-left hover-elevate active-elevate-2"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{label}</p>
              <p className="text-[11px] text-muted-foreground">{date}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MoradaAI() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<"chat" | "blocked" | "history">("chat");
  const [showHistory, setShowHistory] = useState(false);

  const {
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
  } = useAiAssistant();

  const { data: aiCtx } = useAiContext();
  const { data: blockedItems = [] } = useAiBlockedItems();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasResumed = useRef(false);

  const totalBadge =
    (aiCtx?.actionableCount ?? 0) + (aiCtx?.openBlockedCount ?? 0);
  const openBlockedCount = blockedItems.filter((i) => !i.resolvedAt).length;

  // Auto-resume the most recent conversation the first time the panel opens
  useEffect(() => {
    if (open && !hasResumed.current) {
      hasResumed.current = true;
      resumeLatest();
    }
  }, [open, resumeLatest]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open && tab === "chat" && !showHistory && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, tab, showHistory]);

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    sendMessage(input.trim(), isCircuitMode);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectConversation = async (id: string) => {
    setShowHistory(false);
    setTab("chat");
    await loadConversation(id);
  };

  const handleNewChat = () => {
    reset();
    setShowHistory(false);
    setTab("chat");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Morada AI"
        >
          <Bot className="h-5 w-5" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center px-0.5">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[390px] p-0 shadow-lg"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            {showHistory ? (
              <button
                onClick={() => setShowHistory(false)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>History</span>
              </button>
            ) : (
              <>
                <Bot className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Morada AI</span>
                {isCircuitMode && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    Circuit
                  </Badge>
                )}
              </>
            )}
          </div>
          {!showHistory && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowHistory(true)}
                className="h-7 w-7"
                title="Conversation history"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNewChat}
                  className="h-7 w-7"
                  title="New conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* History panel */}
        {showHistory ? (
          <div className="h-[460px] overflow-y-auto">
            <div className="px-4 py-2 flex items-center justify-between border-b">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Recent chats</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleNewChat}>
                New chat
              </Button>
            </div>
            <ScrollArea className="h-[calc(460px-41px)]">
              <ConversationList onSelect={handleSelectConversation} onNew={handleNewChat} />
            </ScrollArea>
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="px-4 pt-2">
              <TabsList className="w-full h-8">
                <TabsTrigger value="chat" className="flex-1 text-xs">Chat</TabsTrigger>
                <TabsTrigger value="blocked" className="flex-1 text-xs gap-1">
                  Blocked
                  {openBlockedCount > 0 && (
                    <Badge variant="destructive" className="h-4 min-w-[16px] px-1 text-[10px]">
                      {openBlockedCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Chat tab */}
            <TabsContent value="chat" className="mt-0 focus:outline-none">
              <div className="flex flex-col h-[420px]">
                {/* Circuit progress bar */}
                {isCircuitMode && circuitData && (
                  <div className="px-4 py-2 border-b">
                    <ProgressBar current={circuitData.currentStop} total={CIRCUIT_STOPS_COUNT} />
                    {circuitData.stopName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{circuitData.stopName}</p>
                    )}
                  </div>
                )}

                {/* Loading history state */}
                {isLoadingHistory ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {/* Messages */}
                    <ScrollArea className="flex-1 px-4 py-3" ref={scrollRef as any}>
                      {messages.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 pb-4">
                          <div className="text-center">
                            <p className="text-sm font-medium text-foreground">What do you need?</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Ask anything or run the Circuit for a full business review.
                            </p>
                          </div>

                          {/* Quick chips */}
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {QUICK_CHIPS.map((chip) => (
                              <button
                                key={chip}
                                disabled={isSending}
                                onClick={() => sendMessage(chip, false)}
                                className="text-xs px-2.5 py-1.5 rounded-full border border-border bg-background hover-elevate active-elevate-2 disabled:opacity-50 disabled:pointer-events-none"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>

                          <Separator />

                          {/* Circuit launch */}
                          <div className="w-full space-y-2">
                            <p className="text-xs text-muted-foreground text-center font-medium">
                              Run the Circuit — 9-stop business review
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 text-xs gap-1"
                                disabled={isSending}
                                onClick={() => startCircuit("quick")}
                              >
                                <Zap className="h-3.5 w-3.5" />
                                Quick check
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="flex-1 text-xs gap-1"
                                disabled={isSending}
                                onClick={() => startCircuit("full")}
                              >
                                <Bot className="h-3.5 w-3.5" />
                                Full circuit
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          {messages.map((m, i) => (
                            <MessageBubble key={i} role={m.role} content={m.content} />
                          ))}
                          {isSending && (
                            <div className="flex justify-start mb-3">
                              <div className="bg-muted rounded-lg px-3 py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              </div>
                            </div>
                          )}
                          {!isSending &&
                            isCircuitMode &&
                            (circuitData?.quickReplies?.length ?? 0) > 0 &&
                            messages[messages.length - 1]?.role === "assistant" && (
                              <QuickReplies
                                replies={circuitData!.quickReplies}
                                onSelect={(r) => sendMessage(r, isCircuitMode)}
                                disabled={isSending}
                              />
                            )}
                        </div>
                      )}
                    </ScrollArea>

                    {/* Input */}
                    <div className="border-t px-3 py-2">
                      <div className="flex items-end gap-2">
                        <Textarea
                          ref={textareaRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Ask anything…"
                          className="resize-none min-h-[38px] max-h-[100px] text-sm py-2"
                          rows={1}
                          disabled={isSending}
                        />
                        <Button
                          size="icon"
                          onClick={handleSend}
                          disabled={!input.trim() || isSending}
                          className="shrink-0"
                        >
                          {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Blocked items tab */}
            <TabsContent value="blocked" className="mt-0 focus:outline-none">
              <ScrollArea className="h-[420px] px-4 py-3">
                {blockedItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No blocked items</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {blockedItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg border p-3 text-sm ${item.resolvedAt ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            {item.resolvedAt ? (
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                            )}
                            <p className="text-sm leading-snug">{item.description}</p>
                          </div>
                          {!item.resolvedAt && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs shrink-0"
                              onClick={() => resolveBlockedItem.mutate(item.id)}
                              disabled={resolveBlockedItem.isPending}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 pl-6">
                          {item.resolvedAt
                            ? `Resolved ${new Date(item.resolvedAt).toLocaleDateString("en-AU")}`
                            : `Logged ${new Date(item.createdAt).toLocaleDateString("en-AU")}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
}
