import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import type { Message, Task, MessageReaction } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  isReconnecting: boolean;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendMessage: (channelId: string, content: string, mentions?: string[]) => void;
  startTyping: (channelId: string) => void;
  stopTyping: (channelId: string) => void;
  markAsRead: (channelId: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    // Guard against state updates after this effect is cleaned up.
    // Without this, rapid user-id changes or StrictMode double-invocations
    // can call setIsConnected on a stale closure, cascading into infinite loops.
    let active = true;

    const socketInstance = io({
      path: "/socket.io/",
      withCredentials: true
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected");
      if (active) {
        setIsConnected(true);
        setIsReconnecting(false);
      }
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket disconnected");
      if (active) setIsConnected(false);
    });

    socketInstance.on("reconnect_attempt", () => {
      if (active) setIsReconnecting(true);
    });

    socketInstance.on("reconnect", () => {
      if (active) setIsReconnecting(false);
    });

    socketInstance.on("reconnect_failed", () => {
      if (active) setIsReconnecting(false);
    });

    socketInstance.on("connect_error", (error: any) => {
      console.error("Socket connection error:", error.message);
      if (active) {
        setIsConnected(false);
        setIsReconnecting(true);
      }
    });

    socketInstance.on("error", (error: any) => {
      console.error("Socket error:", error);
    });

    setSocket(socketInstance);

    return () => {
      active = false;
      socketInstance.disconnect();
    };
  }, [user?.id]);

  // Stable references via useCallback so consumers' useEffects don't re-run
  // on every SocketProvider re-render (e.g. isConnected flip on connect/disconnect).
  const joinChannel = useCallback((channelId: string) => {
    socket?.emit("join_channel", channelId);
  }, [socket]);

  const leaveChannel = useCallback((channelId: string) => {
    socket?.emit("leave_channel", channelId);
  }, [socket]);

  const sendMessage = useCallback((channelId: string, content: string, mentions?: string[]) => {
    socket?.emit("send_message", { channelId, content, mentions: mentions || [] });
  }, [socket]);

  const startTyping = useCallback((channelId: string) => {
    socket?.emit("typing_start", channelId);
  }, [socket]);

  const stopTyping = useCallback((channelId: string) => {
    socket?.emit("typing_stop", channelId);
  }, [socket]);

  const markAsRead = useCallback((channelId: string) => {
    socket?.emit("mark_read", channelId);
  }, [socket]);

  const contextValue = useMemo(() => ({
    socket,
    isConnected,
    isReconnecting,
    joinChannel,
    leaveChannel,
    sendMessage,
    startTyping,
    stopTyping,
    markAsRead,
  }), [socket, isConnected, isReconnecting, joinChannel, leaveChannel, sendMessage, startTyping, stopTyping, markAsRead]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
}

// Hook for listening to new messages in a channel.
// Uses a ref for onMessage so the socket listener is only re-registered when
// `socket` or `channelId` changes — not when the caller's inline callback changes.
export function useChannelMessages(channelId: string | null, onMessage: (message: Message) => void) {
  const { socket } = useSocket();
  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => { onMessageRef.current = onMessage; });

  useEffect(() => {
    if (!socket || !channelId) return;

    const handleNewMessage = (message: Message) => {
      if (message.channelId === channelId) {
        onMessageRef.current(message);
      }
    };

    socket.on("new_message", handleNewMessage);

    return () => {
      socket.off("new_message", handleNewMessage);
    };
  }, [socket, channelId]);
}

// Hook for listening to ALL new messages (for unread badge updates).
// Same ref pattern — avoids re-registering listener on every render.
export function useAllNewMessages(onMessage: (message: Message) => void) {
  const { socket } = useSocket();
  const onMessageRef = useRef(onMessage);
  useLayoutEffect(() => { onMessageRef.current = onMessage; });

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: Message) => {
      onMessageRef.current(message);
    };

    socket.on("new_message", handleNewMessage);

    return () => {
      socket.off("new_message", handleNewMessage);
    };
  }, [socket]);
}

