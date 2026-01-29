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
