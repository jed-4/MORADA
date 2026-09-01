import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { WidgetProps } from "@/types/widgets";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MessageSquare, Send, AlertCircle, Paperclip } from "lucide-react";
import { useLocation } from "wouter";
import { format, isToday } from "date-fns";

interface ChannelRow {
  id: string;
  name: string;
  type: string; // "channel" | "dm"
}

interface MessageRow {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  isBot: boolean;
  userFirstName: string | null;
  userLastName: string | null;
  userEmail: string | null;
  createdAt: string;
  attachments?: Array<{ id: string }>;
}

function senderName(m: MessageRow): string {
  const name = `${m.userFirstName ?? ""} ${m.userLastName ?? ""}`.trim();
  return name || m.userEmail || "Someone";
}

function messageTime(createdAt: string): string {
  const d = new Date(createdAt);
  return isToday(d) ? format(d, "h:mm a") : format(d, "MMM d, h:mm a");
}

function initials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

export default function MessagesWidget({ widget, onUpdate, isConfiguring, onCloseConfig, onSetTitleAction }: WidgetProps) {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [messageText, setMessageText] = useState("");

  const channelId = (widget.config?.channelId as string) || null;

  // Config edits stage into a draft and persist on Save
  const [draft, setDraft] = useState<{ title: string; channelId: string | null } | null>(null);
  useEffect(() => {
    if (isConfiguring) setDraft({ title: widget.title, channelId });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfiguring]);

  // Channels for this project (used by the config picker and the empty state)
  const { data: channels = [] } = useQuery<ChannelRow[]>({
    queryKey: ["/api/channels", { projectId: currentProject?.id }],
    queryFn: async () => {
      if (!currentProject?.id) return [];
      const r = await fetch(`/api/channels?projectId=${currentProject.id}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!currentProject?.id,
  });

  const { data: messages = [], isLoading, isError, refetch } = useQuery<MessageRow[]>({
    queryKey: ["/api/channels", channelId, "messages"],
    queryFn: async () => {
      const r = await fetch(`/api/channels/${channelId}/messages?limit=30`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
    enabled: !!channelId,
    refetchInterval: 30_000,
  });

  // Chat convention: latest at the bottom, keep the view pinned there
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, channelId]);

  const sendMutation = useMutation({
    mutationFn: async (content: string) =>
      apiRequest(`/api/channels/${channelId}/messages`, "POST", { content }),
    onMutate: async (content: string) => {
      const key = ["/api/channels", channelId, "messages"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MessageRow[]>(key);
      const optimistic: MessageRow = {
        id: `temp-${Math.random().toString(36).slice(2)}`,
        channelId: channelId!,
        userId: (user as any)?.id ?? "",
        content,
        isBot: false,
        userFirstName: (user as any)?.firstName ?? null,
        userLastName: (user as any)?.lastName ?? null,
        userEmail: (user as any)?.email ?? null,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<MessageRow[]>(key, old => [...(old || []), optimistic]);
      return { previous, key };
    },
    onError: (_e, _c, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", channelId, "messages"] });
    },
  });

  const handleSend = () => {
    const content = messageText.trim();
    if (!content || !channelId || sendMutation.isPending) return;
    setMessageText("");
    sendMutation.mutate(content);
  };

  // The title itself is the way through to the full page.
  useEffect(() => {
    onSetTitleAction?.(currentProject ? { label: "All messages", onClick: () => navigate(`/projects/${currentProject.id}/messages`) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.id]);

  if (isConfiguring && draft) {
    const cancelConfig = () => { setDraft(null); onCloseConfig?.(); };
    const saveConfig = () => {
      onUpdate?.({
        ...widget,
        title: draft.title.trim() || widget.title,
        config: { ...widget.config, channelId: draft.channelId },
      });
      setDraft(null);
      onCloseConfig?.();
    };

    return (
      <div className="flex-1 overflow-y-auto p-1 space-y-5 text-[12px]" data-testid="messages-widget-config">
        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Widget title
          </p>
          <Input
            value={draft.title}
            onChange={e => setDraft(prev => prev && { ...prev, title: e.target.value })}
            className="h-8 text-xs"
            placeholder="Widget title"
          />
        </section>

        <section>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Chat
          </p>
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">No chats on this project yet.</p>
          ) : (
            <Select
              value={draft.channelId ?? ""}
              onValueChange={v => setDraft(prev => prev && { ...prev, channelId: v })}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="messages-config-channel">
                <SelectValue placeholder="Choose a chat..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.type === "dm" ? c.name : `# ${c.name}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </section>

        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={cancelConfig} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button size="sm" onClick={saveConfig} className="h-7 px-3 text-xs" data-testid="messages-config-save">
            Save
          </Button>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        Select a project to view messages
      </div>
    );
  }

  if (!channelId) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-1">
        <MessageSquare className="h-6 w-6 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">No chat selected</p>
        <p className="text-xs text-muted-foreground">Choose one in the widget settings</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-1">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse flex gap-2">
            <div className="h-6 w-6 bg-muted rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 bg-muted rounded w-1/3" />
              <div className="h-3.5 bg-muted rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
        <AlertCircle className="h-4 w-4 text-destructive" />
        Couldn't load messages
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-1 py-6">
            <MessageSquare className="h-6 w-6 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Say hello below</p>
          </div>
        ) : (
          messages.map(m => {
            const name = senderName(m);
            return (
              <div key={m.id} className="flex gap-2" data-testid={`message-${m.id}`}>
                <Avatar className="h-6 w-6 flex-shrink-0 mt-0.5">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {initials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold truncate">{name}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {messageTime(m.createdAt)}
                    </span>
                  </div>
                  <p className={`text-sm leading-snug whitespace-pre-wrap break-words ${m.isBot ? "italic text-muted-foreground" : ""}`}>
                    {m.content}
                  </p>
                  {m.attachments && m.attachments.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground mt-0.5">
                      <Paperclip className="h-2.5 w-2.5" />
                      {m.attachments.length} attachment{m.attachments.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Input
          value={messageText}
          onChange={e => setMessageText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Message..."
          className="h-8 text-sm"
          data-testid="messages-widget-input"
        />
        <Button
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={handleSend}
          disabled={!messageText.trim() || sendMutation.isPending}
          data-testid="messages-widget-send"
          aria-label="Send message"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