// Hook for typing indicators
export function useTypingIndicator(channelId: string | null) {
  const { socket } = useSocket();
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  // Clear typing users when channel changes
  useEffect(() => {
    setTypingUsers(new Set());
  }, [channelId]);

  useEffect(() => {
    if (!socket || !channelId) return;

    const timeoutHandles = new Map<string, NodeJS.Timeout>();

    const handleUserTyping = (data: { channelId: string; userId: string }) => {
      if (data.channelId === channelId) {
        setTypingUsers(prev => new Set(prev).add(data.userId));
        
        const existingTimeout = timeoutHandles.get(data.userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        const timeout = setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
          timeoutHandles.delete(data.userId);
        }, 3000);
        
        timeoutHandles.set(data.userId, timeout);
      }
    };

    const handleUserStoppedTyping = (data: { channelId: string; userId: string }) => {
      if (data.channelId === channelId) {
        const existingTimeout = timeoutHandles.get(data.userId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          timeoutHandles.delete(data.userId);
        }
        
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(data.userId);
          return next;
        });
      }
    };

    socket.on("user_typing", handleUserTyping);
    socket.on("user_stopped_typing", handleUserStoppedTyping);

    return () => {
      timeoutHandles.forEach(timeout => clearTimeout(timeout));
      timeoutHandles.clear();
      
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stopped_typing", handleUserStoppedTyping);
    };
  }, [socket, channelId]);

  return typingUsers;
}

interface TaskEventData {
  task?: Task;
  taskId?: string;
  createdBy?: string;
  updatedBy?: string;
  deletedBy?: string;
  timestamp: string;
}

interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  createdAt: string;
}

export function useTaskEvents() {
  const { socket } = useSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket) return;

    const handleTaskCreated = (data: TaskEventData) => {
      if (data.createdBy === user?.id) return;
      
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    };

    const handleTaskUpdated = (data: TaskEventData) => {
      if (data.updatedBy === user?.id) return;
      
      if (data.task?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", data.task.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    };

    const handleTaskDeleted = (data: TaskEventData) => {
      if (data.deletedBy === user?.id) return;
      
      if (data.taskId) {
        queryClient.removeQueries({ queryKey: ["/api/tasks", data.taskId] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    };

    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);

    return () => {
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
    };
  }, [socket, user?.id]);
}

export function useNotificationEvents(onNotification?: (notification: NotificationData) => void) {
  const { socket } = useSocket();
  const onNotificationRef = useRef(onNotification);
  useLayoutEffect(() => { onNotificationRef.current = onNotification; });

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification: NotificationData) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      onNotificationRef.current?.(notification);
    };

    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("notification:new", handleNewNotification);
    };
  }, [socket]);
}

export function TaskEventsListener({ children }: { children?: ReactNode }) {
  useTaskEvents();
  return <>{children}</>;
}

// Hook for real-time reaction updates (reaction_updated event)
export function useReactionUpdated(
  onUpdate: (messageId: string, reactions: MessageReaction[]) => void
) {
  const { socket } = useSocket();
  const onUpdateRef = useRef(onUpdate);
  useLayoutEffect(() => { onUpdateRef.current = onUpdate; });

  useEffect(() => {
    if (!socket) return;
    const handle = (data: { messageId: string; reactions: MessageReaction[] }) => {
      onUpdateRef.current(data.messageId, data.reactions);
    };
    socket.on("reaction_updated", handle);
    return () => { socket.off("reaction_updated", handle); };
  }, [socket]);
}

// Hook for message_updated events (e.g. threadCount changes after a reply)
export function useMessageUpdated(
  channelId: string | null,
  onUpdate: (message: Message) => void
) {
  const { socket } = useSocket();
  const onUpdateRef = useRef(onUpdate);
  useLayoutEffect(() => { onUpdateRef.current = onUpdate; });

  useEffect(() => {
    if (!socket || !channelId) return;
    const handle = (message: Message) => {
      if (message.channelId === channelId) {
        onUpdateRef.current(message);
      }
    };
    socket.on("message_updated", handle);
    return () => { socket.off("message_updated", handle); };
  }, [socket, channelId]);
}
