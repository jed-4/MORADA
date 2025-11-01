import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { storage } from "../storage";
import type { InsertMessage, Message } from "@shared/schema";
import type { Request } from "express";

export function setupMessagingSocket(httpServer: HttpServer, sessionMiddleware: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" 
        ? process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : false
        : "http://localhost:5000",
      credentials: true
    },
    path: "/socket.io/"
  });

  // Wrap Express session middleware for Socket.io
  io.engine.use(sessionMiddleware);

  // Middleware to authenticate socket connections using Express session
  io.use(async (socket: Socket, next) => {
    try {
      const req = socket.request as any;
      const session = req.session;
      
      // Verify session exists and has a userId
      if (!session || !session.userId) {
        return next(new Error("Authentication required - no valid session"));
      }
      
      // Get user from database to verify they exist and get companyId
      const user = await storage.getUser(session.userId);
      if (!user || !user.companyId) {
        return next(new Error("User not found or has no company"));
      }
      
      // Store authenticated user info in socket data
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

    // Join channel rooms
    socket.on("join_channel", async (channelId: string) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        
        // Verify channel belongs to user's company
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }
        
        // Verify user is a member of the channel
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some(m => m.userId === userId);
        
        if (!isMember) {
          socket.emit("error", { message: "Not a member of this channel" });
          return;
        }

        socket.join(`channel:${channelId}`);
        console.log(`User ${userId} joined channel ${channelId}`);
        
        // Notify other members that user joined
        socket.to(`channel:${channelId}`).emit("user_joined", {
          channelId,
          userId
        });
      } catch (error) {
        console.error("Error joining channel:", error);
        socket.emit("error", { message: "Failed to join channel" });
      }
    });

    // Leave channel rooms
    socket.on("leave_channel", (channelId: string) => {
      socket.leave(`channel:${channelId}`);
      console.log(`User ${socket.data.userId} left channel ${channelId}`);
      
      // Notify other members that user left
      socket.to(`channel:${channelId}`).emit("user_left", {
        channelId,
        userId: socket.data.userId
      });
    });

    // Send message
    socket.on("send_message", async (data: { channelId: string; content: string; mentions?: string[] }) => {
      try {
        const { channelId, content, mentions } = data;
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;

        // Verify channel belongs to user's company
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }

        // Verify user is a member of the channel
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some(m => m.userId === userId);
        
        if (!isMember) {
          socket.emit("error", { message: "Not authorized to send messages to this channel" });
          return;
        }

        // Create message in database with mentions
        const message = await storage.createMessage({
          channelId,
          userId,
          content,
          mentions: mentions || []
        });

        // Broadcast to all users in the channel (including sender)
        io.to(`channel:${channelId}`).emit("new_message", message);
        
        // Update last read for sender
        await storage.updateChannelMemberLastRead(channelId, userId);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    // Typing indicator
    socket.on("typing_start", async (channelId: string) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        
        // Verify channel belongs to user's company and user is a member
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) return; // Silently fail
        
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some(m => m.userId === userId);
        if (!isMember) return; // Silently fail
        
        socket.to(`channel:${channelId}`).emit("user_typing", {
          channelId,
          userId
        });
      } catch (error) {
        // Silently fail for typing indicators
      }
    });

    socket.on("typing_stop", async (channelId: string) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        
        // Verify channel belongs to user's company and user is a member
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) return; // Silently fail
        
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some(m => m.userId === userId);
        if (!isMember) return; // Silently fail
        
        socket.to(`channel:${channelId}`).emit("user_stopped_typing", {
          channelId,
          userId
        });
      } catch (error) {
        // Silently fail for typing indicators
      }
    });

    // Mark messages as read
    socket.on("mark_read", async (channelId: string) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        
        // Verify channel belongs to user's company
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }
        
        // Verify user is a member
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some(m => m.userId === userId);
        
        if (!isMember) {
          return; // Silently fail for read updates
        }
        
        await storage.updateChannelMemberLastRead(channelId, userId);
        
        // Notify other users about read status
        socket.to(`channel:${channelId}`).emit("messages_read", {
          channelId,
          userId
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.userId}`);
    });
  });

  return io;
}
