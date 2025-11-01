import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/hooks/use-auth";
import type { Message } from "@shared/schema";

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  sendMessage: (channelId: string, content: string) => void;
  startTyping: (channelId: string) => void;
  stopTyping: (channelId: string) => void;
  markAsRead: (channelId: string) => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    // Create socket connection - no need to send userId, it comes from session
    const socketInstance = io({
      path: "/socket.io/",
      withCredentials: true // Important: send cookies for session auth
    });

    socketInstance.on("connect", () => {
      console.log("Socket connected");
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket disconnected");
      setIsConnected(false);
    });

    socketInstance.on("connect_error", (error: any) => {
      console.error("Socket connection error:", error.message);
      setIsConnected(false);
    });

    socketInstance.on("error", (error: any) => {
      console.error("Socket error:", error);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user?.id]);

  const joinChannel = (channelId: string) => {
    socket?.emit("join_channel", channelId);
  };

  const leaveChannel = (channelId: string) => {
    socket?.emit("leave_channel", channelId);
  };

  const sendMessage = (channelId: string, content: string) => {
    socket?.emit("send_message", { channelId, content });
  };

  const startTyping = (channelId: string) => {
    socket?.emit("typing_start", channelId);
  };

  const stopTyping = (channelId: string) => {
    socket?.emit("typing_stop", channelId);
  };

  const markAsRead = (channelId: string) => {
    socket?.emit("mark_read", channelId);
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinChannel,
        leaveChannel,
        sendMessage,
        startTyping,
        stopTyping,
        markAsRead
      }}
    >
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

// Hook for listening to new messages in a channel
export function useChannelMessages(channelId: string | null, onMessage: (message: Message) => void) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !channelId) return;

    const handleNewMessage = (message: Message) => {
      if (message.channelId === channelId) {
        onMessage(message);
      }
    };

    socket.on("new_message", handleNewMessage);

    return () => {
      socket.off("new_message", handleNewMessage);
    };
  }, [socket, channelId, onMessage]);
}

// Hook for typing indicators
export function useTypingIndicator(channelId: string | null) {
  const { socket } = useSocket();
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!socket || !channelId) return;

    const handleUserTyping = (data: { channelId: string; userId: string }) => {
      if (data.channelId === channelId) {
        setTypingUsers(prev => new Set(prev).add(data.userId));
        
        // Auto-clear after 3 seconds
        setTimeout(() => {
          setTypingUsers(prev => {
            const next = new Set(prev);
            next.delete(data.userId);
            return next;
          });
        }, 3000);
      }
    };

    const handleUserStoppedTyping = (data: { channelId: string; userId: string }) => {
      if (data.channelId === channelId) {
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
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stopped_typing", handleUserStoppedTyping);
    };
  }, [socket, channelId]);

  return typingUsers;
}
