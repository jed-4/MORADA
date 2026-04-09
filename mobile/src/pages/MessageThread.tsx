import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MobileHeader } from "@/components/MobileHeader";
import { MobileButton } from "@/components/ui/MobileButton";
import { Send, Hash, Loader2 } from "lucide-react";
import { useAuth } from "@shared/useAuth";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@lib/queryClient";
import type { Channel, Message } from "@shared/schema";

interface Props {
  channelId: string;
}

export function MessageThread({ channelId }: Props) {
  const { user } = useAuth();
  const [messageText, setMessageText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: channel } = useQuery<Channel>({
    queryKey: ["/api/channels", channelId],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/channels", channelId, "messages"],
    refetchInterval: 5000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest(`/api/channels/${channelId}/messages`, "POST", { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels", channelId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const content = messageText.trim();
    if (!content || sendMessageMutation.isPending) return;
    setMessageText("");
    sendMessageMutation.mutate(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatMessageTime = (date: string | Date | null) => {
    if (!date) return "";
    return format(new Date(date), "h:mm a");
  };

  const channelName = channel?.name ?? "Thread";

  return (
    <div className="flex flex-col h-full">
      <MobileHeader
        title={channelName}
        showBack={true}
        showMore={false}
        showNotifications={false}
      />

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {messagesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Hash className="w-12 h-12 text-muted-foreground mb-3" />
            <h3 className="font-semibold mb-1">No messages yet</h3>
            <p className="text-sm text-muted-foreground">
              Send the first message to start the conversation
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.userId === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isOwn ? "items-end" : "items-start"}`}
                data-testid={`message-${msg.id}`}
              >
                {!isOwn && (
                  <span className="text-xs text-muted-foreground px-1">
                    {msg.userId}
                  </span>
                )}
                <div
                  className={`max-w-[80%] rounded-md px-3 py-2 text-sm ${
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="text-xs text-muted-foreground px-1">
                  {formatMessageTime(msg.createdAt)}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="border-t bg-card p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-md border bg-background text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ minHeight: "2.5rem", maxHeight: "8rem" }}
            data-testid="input-message"
          />
          <MobileButton
            size="icon"
            variant="default"
            onClick={handleSend}
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            data-testid="button-send-message"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </MobileButton>
        </div>
      </div>
    </div>
  );
}
