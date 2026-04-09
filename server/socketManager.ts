import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { storage } from "./storage";
import type { Task } from "@shared/schema";

let io: SocketIOServer | null = null;

// Company-level connected user registry: companyId -> (userId -> Set<socketId>)
// Tracks all socket IDs per user so that multi-tab/multi-device sessions are handled
// correctly — a user is only considered "offline" when ALL their sockets disconnect.
const connectedByCompany = new Map<string, Map<string, Set<string>>>();

function addConnectedUser(companyId: string, userId: string, socketId: string): void {
  if (!connectedByCompany.has(companyId)) connectedByCompany.set(companyId, new Map());
  const users = connectedByCompany.get(companyId)!;
  if (!users.has(userId)) users.set(userId, new Set());
  users.get(userId)!.add(socketId);
}

function removeConnectedUser(companyId: string, userId: string, socketId: string): void {
  const users = connectedByCompany.get(companyId);
  if (!users) return;
  const sockets = users.get(userId);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) users.delete(userId);
}

export function initializeSocketManager(httpServer: HttpServer, sessionMiddleware: any): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" 
        ? true
        : "http://localhost:5000",
      credentials: true
    },
    path: "/socket.io/"
  });

  io.engine.use(sessionMiddleware);

  io.use(async (socket: Socket, next) => {
    try {
      const req = socket.request as any;
      const session = req.session;
      
      if (!session || !session.userId) {
        return next(new Error("Authentication required - no valid session"));
      }
      
      const user = await storage.getUser(session.userId);
      if (!user || !user.companyId) {
        return next(new Error("User not found or has no company"));
      }
      
      socket.data.userId = user.id;
      socket.data.companyId = user.companyId;
      
      next();
    } catch (error) {
      console.error("Socket authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    
    socket.join(`company:${socket.data.companyId}`);
    socket.join(`user:${socket.data.userId}`);
    console.log(`User ${socket.data.userId} joined company room: company:${socket.data.companyId}`);
    addConnectedUser(socket.data.companyId, socket.data.userId, socket.id);

    // Auto-join all channel rooms this user is a member of on connect so that
    // new_message events arrive even when the client is not on the Messages page.
    try {
      const userChannels = await storage.getChannels(socket.data.companyId, socket.data.userId);
      for (const ch of userChannels) {
        socket.join(`channel:${ch.id}`);
      }
    } catch {
      // Non-fatal — explicit join_channel calls are still available as fallback
    }

    // Channel room management — clients join/leave rooms so REST-posted messages
    // can be broadcast to all members of a channel in real-time.
    // Access control: verify the channel belongs to the user's company AND the
    // user is a member of the channel before allowing them into the socket room.
    socket.on("join_channel", async (channelId: string) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;

        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }

        const members = await storage.getChannelMembers(channelId);
        if (!members.some(m => m.userId === userId)) {
          socket.emit("error", { message: "Not a member of this channel" });
          return;
        }

        socket.join(`channel:${channelId}`);
      } catch {
        socket.emit("error", { message: "Failed to join channel" });
      }
    });

    socket.on("leave_channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Typing indicators — broadcast to everyone else in the channel room.
    // Guard: only emit if the socket is already in the channel room, which
    // can only happen after passing the membership checks in join_channel.
    // This prevents a crafted socket from spoofing typing events to channels
    // they never successfully joined (no extra DB round-trip required).
    socket.on("typing_start", (channelId: string) => {
      if (!socket.rooms.has(`channel:${channelId}`)) return;
      socket.to(`channel:${channelId}`).emit("user_typing", {
        channelId,
        userId: socket.data.userId,
      });
    });

    socket.on("typing_stop", (channelId: string) => {
      if (!socket.rooms.has(`channel:${channelId}`)) return;
      socket.to(`channel:${channelId}`).emit("user_stopped_typing", {
        channelId,
        userId: socket.data.userId,
      });
    });

    // Mark read — update last-read timestamp for this user/channel.
    // Room membership (established via join_channel) is the authz boundary.
    socket.on("mark_read", async (channelId: string) => {
      try {
        await storage.updateChannelMemberLastRead(channelId, socket.data.userId);
      } catch {
        // Non-critical — silently ignore
      }
    });

    // send_message — fallback socket-based send; saves and broadcasts to channel room.
    // Verifies channel membership before creating the message.
    socket.on("send_message", async (data: { channelId: string; content: string; mentions?: string[] }) => {
      try {
        const { channelId, content, mentions = [] } = data;
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;

        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) return;

        const members = await storage.getChannelMembers(channelId);
        if (!members.some(m => m.userId === userId)) return;

        const hasCommand = content.startsWith("/");
        const commandType = hasCommand ? content.split(" ")[0].substring(1) : undefined;

        const message = await storage.createMessage({
          channelId,
          userId,
          content,
          mentions,
          hasCommand,
          commandType,
        });

        io!.to(`channel:${channelId}`).emit("new_message", message);
      } catch {
        // Non-critical
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.userId}`);
      removeConnectedUser(socket.data.companyId, socket.data.userId, socket.id);
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

export function emitTaskCreated(companyId: string, task: Task, createdByUserId: string) {
  if (!io) return;
  io.to(`company:${companyId}`).emit("task:created", {
    task,
    createdBy: createdByUserId,
    timestamp: new Date().toISOString()
  });
}

export function emitTaskUpdated(companyId: string, task: Task, updatedByUserId: string) {
  if (!io) return;
  io.to(`company:${companyId}`).emit("task:updated", {
    task,
    updatedBy: updatedByUserId,
    timestamp: new Date().toISOString()
  });
}

export function emitTaskDeleted(companyId: string, taskId: string, deletedByUserId: string) {
  if (!io) return;
  io.to(`company:${companyId}`).emit("task:deleted", {
    taskId,
    deletedBy: deletedByUserId,
    timestamp: new Date().toISOString()
  });
}

export function emitNotification(userId: string, notification: any) {
  if (!io) return;
  io.to(`user:${userId}`).emit("notification:new", notification);
}

export function emitReactionUpdated(channelId: string, messageId: string, reactions: any[]) {
  if (!io) return;
  io.to(`channel:${channelId}`).emit("reaction_updated", { messageId, reactions });
}

// Returns the user IDs of all currently connected users within a company.
// Used for @here mention targeting: connected users intersected with channel membership
// gives the set of online members to notify.
// Multi-socket safe: a user is only included while at least one socket remains connected.
export function getConnectedUserIdsForCompany(companyId: string): string[] {
  const users = connectedByCompany.get(companyId);
  if (!users) return [];
  return [...users.keys()];
}
