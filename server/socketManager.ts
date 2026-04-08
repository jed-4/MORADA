import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import { storage } from "./storage";
import type { Task } from "@shared/schema";

let io: SocketIOServer | null = null;

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

  io.on("connection", (socket: Socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    
    socket.join(`company:${socket.data.companyId}`);
    socket.join(`user:${socket.data.userId}`);
    console.log(`User ${socket.data.userId} joined company room: company:${socket.data.companyId}`);

    // Channel room management — clients join/leave rooms so REST-posted messages
    // can be broadcast to all members of a channel in real-time
    socket.on("join_channel", (channelId: string) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on("leave_channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Typing indicators — broadcast to everyone else in the channel room
    socket.on("typing_start", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user_typing", {
        channelId,
        userId: socket.data.userId,
      });
    });

    socket.on("typing_stop", (channelId: string) => {
      socket.to(`channel:${channelId}`).emit("user_stopped_typing", {
        channelId,
        userId: socket.data.userId,
      });
    });

    // Mark read — update last-read timestamp for this user/channel
    socket.on("mark_read", async (channelId: string) => {
      try {
        await storage.updateChannelMemberLastRead(channelId, socket.data.userId);
      } catch {
        // Non-critical — silently ignore
      }
    });

    // send_message — fallback socket-based send; saves and broadcasts to channel room
    socket.on("send_message", async (data: { channelId: string; content: string; mentions?: string[] }) => {
      try {
        const { channelId, content, mentions = [] } = data;
        const hasCommand = content.startsWith("/");
        const commandType = hasCommand ? content.split(" ")[0].substring(1) : undefined;

        const message = await storage.createMessage({
          channelId,
          userId: socket.data.userId,
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
