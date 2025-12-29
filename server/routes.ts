import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import { google } from "googleapis";
import { randomBytes, randomUUID } from "crypto";
import { setupAuth, isAuthenticated, sessionMiddleware, ensureLegacySessionFields } from "./auth";
import { sendInvitationEmail, initializeEmailServices } from "./utils/email";
import { GoogleOAuthService } from "./services/googleOAuthService";
import { 
  insertNoteSchema,
  insertTaskSchema,
  insertCustomFieldDefSchema,
  insertCustomFieldOptionSchema,
  insertNoteTemplateSchema,
  insertNoteTemplateFieldSchema,
  insertProjectSchema,
  insertTaskViewSchema,
  insertEstimateSchema,
  insertEstimateItemSchema,
  insertEstimateGroupSchema,
  insertCostCategorySchema,
  insertCostCodeSchema,
  insertUserSchema,
  insertUserRoleSchema,
  insertPermissionSchema,
  insertRolePermissionSchema,
  insertUserProjectAccessSchema,
  insertUserInvitationSchema,
  insertUserColumnPreferencesSchema,
  insertUserViewPreferencesSchema,
  insertCompanySettingsSchema,
  insertSystemConfigurationSchema,
  insertFieldCategorySchema,
  insertFieldOptionSchema,
  insertSelectionSchema,
  insertSelectionOptionSchema,
  insertOptionAttachmentSchema,
  insertClientSelectionSchema,
  insertSupplierSchema,
  insertSupplierLabelSchema,
  insertSupplierInsuranceSchema,
  insertSupplierContactSchema,
  insertContactSchema,
  insertContactInsuranceSchema,
  insertBillSchema,
  insertBillLineItemSchema,
  insertBillApprovalSchema,
  insertBillLineItemAllowanceSchema,
  insertVariationSchema,
  insertVariationItemSchema,
  insertClientInvoiceSchema,
  insertClientInvoiceItemSchema,
  insertClientInvoicePaymentSchema,
  insertInvoiceEstimateSchema,
  insertProposalSchema,
  insertProposalSectionSchema,
  insertProposalItemSchema,
  insertProposalAcceptanceSchema,
  insertInvoiceVariationSchema,
  insertInvoiceBillSchema,
  insertSiteDiaryTemplateSchema,
  insertSiteDiaryEntrySchema,
  insertActivitySchema,
  insertChecklistTemplateSchema,
  insertChecklistTemplateGroupSchema,
  insertChecklistTemplateItemSchema,
  insertChecklistInstanceSchema,
  insertChecklistInstanceGroupSchema,
  insertChecklistInstanceItemSchema,
  updateBudgetSchema,
  updateBudgetLineItemSchema,
  insertScheduleSchema,
  updateScheduleSchema,
  insertScheduleItemSchema,
  updateScheduleItemSchema,
  insertScheduleTemplateSchema,
  updateScheduleTemplateSchema,
  insertEstimateTemplateSchema,
  updateEstimateTemplateSchema,
  insertSelectionTemplateSchema,
  updateSelectionTemplateSchema,
  insertActivityNoteSchema,
  insertCalendarViewSchema,
  insertTimesheetAllowanceSchema,
  insertAllowanceItemSchema,
  insertDefectSchema,
  insertMinuteSchema,
  insertSystemFolderSchema,
  insertSystemDocumentSchema,
  insertTaskTemplateSchema,
  insertTaskTagSchema,
  insertTaskTemplateStatusSchema,
  insertWorkflowTemplateSchema,
  insertProjectWorkflowSchema,
  insertChannelSchema,
  insertChannelMemberSchema,
  insertMessageSchema,
  insertRfqSchema,
  insertRfqItemSchema,
  insertRfqQuoteSchema,
  insertRfqFollowUpSchema,
  insertRfiSchema,
  insertScopeItemSchema,
  insertScopeStageSchema,
  insertScopeTemplateSchema,
  insertScopeGearPhotoSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertPurchaseOrderAttachmentSchema,
  insertPurchaseOrderSignatureSchema,
  insertPurchaseOrderTemplateSchema,
  insertFavoriteSupplierSchema,
  insertFavoriteCostCodeSchema,
  insertBusinessReminderSchema,
  insertReminderSchema,
  insertReminderNotificationSchema,
  insertRfqTemplateSchema,
  insertRfiTemplateSchema,
  insertTemplateCategorySchema,
  insertDashboardViewSchema,
  insertPaymentTermsOptionSchema,
  insertPinnedItemSchema,
  pinnedItems
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { eq, and, asc } from "drizzle-orm";
import { PasswordUtils } from "./utils/auth";
import { requireAuth, requireAdmin, requireTeamMember, requirePermission, toSafeUser } from "./middleware/auth";
import multer from "multer";
import { setupMessagingSocket } from "./messaging/socket";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth - see blueprint:javascript_log_in_with_replit
  await setupAuth(app);
  
  // Initialize email services with Gmail support
  try {
    const googleOAuthService = new GoogleOAuthService(storage);
    initializeEmailServices(storage, googleOAuthService);
  } catch (error) {
    console.warn('⚠️ Gmail email service not initialized - Google OAuth may not be configured');
  }
  
  // Compatibility bridge: sync Passport user to legacy session fields
  // This allows old routes checking req.session.userId to work with Replit Auth
  app.use('/api', ensureLegacySessionFields);
  
  // put application routes here
  // prefix all routes with /api

  // Global authentication middleware - protect all API routes
  app.use('/api', async (req, res, next) => {
    const path = req.path;
    
    // PUBLIC ENDPOINTS - Always allow these
    // Auth endpoints (register, login, logout, get user)
    if (path.startsWith('/auth/')) {
      return next();
    }
    
    // Public invitation endpoints
    if (/^\/invitations\/by-token\/[^/]+$/.test(path) || /^\/invitations\/[^/]+\/accept$/.test(path)) {
      return next();
    }
    
    // Public RFQ portal endpoints (suppliers submitting quotes)
    if (path.startsWith('/portal/')) {
      return next();
    }

    // DEVELOPMENT-ONLY BYPASSES - Inject dev user when not authenticated
    if (process.env.NODE_ENV === 'development') {
      // If user is already authenticated, use their data
      if (req.user && (req.user as any).dbUser) {
        return next();
      }
      
      // Inject dev user from session or look up from database
      try {
        // Try to get the user from session first
        const sessionUserId = (req.session as any)?.userId;
        let dbUser = null;
        
        if (sessionUserId) {
          dbUser = await storage.getUser(sessionUserId);
        }
        
        // If no session user, try to find a user by email (for mobile app testing)
        if (!dbUser) {
          const devEmail = process.env.DEV_USER_EMAIL || 'jed@lighthouseprojects.com.au';
          dbUser = await storage.getUserByEmail(devEmail);
        }
        
        if (dbUser) {
          // Inject the dev user into request
          (req as any).user = {
            id: dbUser.replitId || dbUser.id,
            email: dbUser.email,
            companyId: dbUser.companyId,
            roleId: dbUser.roleId,
            dbUser: dbUser,
            expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          };
          
          // Also populate legacy session fields
          (req.session as any).userId = dbUser.id;
          (req.session as any).companyId = dbUser.companyId;
          (req.session as any).roleId = dbUser.roleId;
        }
      } catch (error) {
        console.error('[Dev Auth] Failed to inject dev user:', error);
      }
      
      return next();
    }
    
    // PRODUCTION - Require authentication for all other routes
    return requireAuth(req, res, next);
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Notes API Routes
  app.get("/api/notes", async (req, res) => {
    try {
      const { projectId } = req.query;
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Handle "null" string to indicate business/company-wide notes
      const effectiveProjectId = projectId === "null" ? null : projectId as string | undefined;
      
      // Pass userId to also include notes assigned to the current user
      const notes = await storage.getNotes(effectiveProjectId, companyId, user?.id);
      res.json(notes);
    } catch (error) {
      console.error("[Notes API] Error fetching notes:", error);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.get("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const note = await storage.getNote(req.params.id, companyId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch note" });
    }
  });

  app.post("/api/notes", async (req, res) => {
    try {
      const validationResult = insertNoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Automatically set owner and company from authenticated user
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      const noteData = {
        ...validationResult.data,
        companyId,
        ownerId: user?.id,
        ownerName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : user?.email || 'Unknown User',
        author: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : user?.email || 'Unknown User', // Legacy field
      };

      const note = await storage.createNote(noteData);
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.patch("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const updateSchema = insertNoteSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Verify the note belongs to the user's company before updating
      const currentNote = await storage.getNote(req.params.id, companyId);
      if (!currentNote) {
        return res.status(404).json({ error: "Note not found" });
      }

      // Check if trying to pin a note
      if (validationResult.data.pinned === true) {
        // Count currently pinned notes for this project (excluding the note being updated)
        const allNotes = await storage.getNotes(currentNote.projectId || undefined, companyId, user?.id);
        const pinnedCount = allNotes.filter(n => n.pinned && n.id !== req.params.id).length;
        
        if (pinnedCount >= 3) {
          return res.status(400).json({ 
            error: "Maximum pinned notes reached",
            message: "You can only pin up to 3 notes at a time. Unpin another note first."
          });
        }
      }

      const note = await storage.updateNote(req.params.id, validationResult.data);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      res.json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to update note" });
    }
  });

  app.delete("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify the note belongs to the user's company before deleting
      const note = await storage.getNote(req.params.id, companyId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      const success = await storage.deleteNote(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Note not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Archive/Unarchive Notes
  app.post("/api/notes/:id/archive", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify the note belongs to the user's company
      const note = await storage.getNote(req.params.id, companyId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      const archivedNote = await storage.archiveNote(req.params.id, user.id);
      if (!archivedNote) {
        return res.status(500).json({ error: "Failed to archive note" });
      }
      
      res.json(archivedNote);
    } catch (error) {
      console.error("Error archiving note:", error);
      res.status(500).json({ error: "Failed to archive note" });
    }
  });

  app.post("/api/notes/:id/unarchive", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify the note belongs to the user's company
      const note = await storage.getNote(req.params.id, companyId);
      if (!note) {
        return res.status(404).json({ error: "Note not found" });
      }
      
      const unarchivedNote = await storage.unarchiveNote(req.params.id);
      if (!unarchivedNote) {
        return res.status(500).json({ error: "Failed to unarchive note" });
      }
      
      res.json(unarchivedNote);
    } catch (error) {
      console.error("Error unarchiving note:", error);
      res.status(500).json({ error: "Failed to unarchive note" });
    }
  });

  // Note Groups API Routes
  app.get("/api/note-groups", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { projectId } = req.query;
      const groups = await storage.getNoteGroups(
        companyId, 
        projectId === 'null' ? null : (projectId as string | undefined)
      );
      res.json(groups);
    } catch (error) {
      console.error("Error fetching note groups:", error);
      res.status(500).json({ error: "Failed to fetch note groups" });
    }
  });

  app.get("/api/note-groups/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const group = await storage.getNoteGroup(req.params.id, companyId);
      if (!group) {
        return res.status(404).json({ error: "Note group not found" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error fetching note group:", error);
      res.status(500).json({ error: "Failed to fetch note group" });
    }
  });

  app.post("/api/note-groups", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { name, description, projectId, sortOrder } = req.body;
      
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Group name is required" });
      }
      
      const group = await storage.createNoteGroup({
        companyId,
        name: name.trim(),
        description: description || null,
        projectId: projectId || null,
        sortOrder: sortOrder || 0,
        createdById: user.id,
      });
      
      res.status(201).json(group);
    } catch (error) {
      console.error("Error creating note group:", error);
      res.status(500).json({ error: "Failed to create note group" });
    }
  });

  app.patch("/api/note-groups/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const group = await storage.updateNoteGroup(req.params.id, req.body, companyId);
      if (!group) {
        return res.status(404).json({ error: "Note group not found" });
      }
      res.json(group);
    } catch (error) {
      console.error("Error updating note group:", error);
      res.status(500).json({ error: "Failed to update note group" });
    }
  });

  app.delete("/api/note-groups/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const success = await storage.deleteNoteGroup(req.params.id, companyId);
      if (!success) {
        return res.status(404).json({ error: "Note group not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting note group:", error);
      res.status(500).json({ error: "Failed to delete note group" });
    }
  });

  app.post("/api/note-groups/reorder", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { projectId, groupIds } = req.body;
      
      if (!Array.isArray(groupIds)) {
        return res.status(400).json({ error: "groupIds must be an array" });
      }
      
      const groups = await storage.reorderNoteGroups(companyId, projectId || null, groupIds);
      res.json(groups);
    } catch (error) {
      console.error("Error reordering note groups:", error);
      res.status(500).json({ error: "Failed to reorder note groups" });
    }
  });

  // User Personal Notes - scoped to specific user's private notes
  app.get("/api/users/:userId/notes", async (req, res) => {
    try {
      const currentUser = req.user as any;
      const targetUserId = req.params.userId;
      const companyId = currentUser?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Security: Only allow users to view their own personal notes
      // Admins with appropriate permissions could be added here
      // Use String() to handle type mismatch (currentUser.id is number, targetUserId is string)
      if (String(currentUser.id) !== String(targetUserId)) {
        return res.status(403).json({ error: "Forbidden - cannot access other users' personal notes" });
      }
      
      // Get personal notes for this user only
      const notes = await storage.getPersonalNotesByUser(targetUserId, companyId);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching personal notes:", error);
      res.status(500).json({ error: "Failed to fetch personal notes" });
    }
  });

  // Tasks API Routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const { projectId, status, businessTasks, assigneeId } = req.query;
      const tasks = await storage.getTasks(
        projectId as string | undefined,
        status as string | undefined,
        businessTasks === 'true',
        assigneeId as string | undefined
      );
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  // Get all tasks for the current user across all projects
  app.get("/api/tasks/user", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const tasks = await storage.getTasksByUser(user.id, user.companyId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user tasks" });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });

  app.post("/api/tasks", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // Preprocess: remove empty/null date/time fields to avoid validation errors
      const body = { ...req.body };
      if (body.dueDate === "" || body.dueDate === null) delete body.dueDate;
      if (body.startTime === "" || body.startTime === null) delete body.startTime;
      if (body.endTime === "" || body.endTime === null) delete body.endTime;

      console.log("[POST /api/tasks] Request body:", JSON.stringify(body, null, 2));
      const validationResult = insertTaskSchema.safeParse(body);
      if (!validationResult.success) {
        console.log("[POST /api/tasks] Validation error:", validationResult.error);
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Set polymorphic task context based on projectId or explicit context fields
      let taskContextType = validationResult.data.taskContextType;
      let taskContextId = validationResult.data.taskContextId;
      
      // Auto-derive context if not explicitly provided
      if (!taskContextType) {
        if (validationResult.data.projectId) {
          taskContextType = "project";
          taskContextId = validationResult.data.projectId;
        } else {
          // Default to business context for company-wide tasks
          taskContextType = "business";
          taskContextId = user.companyId;
        }
      }

      const task = await storage.createTask({
        ...validationResult.data,
        companyId: user.companyId,
        ownerId: user.id,
        ownerName: user.email,
        author: user.email,
        content: validationResult.data.content || "",
        taskContextType,
        taskContextId
      });
      res.status(201).json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // First, verify the task exists and belongs to the user's company
      const existingTask = await storage.getTask(req.params.id);
      if (!existingTask) {
        return res.status(404).json({ error: "Task not found" });
      }
      if (existingTask.companyId !== user.companyId) {
        return res.status(403).json({ error: "Forbidden - task belongs to another company" });
      }

      // Preprocess: remove empty/null date/time fields to avoid validation errors
      const body = { ...req.body };
      if (body.dueDate === "" || body.dueDate === null) delete body.dueDate;
      if (body.startTime === "" || body.startTime === null) delete body.startTime;
      if (body.endTime === "" || body.endTime === null) delete body.endTime;

      const updateSchema = insertTaskSchema.partial();
      const validationResult = updateSchema.safeParse(body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const task = await storage.updateTask(req.params.id, validationResult.data);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Asana-style: Create next week's task when transitioning to 'done' (not already done)
      // Use the freshly updated task (not pre-update snapshot) to preserve per-user assignee
      const wasNotDone = existingTask.status !== 'done';
      const nowDone = task.status === 'done';
      if (wasNotDone && nowDone && task.templateId && task.dueDate) {
        try {
          await storage.createNextRecurringTask(task as any, user.companyId);
        } catch (err) {
          console.error("Failed to create next recurring task:", err);
        }
      }

      res.json(task);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Failed to update task" });
    }
  });

  app.patch("/api/tasks/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!status || !["todo", "in-progress", "done"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const task = await storage.updateTaskStatus(req.params.id, status);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task status" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      const success = await storage.deleteTask(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task" });
    }
  });

  // Defects API Routes
  app.get("/api/defects", async (req, res) => {
    try {
      const { projectId } = req.query;
      const defects = await storage.getDefects(projectId as string | undefined);
      res.json(defects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defects" });
    }
  });

  app.get("/api/defects/:id", async (req, res) => {
    try {
      const defect = await storage.getDefectById(req.params.id);
      if (!defect) {
        return res.status(404).json({ error: "Defect not found" });
      }
      res.json(defect);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defect" });
    }
  });

  app.post("/api/defects", async (req, res) => {
    try {
      const validationResult = insertDefectSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const defect = await storage.createDefect(validationResult.data);
      res.status(201).json(defect);
    } catch (error) {
      res.status(500).json({ error: "Failed to create defect" });
    }
  });

  app.patch("/api/defects/:id", async (req, res) => {
    try {
      const updateSchema = insertDefectSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const defect = await storage.updateDefect(req.params.id, validationResult.data);
      if (!defect) {
        return res.status(404).json({ error: "Defect not found" });
      }
      res.json(defect);
    } catch (error) {
      res.status(500).json({ error: "Failed to update defect" });
    }
  });

  app.delete("/api/defects/:id", async (req, res) => {
    try {
      await storage.deleteDefect(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete defect" });
    }
  });

  // Minutes API Routes
  app.get("/api/minutes", async (req, res) => {
    try {
      const { projectId } = req.query;
      const minutes = await storage.getMinutes(projectId as string | undefined);
      res.json(minutes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch minutes" });
    }
  });

  app.get("/api/minutes/:id", async (req, res) => {
    try {
      const minute = await storage.getMinute(req.params.id);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }
      res.json(minute);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch minute" });
    }
  });

  app.post("/api/minutes", async (req, res) => {
    try {
      const validationResult = insertMinuteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const minute = await storage.createMinute(validationResult.data);
      res.status(201).json(minute);
    } catch (error) {
      res.status(500).json({ error: "Failed to create minute" });
    }
  });

  app.patch("/api/minutes/:id", async (req, res) => {
    try {
      const updateSchema = insertMinuteSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const minute = await storage.updateMinute(req.params.id, validationResult.data);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }
      res.json(minute);
    } catch (error) {
      res.status(500).json({ error: "Failed to update minute" });
    }
  });

  app.delete("/api/minutes/:id", async (req, res) => {
    try {
      await storage.deleteMinute(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete minute" });
    }
  });

  // AI Summary endpoint for minutes
  app.post("/api/minutes/:id/summarize", async (req, res) => {
    try {
      const minute = await storage.getMinute(req.params.id);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }

      // Use OpenAI to generate summary
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an assistant that summarizes meeting minutes for construction project management. Provide a concise summary highlighting key decisions, action items, and important discussions. Format the response in clear paragraphs."
          },
          {
            role: "user",
            content: `Please summarize the following meeting minutes:\n\nTitle: ${minute.title}\nDate: ${new Date(minute.meetingDate).toLocaleDateString()}\nAttendees: ${(minute.attendees as string[])?.join(', ') || 'Not specified'}\n\nContent:\n${minute.contentText || ''}`
          }
        ],
      });

      const summary = completion.choices[0]?.message?.content || '';
      
      // Update the minute with the summary
      const updatedMinute = await storage.updateMinute(req.params.id, { aiSummary: summary });
      res.json({ summary, minute: updatedMinute });
    } catch (error) {
      console.error("Failed to generate summary:", error);
      res.status(500).json({ error: "Failed to generate AI summary" });
    }
  });

  // Configure multer for audio/video file uploads
  const recordingUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit (OpenAI Whisper limit)
    },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm',
        'video/mp4', 'video/mpeg', 'video/webm'
      ];
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Please upload an audio or video file.'));
      }
    }
  });

  // Transcribe audio/video endpoint for minutes
  app.post("/api/minutes/:id/transcribe", recordingUpload.single('recording'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const minute = await storage.getMinute(req.params.id);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }

      // Update status to processing
      await storage.updateMinute(req.params.id, { 
        transcriptionStatus: 'processing',
        recordingFileName: req.file.originalname
      });

      // Use OpenAI Whisper API to transcribe
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      // Create a File object from the buffer
      const file = new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype });

      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: "en",
      });

      // Update minute with transcription
      const updatedMinute = await storage.updateMinute(req.params.id, {
        transcription: transcription.text,
        transcriptionStatus: 'completed',
        contentText: transcription.text, // Pre-fill content with transcription
      });

      res.json({ 
        transcription: transcription.text, 
        minute: updatedMinute 
      });
    } catch (error) {
      console.error("Failed to transcribe audio:", error);
      
      // Update status to failed
      await storage.updateMinute(req.params.id, { transcriptionStatus: 'failed' });
      
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });

  // Custom Field Definitions API Routes
  app.get("/api/custom-field-defs", async (req, res) => {
    try {
      const fieldDefs = await storage.getCustomFieldDefs();
      res.json(fieldDefs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field definitions" });
    }
  });

  app.get("/api/custom-field-defs/:id", async (req, res) => {
    try {
      const fieldDef = await storage.getCustomFieldDef(req.params.id);
      if (!fieldDef) {
        return res.status(404).json({ error: "Custom field definition not found" });
      }
      res.json(fieldDef);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field definition" });
    }
  });

  app.post("/api/custom-field-defs", async (req, res) => {
    try {
      const validationResult = insertCustomFieldDefSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const fieldDef = await storage.createCustomFieldDef(validationResult.data);
      res.status(201).json(fieldDef);
    } catch (error) {
      if (error instanceof Error && error.message === "Maximum of 4 custom fields allowed") {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create custom field definition" });
    }
  });

  app.patch("/api/custom-field-defs/:id", async (req, res) => {
    try {
      const updateSchema = insertCustomFieldDefSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const fieldDef = await storage.updateCustomFieldDef(req.params.id, validationResult.data);
      if (!fieldDef) {
        return res.status(404).json({ error: "Custom field definition not found" });
      }
      res.json(fieldDef);
    } catch (error) {
      res.status(500).json({ error: "Failed to update custom field definition" });
    }
  });

  app.delete("/api/custom-field-defs/:id", async (req, res) => {
    try {
      const success = await storage.deleteCustomFieldDef(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Custom field definition not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom field definition" });
    }
  });

  // Custom Field Options API Routes
  app.get("/api/custom-field-defs/:fieldDefId/options", async (req, res) => {
    try {
      const options = await storage.getCustomFieldOptions(req.params.fieldDefId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field options" });
    }
  });

  app.get("/api/custom-field-options/:id", async (req, res) => {
    try {
      const option = await storage.getCustomFieldOption(req.params.id);
      if (!option) {
        return res.status(404).json({ error: "Custom field option not found" });
      }
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field option" });
    }
  });

  app.post("/api/custom-field-options", async (req, res) => {
    try {
      const validationResult = insertCustomFieldOptionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.createCustomFieldOption(validationResult.data);
      res.status(201).json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to create custom field option" });
    }
  });

  app.patch("/api/custom-field-options/:id", async (req, res) => {
    try {
      const updateSchema = insertCustomFieldOptionSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.updateCustomFieldOption(req.params.id, validationResult.data);
      if (!option) {
        return res.status(404).json({ error: "Custom field option not found" });
      }
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to update custom field option" });
    }
  });

  app.delete("/api/custom-field-options/:id", async (req, res) => {
    try {
      const success = await storage.deleteCustomFieldOption(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Custom field option not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete custom field option" });
    }
  });

  // Field Categories API Routes (Buildern-style)
  // Seed missing built-in field categories (for production databases that predate new categories)
  app.post("/api/field-categories/seed-missing", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const result = await storage.seedMissingBuiltInCategories();
      res.json({
        message: "Seeding complete",
        addedCategories: result.addedCategories,
        addedOptions: result.addedOptions,
      });
    } catch (error) {
      console.error("Error seeding missing categories:", error);
      res.status(500).json({ error: "Failed to seed missing categories" });
    }
  });

  app.get("/api/field-categories", async (req, res) => {
    try {
      const categories = await storage.getFieldCategories();
      
      // Fetch options for each category to return FieldCategoryWithOptions[]
      const categoriesWithOptions = await Promise.all(
        categories.map(async (category) => {
          const options = await storage.getFieldOptions(category.id);
          return {
            ...category,
            options
          };
        })
      );
      
      res.json(categoriesWithOptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field categories" });
    }
  });

  app.get("/api/field-categories/by-key/:key", async (req, res) => {
    try {
      const categoryWithOptions = await storage.getFieldCategoryWithOptions(req.params.key);
      if (!categoryWithOptions) {
        return res.status(404).json({ error: "Field category not found" });
      }
      res.json(categoryWithOptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field category with options" });
    }
  });

  app.get("/api/field-categories/:id", async (req, res) => {
    try {
      const category = await storage.getFieldCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Field category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field category" });
    }
  });

  app.post("/api/field-categories", requireAuth, requireTeamMember, requirePermission("admin.company", "add"), async (req, res) => {
    try {
      const validationResult = insertFieldCategorySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const category = await storage.createFieldCategory(validationResult.data);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to create field category" });
    }
  });

  app.patch("/api/field-categories/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
    try {
      // Create update schema that omits critical immutable fields
      const updateSchema = insertFieldCategorySchema.omit({ key: true, isBuiltIn: true }).partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const category = await storage.updateFieldCategory(req.params.id, validationResult.data);
      if (!category) {
        return res.status(404).json({ error: "Field category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({ error: "Failed to update field category" });
    }
  });

  app.delete("/api/field-categories/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "delete"), async (req, res) => {
    try {
      const category = await storage.getFieldCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Field category not found" });
      }
      
      if (category.isBuiltIn) {
        return res.status(400).json({ error: "Cannot delete built-in field categories" });
      }

      const success = await storage.deleteFieldCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Field category not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete field category" });
    }
  });

  // Field Options API Routes
  app.get("/api/field-categories/:categoryId/options", async (req, res) => {
    try {
      const options = await storage.getFieldOptions(req.params.categoryId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field options" });
    }
  });

  // Get field options by category key (for mobile app)
  app.get("/api/field-options", async (req, res) => {
    try {
      const categoryKey = req.query.categoryKey as string;
      if (!categoryKey) {
        return res.status(400).json({ error: "categoryKey query parameter is required" });
      }
      
      // First get the category by key
      const categories = await storage.getFieldCategories();
      const category = categories.find((c: any) => c.key === categoryKey);
      if (!category) {
        return res.json([]); // Return empty array if category doesn't exist yet
      }
      
      // Then get options for that category
      const options = await storage.getFieldOptions(category.id);
      res.json(options.filter((opt: any) => opt.isActive));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field options" });
    }
  });

  app.get("/api/field-options/:id", async (req, res) => {
    try {
      const option = await storage.getFieldOption(req.params.id);
      if (!option) {
        return res.status(404).json({ error: "Field option not found" });
      }
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field option" });
    }
  });

  app.post("/api/field-options", requireAuth, requireTeamMember, requirePermission("admin.company", "add"), async (req, res) => {
    try {
      const validationResult = insertFieldOptionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.createFieldOption(validationResult.data);
      res.status(201).json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to create field option" });
    }
  });

  app.patch("/api/field-options/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
    try {
      const updateSchema = insertFieldOptionSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.updateFieldOption(req.params.id, validationResult.data);
      if (!option) {
        return res.status(404).json({ error: "Field option not found" });
      }
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to update field option" });
    }
  });

  app.delete("/api/field-options/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "delete"), async (req, res) => {
    try {
      const success = await storage.deleteFieldOption(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Field option not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete field option" });
    }
  });

  // Batch update field options (for Buildern-style master-detail UI)
  app.post("/api/field-categories/:id/options/batch", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
    try {
      // Validate the request body as an array of partial field options
      const batchSchema = z.array(z.object({
        id: z.string().optional(),
        key: z.string(),
        name: z.string(),
        color: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        sortOrder: z.number().optional(),
        createdAt: z.date().optional(),
      }));

      const validationResult = batchSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const categoryId = req.params.id;
      const category = await storage.getFieldCategory(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Field category not found" });
      }

      const options = await storage.setCategoryOptions(categoryId, validationResult.data);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to batch update field options" });
    }
  });

  // Note Templates API Routes
  app.get("/api/note-templates", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      const userRoleId = user?.roleId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { activeOnly } = req.query;
      let templates = await storage.getNoteTemplates(companyId);
      
      // Filter by active status if activeOnly is true (used when creating notes)
      if (activeOnly === "true") {
        templates = templates.filter(t => t.isActive);
      }
      
      // Filter by user's role if visibleToRoles is specified (used when creating notes)
      if (activeOnly === "true" && userRoleId) {
        templates = templates.filter(t => {
          const roles = t.visibleToRoles as string[] | null;
          // If no roles specified, template is visible to all
          if (!roles || roles.length === 0) return true;
          // Check if user's role is in the visible roles
          return roles.includes(userRoleId);
        });
      }
      
      res.json(templates);
    } catch (error) {
      console.error("[Note Templates API] Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch note templates" });
    }
  });

  app.get("/api/note-templates/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { includeFields } = req.query;
      
      if (includeFields === "true") {
        const result = await storage.getNoteTemplateWithFields(req.params.id, companyId);
        if (!result) {
          return res.status(404).json({ error: "Note template not found" });
        }
        res.json(result);
      } else {
        const template = await storage.getNoteTemplate(req.params.id, companyId);
        if (!template) {
          return res.status(404).json({ error: "Note template not found" });
        }
        res.json(template);
      }
    } catch (error) {
      console.error("[Note Templates API] Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch note template" });
    }
  });

  app.post("/api/note-templates", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const validationResult = insertNoteTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const templateData = {
        ...validationResult.data,
        companyId,
        ownerId: user?.id,
        ownerName: user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}`.trim()
          : user?.email || 'Unknown User',
      };

      const template = await storage.createNoteTemplate(templateData);
      res.status(201).json(template);
    } catch (error) {
      console.error("[Note Templates API] Error creating template:", error);
      res.status(500).json({ error: "Failed to create note template" });
    }
  });

  app.patch("/api/note-templates/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const updateSchema = insertNoteTemplateSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.updateNoteTemplate(req.params.id, validationResult.data, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("[Note Templates API] Error updating template:", error);
      res.status(500).json({ error: "Failed to update note template" });
    }
  });

  app.delete("/api/note-templates/:id", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const success = await storage.deleteNoteTemplate(req.params.id, companyId);
      if (!success) {
        return res.status(404).json({ error: "Note template not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("[Note Templates API] Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete note template" });
    }
  });

  // Simple roles endpoint for selection dropdowns (no admin permission required)
  app.get("/api/roles", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const roles = await storage.getUserRoles(undefined, companyId);
      res.json(roles);
    } catch (error) {
      console.error("[Roles API] Error fetching roles:", error);
      res.status(500).json({ error: "Failed to fetch roles" });
    }
  });

  // Note Template Fields API Routes
  app.get("/api/note-templates/:templateId/fields", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify template belongs to company
      const template = await storage.getNoteTemplate(req.params.templateId, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      
      const fields = await storage.getNoteTemplateFields(req.params.templateId);
      res.json(fields);
    } catch (error) {
      console.error("[Note Template Fields API] Error fetching fields:", error);
      res.status(500).json({ error: "Failed to fetch template fields" });
    }
  });

  app.post("/api/note-templates/:templateId/fields", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify template belongs to company
      const template = await storage.getNoteTemplate(req.params.templateId, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      
      const validationResult = insertNoteTemplateFieldSchema.safeParse({
        ...req.body,
        templateId: req.params.templateId
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const field = await storage.createNoteTemplateField(validationResult.data);
      res.status(201).json(field);
    } catch (error) {
      console.error("[Note Template Fields API] Error creating field:", error);
      res.status(500).json({ error: "Failed to create template field" });
    }
  });

  app.patch("/api/note-templates/:templateId/fields/:fieldId", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify template belongs to company
      const template = await storage.getNoteTemplate(req.params.templateId, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      
      const updateSchema = insertNoteTemplateFieldSchema.partial().omit({ templateId: true });
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const field = await storage.updateNoteTemplateField(req.params.fieldId, validationResult.data);
      if (!field) {
        return res.status(404).json({ error: "Template field not found" });
      }
      res.json(field);
    } catch (error) {
      console.error("[Note Template Fields API] Error updating field:", error);
      res.status(500).json({ error: "Failed to update template field" });
    }
  });

  app.delete("/api/note-templates/:templateId/fields/:fieldId", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify template belongs to company
      const template = await storage.getNoteTemplate(req.params.templateId, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      
      const success = await storage.deleteNoteTemplateField(req.params.fieldId);
      if (!success) {
        return res.status(404).json({ error: "Template field not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("[Note Template Fields API] Error deleting field:", error);
      res.status(500).json({ error: "Failed to delete template field" });
    }
  });

  app.post("/api/note-templates/:templateId/fields/reorder", async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Verify template belongs to company
      const template = await storage.getNoteTemplate(req.params.templateId, companyId);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      
      const { fieldIds } = req.body;
      if (!Array.isArray(fieldIds)) {
        return res.status(400).json({ error: "fieldIds must be an array" });
      }

      const fields = await storage.reorderNoteTemplateFields(req.params.templateId, fieldIds);
      res.json(fields);
    } catch (error) {
      console.error("[Note Template Fields API] Error reordering fields:", error);
      res.status(500).json({ error: "Failed to reorder template fields" });
    }
  });

  // Projects API Routes
  app.get("/api/projects", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.json([]); // Return empty array if user has no company
      }

      // Filter projects by company for multi-tenant isolation
      const allProjects = await storage.getProjects();
      const companyProjects = allProjects.filter(p => p.companyId === user.companyId);
      
      res.json(companyProjects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      console.log(`[GET /api/projects/:id] Fetching project with ID: ${req.params.id}`);
      const project = await storage.getProject(req.params.id);
      console.log(`[GET /api/projects/:id] Result:`, project);
      if (!project) {
        console.log(`[GET /api/projects/:id] Project not found, returning 404`);
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error(`[GET /api/projects/:id] Error:`, error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }

      const validationResult = insertProjectSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("Project validation failed:", fromZodError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Check for duplicate project name within the company (case-insensitive) using database query
      const normalizedName = validationResult.data.name.trim().toLowerCase();
      const { rows: existingProjects } = await pool.query(
        `SELECT id FROM projects WHERE company_id = $1 AND LOWER(TRIM(name)) = $2 LIMIT 1`,
        [user.companyId, normalizedName]
      );
      if (existingProjects.length > 0) {
        return res.status(409).json({ 
          error: "A project with this name already exists",
          details: "Project names must be unique within your company",
          code: "DUPLICATE_NAME"
        });
      }

      // Automatically set companyId and ownerId for multi-tenant isolation
      const projectData = {
        ...validationResult.data,
        companyId: user.companyId,
        ownerId: userId,
      };

      const project = await storage.createProject(projectData);
      
      // Auto-create channel for the project
      try {
        // Generate channel name from project name (e.g., "26 Ocean Drive" -> "26-ocean-drive")
        const channelName = project.name
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
          .replace(/\s+/g, '-') // Replace spaces with dashes
          .substring(0, 50); // Limit length
        
        const channel = await storage.createChannel({
          name: channelName,
          type: "channel",
          projectId: project.id,
          description: `Project channel for ${project.name}`,
          companyId: user.companyId
        });
        
        // Add project owner to the channel
        await storage.addChannelMember({
          channelId: channel.id,
          userId: userId
        });
        
        console.log(`Auto-created channel ${channel.name} for project ${project.name}`);
      } catch (channelError) {
        // Log error but don't fail project creation
        console.error("Error creating project channel:", channelError);
      }
      
      // Auto-create Google Drive folder structure from default template
      try {
        const company = await storage.getCompany(user.companyId);
        
        // Check if Google Drive is connected
        if (company?.googleDriveAccessToken) {
          const { GoogleDriveService } = await import('./services/googleDriveService');
          const driveService = new GoogleDriveService(storage);
          
          // Check if there's a default folder template
          const templates = await storage.getFolderTemplates(user.companyId);
          const defaultTemplate = templates.find(t => t.isDefault);
          
          // Determine parent folder (company root or Drive root)
          const parentFolderId = company.googleDriveRootFolderId || undefined;
          
          // Create main project folder
          const projectFolder = await driveService.createFolder(
            user.companyId,
            project.name,
            parentFolderId
          );
          
          // Link the folder to the project
          await storage.updateProject(project.id, {
            googleDriveFolderId: projectFolder.id,
            googleDriveFolderName: project.name,
          });
          
          // Log the folder creation
          await storage.createDriveFileActivityLog({
            companyId: user.companyId,
            projectId: project.id,
            action: "create_folder",
            driveFileId: projectFolder.id,
            fileName: project.name,
            userId: userId,
            userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            details: { autoCreated: true, isProjectRoot: true },
          });
          
          // If there's a default template, create subfolders
          if (defaultTemplate && defaultTemplate.folderStructure) {
            const folderStructure = defaultTemplate.folderStructure as any[];
            
            const createFoldersRecursively = async (folders: any[], parentId: string): Promise<void> => {
              for (const folder of folders) {
                const created = await driveService.createFolder(user.companyId, folder.name, parentId);
                
                await storage.createDriveFileActivityLog({
                  companyId: user.companyId,
                  projectId: project.id,
                  action: "create_folder",
                  driveFileId: created.id,
                  fileName: folder.name,
                  userId: userId,
                  userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
                  details: { templateId: defaultTemplate.id, templateName: defaultTemplate.name },
                });
                
                if (folder.children && folder.children.length > 0) {
                  await createFoldersRecursively(folder.children, created.id);
                }
              }
            };
            
            await createFoldersRecursively(folderStructure, projectFolder.id);
            console.log(`Auto-created folder structure from template "${defaultTemplate.name}" for project ${project.name}`);
          } else {
            console.log(`Auto-created Drive folder for project ${project.name}`);
          }
        }
      } catch (driveError) {
        // Log error but don't fail project creation
        console.error("Error creating project Drive folder:", driveError);
      }
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      console.log("[PATCH /api/projects/:id] Project ID:", req.params.id);
      console.log("[PATCH /api/projects/:id] Request body:", JSON.stringify(req.body, null, 2));
      
      const updateSchema = insertProjectSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("[PATCH /api/projects/:id] Validation failed:", fromZodError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      console.log("[PATCH /api/projects/:id] Validated data:", JSON.stringify(validationResult.data, null, 2));

      // If projectSubStatus is being updated (present in payload), also update currentSystemPhase
      // This handles: setting a new status, clearing status (null), or changing to same status
      let updateData = { ...validationResult.data };
      if ('projectSubStatus' in req.body) {
        try {
          const newSubStatus = validationResult.data.projectSubStatus;
          if (newSubStatus) {
            // Look up the systemPhase for the new status
            const statusCategory = await storage.getFieldCategoryWithOptions("project.status");
            if (statusCategory?.options) {
              const statusOption = statusCategory.options.find(
                opt => opt.key === newSubStatus
              );
              if (statusOption?.systemPhase) {
                updateData.currentSystemPhase = statusOption.systemPhase;
                console.log(`[PATCH /api/projects/:id] Auto-updating currentSystemPhase to: ${statusOption.systemPhase}`);
              }
            }
          } else {
            // Status is being cleared - keep current phase (don't clear it)
            console.log(`[PATCH /api/projects/:id] projectSubStatus cleared, keeping current phase`);
          }
        } catch (phaseError) {
          console.error("[PATCH /api/projects/:id] Error looking up systemPhase:", phaseError);
        }
      }

      // If projectStatus (high-level phase) is being updated directly (e.g., from board grouped by phase),
      // also sync currentSystemPhase to match
      if ('projectStatus' in req.body && !('projectSubStatus' in req.body)) {
        const newProjectStatus = updateData.projectStatus;
        if (newProjectStatus) {
          // projectStatus values (lead, pre_construction, construction, post_construction) map directly to currentSystemPhase
          const validPhases = ['lead', 'pre_construction', 'construction', 'post_construction', 'archive'];
          if (validPhases.includes(newProjectStatus)) {
            updateData.currentSystemPhase = newProjectStatus;
            console.log(`[PATCH /api/projects/:id] Syncing currentSystemPhase from projectStatus: ${newProjectStatus}`);
          }
        } else if (newProjectStatus === null) {
          // projectStatus is being cleared - also clear currentSystemPhase
          updateData.currentSystemPhase = null;
          console.log(`[PATCH /api/projects/:id] Clearing currentSystemPhase as projectStatus was cleared`);
        }
      }

      // Check for duplicate project name within the company (case-insensitive) when renaming
      if (updateData.name) {
        const user = req.user as any;
        if (!user?.companyId) {
          return res.status(401).json({ error: "Unauthorized - no company context" });
        }
        
        const currentProject = await storage.getProject(req.params.id);
        if (!currentProject) {
          return res.status(404).json({ error: "Project not found" });
        }
        if (currentProject.companyId !== user.companyId) {
          return res.status(403).json({ error: "Access denied" });
        }
        
        const normalizedName = updateData.name!.trim().toLowerCase();
        const { rows: existingProjects } = await pool.query(
          `SELECT id FROM projects WHERE company_id = $1 AND LOWER(TRIM(name)) = $2 AND id != $3 LIMIT 1`,
          [currentProject.companyId, normalizedName, req.params.id]
        );
        if (existingProjects.length > 0) {
          return res.status(409).json({ 
            error: "A project with this name already exists",
            details: "Project names must be unique within your company",
            code: "DUPLICATE_NAME"
          });
        }
      }

      const project = await storage.updateProject(req.params.id, updateData);
      if (!project) {
        console.error("[PATCH /api/projects/:id] Project not found:", req.params.id);
        return res.status(404).json({ error: "Project not found" });
      }
      
      console.log("[PATCH /api/projects/:id] Project updated successfully");
      res.json(project);
    } catch (error: any) {
      console.error("[PATCH /api/projects/:id] Error updating project:", error);
      console.error("[PATCH /api/projects/:id] Error stack:", error.stack);
      res.status(500).json({ 
        error: "Failed to update project",
        details: error.message 
      });
    }
  });

  app.delete("/api/projects/:id", async (req, res) => {
    try {
      const success = await storage.deleteProject(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project" });
    }
  });

  // Fix project phases - updates currentSystemPhase based on projectSubStatus
  // Uses direct SQL to bypass duplicate name validation since we're only updating phase
  app.post("/api/projects/fix-phases", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get all status options with their systemPhase mappings
      const statusCategory = await storage.getFieldCategoryWithOptions("project.status");
      if (!statusCategory?.options) {
        return res.status(500).json({ error: "Could not load status options" });
      }

      // Create a map of status key -> systemPhase
      const statusToPhaseMap = new Map<string, string>();
      for (const opt of statusCategory.options) {
        if (opt.key && opt.systemPhase) {
          statusToPhaseMap.set(opt.key, opt.systemPhase);
        }
      }

      // Get all projects for this company
      const projects = await storage.getProjects(user.companyId);
      let updatedCount = 0;
      const errors: string[] = [];

      // Process in batches using direct SQL to bypass duplicate name validation
      for (const project of projects) {
        if (project.projectSubStatus) {
          const expectedPhase = statusToPhaseMap.get(project.projectSubStatus);
          if (expectedPhase && project.currentSystemPhase !== expectedPhase) {
            try {
              // Direct SQL update bypasses storage.updateProject validation
              await pool.query(
                `UPDATE projects SET current_system_phase = $1 WHERE id = $2`,
                [expectedPhase, project.id]
              );
              updatedCount++;
              console.log(`[fix-phases] Updated project "${project.name}" from ${project.currentSystemPhase} to ${expectedPhase}`);
            } catch (updateError: any) {
              errors.push(`Failed to update project "${project.name}": ${updateError.message}`);
              console.error(`[fix-phases] Error updating project "${project.name}":`, updateError);
            }
          }
        }
      }

      res.json({ 
        message: `Fixed ${updatedCount} projects`,
        totalProjects: projects.length,
        updatedProjects: updatedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error: any) {
      console.error("Error fixing project phases:", error);
      res.status(500).json({ error: "Failed to fix project phases", details: error.message });
    }
  });

  // Job Number Preview API
  app.get("/api/job-numbers/preview", requireAuth, async (req, res) => {
    try {
      const phase = req.query.phase as string;
      if (!phase || !["lead", "pre_construction", "construction"].includes(phase)) {
        return res.status(400).json({ error: "Invalid phase" });
      }
      
      const { JobNumberService } = await import("./services/jobNumberService");
      const companyId = (req.user as any)?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Company not found" });
      }
      
      const jobNumber = await JobNumberService.previewNextJobNumber(
        companyId,
        phase as "lead" | "pre_construction" | "construction"
      );
      
      res.json({ jobNumber });
    } catch (error: any) {
      console.error("Failed to preview job number:", error);
      res.status(500).json({ error: "Failed to preview job number", details: error.message });
    }
  });

  // Project Phase Transition API
  app.post("/api/projects/:id/transition-phase", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { fromPhase, toPhase, newStatusKey, jobNumber } = req.body;
      const user = req.user as any;
      
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const { JobNumberService } = await import("./services/jobNumberService");
      
      // Determine if we need to generate a job number
      let generatedJobNumber = jobNumber;
      const needsJobNumber = toPhase === "pre_construction" || toPhase === "construction";
      
      if (needsJobNumber && !jobNumber) {
        generatedJobNumber = await JobNumberService.generateJobNumber(
          user.companyId,
          toPhase
        );
      }
      
      // Build update data
      const updateData: any = {
        currentSystemPhase: toPhase,
        projectSubStatus: newStatusKey,
      };
      
      // Set appropriate job number field based on phase
      if (toPhase === "lead") {
        updateData.leadNumber = generatedJobNumber;
      } else if (toPhase === "pre_construction") {
        updateData.preConstructionNumber = generatedJobNumber;
      } else if (toPhase === "construction") {
        updateData.constructionNumber = generatedJobNumber;
        updateData.jobNumber = generatedJobNumber; // Also update main job number
      }
      
      // Record phase transition
      const transitions = Array.isArray(project.phaseTransitions) ? project.phaseTransitions : [];
      updateData.phaseTransitions = [
        ...transitions,
        {
          fromPhase,
          toPhase,
          timestamp: new Date().toISOString(),
          userId: user.id,
          userName: user.name,
          jobNumber: generatedJobNumber,
        },
      ];
      
      const updatedProject = await storage.updateProject(req.params.id, updateData);
      
      // Create phase-specific folder in Google Drive if connected
      try {
        const company = await storage.getCompany(user.companyId);
        
        if (company?.googleDriveAccessToken && project.googleDriveFolderId) {
          const { GoogleDriveService } = await import('./services/googleDriveService');
          const driveService = new GoogleDriveService(storage);
          
          // Define phase-specific folder names
          const phaseFolderNames: Record<string, string> = {
            lead: "01 - Lead",
            pre_construction: "02 - Pre-Construction",
            construction: "03 - Construction",
          };
          
          const folderName = phaseFolderNames[toPhase];
          if (folderName) {
            // Check if folder already exists by listing project folder contents
            const existingFiles = await driveService.listFiles(user.companyId, project.googleDriveFolderId);
            const folderExists = existingFiles.some(
              f => f.name === folderName && f.mimeType === 'application/vnd.google-apps.folder'
            );
            
            if (!folderExists) {
              const phaseFolder = await driveService.createFolder(
                user.companyId,
                folderName,
                project.googleDriveFolderId
              );
              
              await storage.createDriveFileActivityLog({
                companyId: user.companyId,
                projectId: project.id,
                action: "create_folder",
                driveFileId: phaseFolder.id,
                fileName: folderName,
                userId: user.id,
                userName: user.name || user.email,
                details: { phase: toPhase, autoCreated: true, phaseTransition: true },
              });
              
              console.log(`Created phase folder "${folderName}" for project ${project.name}`);
            }
          }
        }
      } catch (driveError) {
        // Log error but don't fail phase transition
        console.error("Error creating phase folder:", driveError);
      }
      
      res.json(updatedProject);
    } catch (error: any) {
      console.error("Failed to transition project phase:", error);
      res.status(500).json({ error: "Failed to transition project phase", details: error.message });
    }
  });

  // Project Team API Routes
  app.get("/api/projects/:projectId/team", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const teamMembers = await storage.getProjectTeamMembers(req.params.projectId);
      // Sanitize user data to remove sensitive fields
      const safeTeamMembers = teamMembers.map(user => toSafeUser(user));
      res.json(safeTeamMembers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project team members" });
    }
  });

  app.post("/api/projects/:projectId/team/:userId", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { accessLevel = "view" } = req.body;
      const grantedBy = req.user?.id || "";
      
      const access = await storage.grantProjectAccess(
        req.params.userId,
        req.params.projectId,
        accessLevel,
        grantedBy
      );
      
      res.status(201).json(access);
    } catch (error) {
      res.status(500).json({ error: "Failed to grant project access" });
    }
  });

  app.delete("/api/projects/:projectId/team/:userId", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.revokeProjectAccess(
        req.params.userId,
        req.params.projectId
      );
      
      if (!success) {
        return res.status(404).json({ error: "Project access not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke project access" });
    }
  });

  // Task Views API Routes
  app.get("/api/task-views", requireAuth, async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const taskViews = await storage.getTaskViews(req.user.companyId, req.user.id);
      res.json(taskViews);
    } catch (error) {
      console.error("Failed to fetch task views:", error);
      res.status(500).json({ error: "Failed to fetch task views" });
    }
  });

  app.get("/api/task-views/:id", requireAuth, async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const taskView = await storage.getTaskView(req.params.id, req.user.companyId);
      if (!taskView) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.json(taskView);
    } catch (error) {
      console.error("Failed to fetch task view:", error);
      res.status(500).json({ error: "Failed to fetch task view" });
    }
  });

  app.post("/api/task-views", requireAuth, async (req, res) => {
    try {
      if (!req.user?.companyId || !req.user?.id) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const validationResult = insertTaskViewSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const taskView = await storage.createTaskView(
        validationResult.data, 
        req.user.id, 
        req.user.companyId
      );
      res.status(201).json(taskView);
    } catch (error) {
      console.error("Failed to create task view:", error);
      res.status(500).json({ error: "Failed to create task view" });
    }
  });

  app.patch("/api/task-views/:id", requireAuth, async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const updateSchema = insertTaskViewSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const taskView = await storage.updateTaskView(
        req.params.id, 
        validationResult.data, 
        req.user.companyId
      );
      if (!taskView) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.json(taskView);
    } catch (error) {
      console.error("Failed to update task view:", error);
      res.status(500).json({ error: "Failed to update task view" });
    }
  });

  app.delete("/api/task-views/:id", requireAuth, async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const success = await storage.deleteTaskView(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete task view:", error);
      res.status(500).json({ error: "Failed to delete task view" });
    }
  });

  // Subtasks API Routes
  app.get("/api/tasks/:id/subtasks", async (req, res) => {
    try {
      const subtasks = await storage.getSubtasks(req.params.id);
      res.json(subtasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subtasks" });
    }
  });

  app.post("/api/tasks/:id/subtasks", async (req, res) => {
    try {
      const validationResult = insertTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const subtask = await storage.createSubtask(req.params.id, validationResult.data);
      res.status(201).json(subtask);
    } catch (error) {
      res.status(500).json({ error: "Failed to create subtask" });
    }
  });

  // Estimates API Routes
  app.get("/api/estimates", async (req, res) => {
    try {
      const { projectId } = req.query;
      const estimates = await storage.getEstimates(projectId as string | undefined);
      res.json(estimates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimates" });
    }
  });

  app.get("/api/estimates/:id", async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.json(estimate);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate" });
    }
  });

  app.post("/api/estimates", async (req, res) => {
    try {
      const validationResult = insertEstimateSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("Estimate validation failed:", fromZodError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const estimate = await storage.createEstimate(validationResult.data);
      res.status(201).json(estimate);
    } catch (error: any) {
      console.error("Error creating estimate:", error.message, error.stack);
      res.status(500).json({ error: "Failed to create estimate", details: error.message });
    }
  });

  app.patch("/api/estimates/:id", async (req, res) => {
    try {
      const updateSchema = insertEstimateSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const estimate = await storage.updateEstimate(req.params.id, validationResult.data);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.json(estimate);
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate" });
    }
  });

  app.delete("/api/estimates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate" });
    }
  });

  // Get estimate items by project ID (for RFQ import)
  app.get("/api/projects/:projectId/estimate-items", async (req, res) => {
    try {
      const estimates = await storage.getEstimates(req.params.projectId);
      if (estimates.length === 0) {
        return res.json([]);
      }
      // Get items from all estimates for this project
      const allItems: any[] = [];
      for (const estimate of estimates) {
        const items = await storage.getEstimateItems(estimate.id);
        allItems.push(...items);
      }
      res.json(allItems);
    } catch (error) {
      console.error("Failed to fetch estimate items by project:", error);
      res.status(500).json({ error: "Failed to fetch estimate items" });
    }
  });

  // Estimate Items API Routes
  app.get("/api/estimates/:id/items", async (req, res) => {
    try {
      const items = await storage.getEstimateItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate items" });
    }
  });

  app.get("/api/estimate-items/:id", async (req, res) => {
    try {
      const item = await storage.getEstimateItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate item" });
    }
  });

  app.post("/api/estimates/:id/items", async (req, res) => {
    try {
      const estimateId = req.params.id;
      
      // Get estimate for project markup and tax rate
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      // Convert dollar amounts to cents with proper rounding to avoid floating point issues
      const unitCostExTaxCents = req.body.unitCostExTax ? Math.round(req.body.unitCostExTax * 100) : 0;
      const quantityCents = req.body.quantity ? Math.round(req.body.quantity * 100) : 100;
      const markupPercent = req.body.markupPercent ?? null;
      
      // Calculate pricing
      // 1. Builder cost = unitCost × quantity
      const builderCostExTax = Math.round((unitCostExTaxCents * quantityCents) / 100);
      
      // 2. Apply markup (defaults to 0% if not specified)
      const effectiveMarkupPercent = markupPercent ?? 0;
      const markupAmount = Math.round((builderCostExTax * effectiveMarkupPercent) / 100);
      
      // 3. Client price = builder cost + markup
      const clientPriceExTax = builderCostExTax + markupAmount;
      
      // 4. Calculate tax on client price
      const taxRate = estimate.taxRate ?? 10;
      const taxAmount = Math.round((clientPriceExTax * taxRate) / 100);
      
      // 5. Client price inc tax
      const clientPriceIncTax = clientPriceExTax + taxAmount;
      
      const itemData = {
        ...req.body,
        estimateId,
        unitCostExTax: unitCostExTaxCents,
        quantity: quantityCents,
        markupPercent,
        taxAmount,
        priceIncTax: clientPriceIncTax,
      };
      
      const validationResult = insertEstimateItemSchema.safeParse(itemData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createEstimateItem(validationResult.data);
      res.status(201).json(item);
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate item" });
    }
  });

  app.post("/api/estimates/:id/items/import", async (req, res) => {
    try {
      const { items } = req.body;
      const estimateId = req.params.id;
      
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required and must not be empty" });
      }

      // Get estimate for project markup and tax rate
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }

      // Get company cost codes to validate against
      const companyCostCodes = await storage.getCostCodes();
      const costCodeMap = new Map<string, string>(); // code -> code (for validation)
      
      // Build map of cost codes by code (case-insensitive)
      for (const cc of companyCostCodes) {
        costCodeMap.set(cc.code.toLowerCase().trim(), cc.code);
      }

      // Get existing groups for this estimate to match against
      const existingGroups = await storage.getEstimateGroups(estimateId);
      const groupMap = new Map<string, string>(); // groupName (lowercase) -> groupId
      
      // Build map of existing groups (case-insensitive)
      for (const group of existingGroups) {
        groupMap.set(group.name.toLowerCase().trim(), group.id);
      }
      
      console.log('[IMPORT] Existing groups for matching:', 
        Array.from(groupMap.entries()).map(([name, id]) => `${name} -> ${id}`)
      );

      // Collect all unique group names from import data
      const uniqueGroupNames = new Set<string>();
      items.forEach(item => {
        if (item.group && item.group.trim()) {
          uniqueGroupNames.add(item.group.trim());
        }
      });

      // Create any missing groups
      for (const groupName of Array.from(uniqueGroupNames)) {
        const normalizedName = groupName.toLowerCase().trim();
        if (!groupMap.has(normalizedName)) {
          console.log(`[IMPORT] Creating new group: "${groupName}"`);
          const newGroup = await storage.createEstimateGroup({
            estimateId,
            name: groupName,
            description: undefined,
            order: 0,
            isCollapsed: false,
            parentGroupId: undefined,
          });
          groupMap.set(normalizedName, newGroup.id);
          console.log(`[IMPORT] Created group "${groupName}" with ID ${newGroup.id}`);
        }
      }

      console.log('[IMPORT] Final group map:', 
        Array.from(groupMap.entries()).map(([name, id]) => `${name} -> ${id}`)
      );

      // Validate all items first
      const validatedItems: any[] = [];
      const itemCostCodes = new Map<number, string>(); // index -> costCode
      const errors: Array<{ row: number; errors: string[] }> = [];
      
      items.forEach((item, index) => {
        console.log(`[Import] Processing item ${index}:`, {
          name: item.name,
          costCode: item.costCode,
          rawQuantity: item.quantity,
          rawUnitCostExTax: item.unitCostExTax,
          rawMarkupPercent: item.markupPercent
        });
        
        // Validate and map cost code to company cost codes
        let costCodeToStore = null;
        
        if (item.costCode) {
          // Handle both "CODE - TITLE" format and raw code
          let codeToMatch = item.costCode.trim();
          
          // If it contains " - ", extract just the code part
          if (codeToMatch.includes(' - ')) {
            codeToMatch = codeToMatch.split(' - ')[0].trim();
          }
          
          // Find matching cost code ID from company cost codes
          const matchedCostCode = companyCostCodes.find(
            cc => cc.code.toLowerCase() === codeToMatch.toLowerCase()
          );
          
          if (matchedCostCode) {
            // Store the cost code ID (UUID)
            costCodeToStore = matchedCostCode.id;
            console.log(`[IMPORT] Item "${item.name}" - Matched cost code "${item.costCode}" to ID ${matchedCostCode.id}`);
          } else {
            console.log(`[IMPORT] Item "${item.name}" - No match for cost code "${item.costCode}"`);
          }
        }

        // Match group name to existing groups
        let groupIdToStore = null;
        
        if (item.group) {
          const groupNameToMatch = item.group.toLowerCase().trim();
          const matchedGroupId = groupMap.get(groupNameToMatch);
          if (matchedGroupId) {
            groupIdToStore = matchedGroupId;
            console.log(`[IMPORT] Item "${item.name}" - Matched group "${item.group}" to group ID ${matchedGroupId}`);
          } else {
            console.log(`[IMPORT] Item "${item.name}" - No match for group "${item.group}" (normalized: "${groupNameToMatch}")`);
          }
        } else {
          console.log(`[IMPORT] Item "${item.name}" - No group specified in import data`);
        }
        
        // Convert dollar amounts to cents with proper rounding
        const unitCostExTaxCents = item.unitCostExTax ? Math.round(item.unitCostExTax * 100) : 0;
        const quantity = item.quantity ? Math.round(item.quantity * 100) : 100; // Quantity stored as whole number * 100
        const markupPercent = item.markupPercent ?? null;
        
        // Calculate pricing
        // 1. Builder cost = unitCost × quantity (both already in cents/hundredths)
        const builderCostExTax = Math.round((unitCostExTaxCents * quantity) / 100);
        
        // 2. Apply markup (item-specific or project-level)
        const effectiveMarkupPercent = markupPercent ?? estimate.projectMarkupPercent ?? 0;
        const markupAmount = Math.round((builderCostExTax * effectiveMarkupPercent) / 100);
        
        // 3. Client price = builder cost + markup
        const clientPriceExTax = builderCostExTax + markupAmount;
        
        // 4. Calculate tax on client price
        const taxRate = estimate.taxRate ?? 10;
        const taxAmount = Math.round((clientPriceExTax * taxRate) / 100);
        
        // 5. Client price inc tax
        const clientPriceIncTax = clientPriceExTax + taxAmount;
        
        // Explicitly build item data without spreading to avoid field mismatches
        const itemData = {
          estimateId,
          name: item.name,
          type: item.type || "Material",
          groupId: groupIdToStore || null,
          parentItemId: undefined,
          costCode: costCodeToStore || undefined,
          allowance: item.allowance || "None",
          allowanceStatus: "pending",
          pcMarkupPercent: undefined,
          quantity,
          unitType: item.unitType || "each",
          status: item.status || "incomplete",
          unitCostExTax: unitCostExTaxCents,
          markupPercent,
          taxAmount,
          priceIncTax: clientPriceIncTax,
          description: item.description || undefined,
          notes: item.notes || undefined,
          attachmentUrl: undefined,
          requestForQuote: false,
          isSelection: false,
          proposalVisible: item.proposalVisible !== undefined ? item.proposalVisible : true,
          shownAs: item.shownAs || undefined,
          trackLabourHours: false,
          order: 0,
        };
        
        const validationResult = insertEstimateItemSchema.safeParse(itemData);
        
        if (!validationResult.success) {
          errors.push({
            row: index + 1,
            errors: validationResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`)
          });
        } else {
          // Ensure the validated item's estimateId matches the route parameter
          if (validationResult.data.estimateId !== estimateId) {
            errors.push({
              row: index + 1,
              errors: ["Estimate ID mismatch"]
            });
          } else {
            validatedItems.push(validationResult.data);
          }
        }
      });
      
      // If there are validation errors, return them
      if (errors.length > 0) {
        return res.status(400).json({
          error: "Validation failed",
          errors,
          validCount: validatedItems.length,
          errorCount: errors.length
        });
      }

      // Items are imported without groups - user can organize them manually later

      console.log(`[Import] Creating ${validatedItems.length} items for estimate ${estimateId}`);
      console.log('[Import] Sample item:', validatedItems[0]);
      
      const createdItems = await storage.bulkCreateEstimateItems(validatedItems);
      
      console.log(`[Import] Successfully created ${createdItems.length} items`);
      console.log('[Import] Sample created item:', createdItems[0]);
      
      res.status(201).json({
        success: true,
        count: createdItems.length,
        items: createdItems
      });
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to import estimate items" });
    }
  });

  // Import full estimate with groups and items
  app.post("/api/projects/:projectId/estimates/import", async (req, res) => {
    try {
      const { name, groups, items } = req.body;
      const projectId = req.params.projectId;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ error: "Estimate name is required" });
      }

      if (!Array.isArray(groups) || groups.length === 0) {
        return res.status(400).json({ error: "Groups array is required and must not be empty" });
      }

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required and must not be empty" });
      }

      // 1. Create the estimate
      const estimateData = {
        projectId,
        name,
        description: `Imported estimate with ${groups.length} groups and ${items.length} items`,
        projectMarkupPercent: 0, // Can be updated later
        taxRate: 10, // Default GST
        isLocked: false,
      };

      const estimate = await storage.createEstimate(estimateData);

      // 2. Create groups with proper sort order, handling arbitrary nesting depth
      const createdGroups: any[] = [];
      const groupNameToId = new Map<string, string>(); // normalized name -> id
      const pendingGroups = [...groups];
      const maxIterations = groups.length + 1; // Prevent infinite loops
      let iteration = 0;

      // Normalize group name for matching (case-insensitive, trimmed)
      const normalizeName = (name: string) => name.trim().toLowerCase();

      // Iteratively create groups: first parents, then their children, then their grandchildren, etc.
      while (pendingGroups.length > 0 && iteration < maxIterations) {
        iteration++;
        const groupsToCreate: any[] = [];

        // Find all groups whose parents have been created (or have no parent)
        for (const group of pendingGroups) {
          if (!group.parentGroupName) {
            // Top-level group, can be created
            groupsToCreate.push(group);
          } else {
            // Check if parent has been created
            const parentGroupId = groupNameToId.get(normalizeName(group.parentGroupName));
            if (parentGroupId) {
              groupsToCreate.push(group);
            }
          }
        }

        // If no groups can be created this iteration, we have orphaned subgroups
        if (groupsToCreate.length === 0) {
          console.warn(`[IMPORT] Could not create ${pendingGroups.length} groups due to missing parents:`,
            pendingGroups.map(g => `"${g.name}" (parent: "${g.parentGroupName}")`));
          break;
        }

        // Create the groups
        for (const group of groupsToCreate) {
          const parentGroupId = group.parentGroupName 
            ? groupNameToId.get(normalizeName(group.parentGroupName))
            : undefined;

          const groupData = {
            estimateId: estimate.id,
            name: group.name,
            parentGroupId,
            order: group.sortOrder ?? createdGroups.length,
          };
          
          const createdGroup = await storage.createEstimateGroup(groupData);
          createdGroups.push(createdGroup);
          groupNameToId.set(normalizeName(group.name), createdGroup.id);
          
          // Remove from pending
          const index = pendingGroups.indexOf(group);
          if (index > -1) {
            pendingGroups.splice(index, 1);
          }
        }
      }

      // 3. Create items with pricing calculations
      const createdItems: any[] = [];
      const errors: Array<{ row: number; errors: string[] }> = [];

      for (let index = 0; index < items.length; index++) {
        const item = items[index];

        try {
          // Find the group ID
          const groupId = groupNameToId.get(item.groupName);
          if (!groupId) {
            errors.push({
              row: index + 1,
              errors: [`Group "${item.groupName}" not found`]
            });
            continue;
          }

          // Convert dollar amounts to cents
          const unitCostExTaxCents = Math.round((item.unitCostExTax || 0) * 100);
          const quantityCents = Math.round((item.quantity || 1) * 100);
          const markupPercent = item.markupPercent ?? 0;

          // Calculate pricing
          const builderCostExTax = Math.round((unitCostExTaxCents * quantityCents) / 100);
          const markupAmount = Math.round((builderCostExTax * markupPercent) / 100);
          const clientPriceExTax = builderCostExTax + markupAmount;
          const taxRate = estimate.taxRate ?? 10;
          const taxAmount = Math.round((clientPriceExTax * taxRate) / 100);
          const clientPriceIncTax = clientPriceExTax + taxAmount;

          const itemData = {
            estimateId: estimate.id,
            groupId,
            name: item.name,
            type: item.type || "Material",
            description: item.description || "",
            quantity: quantityCents,
            unitType: item.unitType || "each",
            unitCostExTax: unitCostExTaxCents,
            markupPercent,
            taxAmount,
            priceIncTax: clientPriceIncTax,
            allowance: item.allowance || "None",
            notes: item.notes || "",
            costCode: item.costCode || null,
            status: item.status || "incomplete",
            proposalVisible: true,
            sortOrder: index,
          };

          const createdItem = await storage.createEstimateItem(itemData);
          createdItems.push(createdItem);
        } catch (error: any) {
          errors.push({
            row: index + 1,
            errors: [error.message || "Failed to create item"]
          });
        }
      }

      res.status(201).json({
        success: true,
        estimate,
        groupCount: createdGroups.length,
        itemCount: createdItems.length,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error importing full estimate:", error);
      res.status(500).json({ error: error.message || "Failed to import estimate" });
    }
  });

  // Reorder estimate items - MUST come before /api/estimate-items/:id to avoid route conflict
  app.patch("/api/estimate-items/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { items } = req.body;
      console.log('[REORDER] Received reorder request with items:', JSON.stringify(items, null, 2));
      
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      // Validate input
      for (const item of items) {
        if (!item.id || typeof item.order !== 'number') {
          return res.status(400).json({ error: "Each item must have id and order" });
        }
      }

      // Security: Verify all items belong to estimates in the user's company (batched query)
      // De-duplicate IDs first (frontend may send parent item twice when moving with sub-items)
      const itemIds = [...new Set(items.map(({ id }) => id))];
      console.log('[REORDER] Verifying ownership for', itemIds.length, 'unique item IDs:', itemIds);
      const verificationResult = await storage.verifyEstimateItemsOwnership(itemIds, companyId);
      if (!verificationResult.authorized) {
        console.error(`[REORDER] Security violation: item ${verificationResult.invalidItemId} does not belong to company ${companyId}`);
        console.error(`[REORDER] All requested item IDs:`, itemIds);
        return res.status(404).json({ error: `Estimate item not found: ${verificationResult.invalidItemId}` });
      }

      // Update each item's order and optionally groupId
      const results = await Promise.all(
        items.map(async ({ id, order, groupId }) => {
          const updateData: any = { order };
          if (groupId !== undefined) {
            updateData.groupId = groupId;
            console.log(`[REORDER] Updating item ${id} to order ${order} and groupId ${groupId}`);
          } else {
            console.log(`[REORDER] Updating item ${id} to order ${order}`);
          }
          const updated = await storage.updateEstimateItem(id, updateData);
          if (!updated) {
            console.error(`[REORDER] Failed to update item ${id} - item not found`);
            throw new Error(`Estimate item not found: ${id}`);
          }
          console.log(`[REORDER] Successfully updated item ${id}`);
          return updated;
        })
      );

      console.log(`[REORDER] Successfully reordered ${results.length} items`);
      res.json({ success: true, count: results.length });
    } catch (error: any) {
      console.error('[REORDER] Error:', error.message);
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message?.includes("Estimate item not found")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reorder items" });
    }
  });

  app.patch("/api/estimate-items/:id", async (req, res) => {
    try {
      // Get existing item to access estimate
      const existingItem = await storage.getEstimateItem(req.params.id);
      if (!existingItem) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      
      // Get estimate for project markup and tax rate
      const estimate = await storage.getEstimate(existingItem.estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      
      // Convert dollar amounts to cents with proper rounding to avoid floating point issues
      const updateData: any = { ...req.body };
      
      // Determine values for calculation (use existing if not updating)
      const unitCostExTaxCents = updateData.unitCostExTax !== undefined 
        ? Math.round(updateData.unitCostExTax * 100)
        : existingItem.unitCostExTax;
      
      const quantityCents = updateData.quantity !== undefined
        ? Math.round(updateData.quantity * 100)
        : existingItem.quantity;
      
      const markupPercent = updateData.markupPercent !== undefined
        ? updateData.markupPercent
        : existingItem.markupPercent;
      
      // Calculate pricing
      // 1. Builder cost = unitCost × quantity
      const builderCostExTax = Math.round((unitCostExTaxCents * quantityCents) / 100);
      
      // 2. Apply markup (defaults to 0% if not specified)
      const effectiveMarkupPercent = markupPercent ?? 0;
      const markupAmount = Math.round((builderCostExTax * effectiveMarkupPercent) / 100);
      
      // 3. Client price = builder cost + markup
      const clientPriceExTax = builderCostExTax + markupAmount;
      
      // 4. Calculate tax on client price
      const taxRate = estimate.taxRate ?? 10;
      const taxAmount = Math.round((clientPriceExTax * taxRate) / 100);
      
      // 5. Client price inc tax
      const clientPriceIncTax = clientPriceExTax + taxAmount;
      
      // Update the data object with calculated values
      updateData.unitCostExTax = unitCostExTaxCents;
      if (updateData.quantity !== undefined) {
        updateData.quantity = quantityCents;
      }
      if (updateData.markupPercent !== undefined) {
        updateData.markupPercent = markupPercent;
      }
      updateData.taxAmount = taxAmount;
      updateData.priceIncTax = clientPriceIncTax;
      
      const updateSchema = insertEstimateItemSchema.partial();
      const validationResult = updateSchema.safeParse(updateData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateEstimateItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      res.json(item);
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate item" });
    }
  });

  app.delete("/api/estimate-items/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimateItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate item" });
    }
  });

  // Duplicate estimate item
  app.post("/api/estimate-items/:id/duplicate", async (req, res) => {
    try {
      const newItem = await storage.duplicateEstimateItem(req.params.id);
      
      if (!newItem) {
        return res.status(404).json({ error: "Failed to duplicate item" });
      }
      
      res.status(201).json(newItem);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error duplicating estimate item:", error);
      res.status(500).json({ error: "Failed to duplicate estimate item" });
    }
  });

  // Copy estimate item to another estimate
  app.post("/api/estimate-items/:id/copy", async (req, res) => {
    try {
      // Validate request body
      const requestSchema = z.object({
        targetEstimateId: z.string().min(1, "targetEstimateId is required")
      });
      
      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const newItem = await storage.copyItemToEstimate(req.params.id, validationResult.data.targetEstimateId);
      
      if (!newItem) {
        return res.status(404).json({ error: "Failed to copy item" });
      }
      
      res.status(201).json(newItem);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error copying estimate item:", error);
      res.status(500).json({ error: "Failed to copy estimate item" });
    }
  });

  // Estimate Groups API Routes
  app.get("/api/estimates/:id/groups", async (req, res) => {
    try {
      const groups = await storage.getEstimateGroups(req.params.id);
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate groups" });
    }
  });

  app.post("/api/estimates/:id/groups", async (req, res) => {
    try {
      const validationResult = insertEstimateGroupSchema.safeParse({
        ...req.body,
        estimateId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.createEstimateGroup(validationResult.data);
      res.status(201).json(group);
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate group" });
    }
  });

  // Reorder estimate groups - MUST come before /:id route
  app.patch("/api/estimate-groups/reorder", async (req, res) => {
    try {
      const { groups } = req.body;
      console.log('[REORDER] Received reorder request for groups:', JSON.stringify(groups, null, 2));
      
      if (!Array.isArray(groups)) {
        return res.status(400).json({ error: "Groups must be an array" });
      }

      // Validate input
      for (const group of groups) {
        if (!group.id || typeof group.order !== 'number') {
          return res.status(400).json({ error: "Each group must have id and order" });
        }
      }

      // Update each group's order and verify success
      const results = await Promise.all(
        groups.map(async ({ id, order }) => {
          console.log(`[REORDER] Updating group ${id} to order ${order}`);
          const existingGroup = await storage.getEstimateGroup(id);
          console.log(`[REORDER] Existing group ${id}:`, existingGroup ? 'found' : 'NOT FOUND');
          
          const updated = await storage.updateEstimateGroup(id, { order });
          if (!updated) {
            console.log(`[REORDER] Failed to update group ${id}`);
            throw new Error(`Failed to update group ${id}`);
          }
          console.log(`[REORDER] Successfully updated group ${id}`);
          return updated;
        })
      );

      console.log('[REORDER] All groups updated successfully');
      res.json({ success: true, count: results.length });
    } catch (error: any) {
      console.error('[REORDER] Error:', error.message);
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message?.includes("Failed to update")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reorder groups" });
    }
  });

  app.patch("/api/estimate-groups/:id", async (req, res) => {
    try {
      const updateSchema = insertEstimateGroupSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.updateEstimateGroup(req.params.id, validationResult.data);
      if (!group) {
        return res.status(404).json({ error: "Estimate group not found" });
      }
      res.json(group);
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate group" });
    }
  });

  app.delete("/api/estimate-groups/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimateGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate group not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate group" });
    }
  });

  // Duplicate estimate group
  app.post("/api/estimate-groups/:id/duplicate", async (req, res) => {
    try {
      const newGroup = await storage.duplicateEstimateGroup(req.params.id);
      
      if (!newGroup) {
        return res.status(404).json({ error: "Failed to duplicate group" });
      }
      
      res.status(201).json(newGroup);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error duplicating estimate group:", error);
      res.status(500).json({ error: "Failed to duplicate estimate group" });
    }
  });

  // Copy estimate group to another estimate
  app.post("/api/estimate-groups/:id/copy", async (req, res) => {
    try {
      // Validate request body
      const requestSchema = z.object({
        targetEstimateId: z.string().min(1, "targetEstimateId is required")
      });
      
      const validationResult = requestSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const newGroup = await storage.copyGroupToEstimate(req.params.id, validationResult.data.targetEstimateId);
      
      if (!newGroup) {
        return res.status(404).json({ error: "Failed to copy group" });
      }
      
      res.status(201).json(newGroup);
    } catch (error: any) {
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      console.error("Error copying estimate group:", error);
      res.status(500).json({ error: "Failed to copy estimate group" });
    }
  });

  // Cost Codes API Routes (legacy project-scoped route - deprecated)
  app.get("/api/projects/:projectId/cost-codes", async (req, res) => {
    try {
      const costCodes = await storage.getCostCodes();
      res.json(costCodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cost codes" });
    }
  });

  app.post("/api/projects/:projectId/cost-codes", async (req, res) => {
    try {
      const validationResult = insertCostCodeSchema.safeParse({
        ...req.body,
        projectId: req.params.projectId
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const costCode = await storage.createCostCode(validationResult.data);
      res.status(201).json(costCode);
    } catch (error) {
      res.status(500).json({ error: "Failed to create cost code" });
    }
  });

  app.patch("/api/cost-codes/:id", async (req, res) => {
    try {
      const updateSchema = insertCostCodeSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const costCode = await storage.updateCostCode(req.params.id, validationResult.data);
      if (!costCode) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(costCode);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cost code" });
    }
  });

  app.delete("/api/cost-codes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCostCode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cost code" });
    }
  });

  // Versioning and Locking API Routes
  app.post("/api/estimates/:id/version", async (req, res) => {
    try {
      const newVersion = await storage.createEstimateVersion(req.params.id, req.body);
      res.status(201).json(newVersion);
    } catch (error: any) {
      if (error.message === "Estimate not found") {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate version" });
    }
  });

  app.post("/api/estimates/:id/lock", async (req, res) => {
    try {
      const lockedEstimate = await storage.lockEstimate(req.params.id);
      if (!lockedEstimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.json(lockedEstimate);
    } catch (error) {
      res.status(500).json({ error: "Failed to lock estimate" });
    }
  });

  app.post("/api/estimates/:id/unlock", async (req, res) => {
    try {
      const unlockedEstimate = await storage.unlockEstimate(req.params.id);
      if (!unlockedEstimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.json(unlockedEstimate);
    } catch (error) {
      res.status(500).json({ error: "Failed to unlock estimate" });
    }
  });

  // Summary Calculations API Route
  app.get("/api/estimates/:id/summary", async (req, res) => {
    try {
      const summary = await storage.getEstimateSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate estimate summary" });
    }
  });

  // Get full estimate data (estimate + groups + items) for proposals
  app.get("/api/estimates/:id/full", async (req, res) => {
    try {
      const estimate = await storage.getEstimate(req.params.id);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      
      const groups = await storage.getEstimateGroups(req.params.id);
      const items = await storage.getEstimateItems(req.params.id);
      
      res.json({
        estimate,
        groups,
        items
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate data" });
    }
  });

  // ============================================================
  // ESTIMATE NOTES API ROUTES
  // ============================================================

  // Get all notes for an estimate
  app.get("/api/estimates/:id/notes", requireAuth, async (req, res) => {
    try {
      const notes = await storage.getEstimateNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate notes" });
    }
  });

  // Create a new note for an estimate
  app.post("/api/estimates/:id/notes", requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const note = await storage.createEstimateNote({
        estimateId: req.params.id,
        userId,
        content: req.body.content,
      });
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create estimate note" });
    }
  });

  // Delete a note
  app.delete("/api/estimate-notes/:noteId", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteEstimateNote(req.params.noteId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: "Note not found" });
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to delete estimate note" });
    }
  });

  // ============================================================
  // SCOPE SECTION API ROUTES (Single Source of Truth)
  // ============================================================

  // Get all scope items for a project
  app.get("/api/projects/:projectId/scope", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getScopeItems(req.params.projectId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching scope items:", error);
      res.status(500).json({ error: "Failed to fetch scope items" });
    }
  });

  // Get a single scope item
  app.get("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const item = await storage.getScopeItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Scope item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching scope item:", error);
      res.status(500).json({ error: "Failed to fetch scope item" });
    }
  });

  // Create a new scope item
  app.post("/api/projects/:projectId/scope", requireAuth, requireTeamMember, async (req, res) => {
    try {
      console.log('POST /api/projects/:projectId/scope - req.params:', req.params);
      console.log('POST /api/projects/:projectId/scope - req.body:', req.body);
      console.log('POST /api/projects/:projectId/scope - req.user:', req.user);
      
      const validationResult = insertScopeItemSchema.omit({ projectId: true, companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const companyId = req.user!.companyId!;
      const newItem = await storage.createScopeItem({
        ...validationResult.data,
        projectId: req.params.projectId,
        companyId,
      });

      res.status(201).json(newItem);
    } catch (error) {
      console.error("Error creating scope item:", error);
      res.status(500).json({ error: "Failed to create scope item" });
    }
  });

  // Bulk create scope items
  app.post("/api/projects/:projectId/scope/bulk", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      const companyId = req.user!.companyId!;
      const itemsWithProject = items.map(item => ({
        ...item,
        projectId: req.params.projectId,
        companyId,
      }));

      const newItems = await storage.bulkCreateScopeItems(itemsWithProject);
      res.status(201).json(newItems);
    } catch (error) {
      console.error("Error bulk creating scope items:", error);
      res.status(500).json({ error: "Failed to bulk create scope items" });
    }
  });

  // Update a scope item
  app.patch("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const updateSchema = insertScopeItemSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedItem = await storage.updateScopeItem(req.params.id, validationResult.data);
      if (!updatedItem) {
        return res.status(404).json({ error: "Scope item not found" });
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Error updating scope item:", error);
      res.status(500).json({ error: "Failed to update scope item" });
    }
  });

  // Delete a scope item
  app.delete("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteScopeItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Scope item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting scope item:", error);
      res.status(500).json({ error: "Failed to delete scope item" });
    }
  });

  // Reorder scope items (with drag-drop support)
  app.post("/api/scope/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderScopeItems(updates);
      res.status(204).send();
    } catch (error) {
      console.error("Error reordering scope items:", error);
      res.status(500).json({ error: "Failed to reorder scope items" });
    }
  });

  // ============================================================
  // SCOPE STAGES (Editable Categories)
  // ============================================================

  // Get all scope stages for a project
  app.get("/api/projects/:projectId/scope-stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const stages = await storage.getScopeStages(req.params.projectId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching scope stages:", error);
      res.status(500).json({ error: "Failed to fetch scope stages" });
    }
  });

  // Create a new scope stage
  app.post("/api/projects/:projectId/scope-stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertScopeStageSchema.omit({ projectId: true, companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const companyId = req.user!.companyId!;
      const newStage = await storage.createScopeStage({
        ...validationResult.data,
        projectId: req.params.projectId,
        companyId,
      });

      res.status(201).json(newStage);
    } catch (error) {
      console.error("Error creating scope stage:", error);
      res.status(500).json({ error: "Failed to create scope stage" });
    }
  });

  // Update a scope stage (for inline editing)
  app.patch("/api/scope-stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const updateSchema = insertScopeStageSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedStage = await storage.updateScopeStage(req.params.id, validationResult.data);
      if (!updatedStage) {
        return res.status(404).json({ error: "Scope stage not found" });
      }

      res.json(updatedStage);
    } catch (error) {
      console.error("Error updating scope stage:", error);
      res.status(500).json({ error: "Failed to update scope stage" });
    }
  });

  // Delete a scope stage
  app.delete("/api/scope-stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteScopeStage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Scope stage not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting scope stage:", error);
      res.status(500).json({ error: "Failed to delete scope stage" });
    }
  });

  // Reorder scope stages (with drag-drop support)
  app.post("/api/scope-stages/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderScopeStages(updates);
      res.status(204).send();
    } catch (error) {
      console.error("Error reordering scope stages:", error);
      res.status(500).json({ error: "Failed to reorder scope stages" });
    }
  });

  // Initialize default stages for a project
  app.post("/api/projects/:projectId/scope-stages/initialize", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const projectId = req.params.projectId;
      
      // Verify project exists before initializing stages
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      const stages = await storage.initializeDefaultStages(projectId, companyId);
      res.status(201).json(stages);
    } catch (error) {
      console.error("Error initializing scope stages:", error);
      res.status(500).json({ error: "Failed to initialize scope stages" });
    }
  });

  // ============================================================
  // SCOPE TEMPLATES
  // ============================================================

  // Get all scope templates for company
  app.get("/api/scope-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const templates = await storage.getScopeTemplates(companyId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching scope templates:", error);
      res.status(500).json({ error: "Failed to fetch scope templates" });
    }
  });

  // Get a single scope template
  app.get("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const template = await storage.getScopeTemplate(req.params.id, companyId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching scope template:", error);
      res.status(500).json({ error: "Failed to fetch scope template" });
    }
  });

  // Create a scope template
  app.post("/api/scope-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const validationResult = insertScopeTemplateSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const newTemplate = await storage.createScopeTemplate({
        ...validationResult.data,
        companyId,
      });

      res.status(201).json(newTemplate);
    } catch (error) {
      console.error("Error creating scope template:", error);
      res.status(500).json({ error: "Failed to create scope template" });
    }
  });

  // Update a scope template
  app.patch("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const updateSchema = insertScopeTemplateSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedTemplate = await storage.updateScopeTemplate(req.params.id, validationResult.data, companyId);
      if (!updatedTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating scope template:", error);
      res.status(500).json({ error: "Failed to update scope template" });
    }
  });

  // Delete a scope template
  app.delete("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const success = await storage.deleteScopeTemplate(req.params.id, companyId);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting scope template:", error);
      res.status(500).json({ error: "Failed to delete scope template" });
    }
  });

  // Apply a template to a project
  app.post("/api/scope-templates/:id/apply", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { projectId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const items = await storage.applyScopeTemplate(req.params.id, projectId);
      res.status(201).json(items);
    } catch (error) {
      console.error("Error applying scope template:", error);
      res.status(500).json({ error: "Failed to apply scope template" });
    }
  });

  // Add a scope item to a template
  app.post("/api/scope-templates/:id/add-item", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { scopeItem } = req.body;
      
      if (!scopeItem) {
        return res.status(400).json({ error: "Scope item is required" });
      }

      const updatedTemplate = await storage.addItemToScopeTemplate(
        req.params.id, 
        scopeItem, 
        companyId
      );
      
      if (!updatedTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }

      res.json(updatedTemplate);
    } catch (error: any) {
      console.error("Error adding item to scope template:", error);
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to add item to template" });
    }
  });

  // ============================================================
  // SCOPE GEAR PHOTOS
  // ============================================================

  // Multer configuration for gear photo uploads
  const gearPhotoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'uploads/gear-photos/');
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '-' + file.originalname);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  });

  // Get gear photos for a scope item
  app.get("/api/scope/:scopeItemId/gear-photos", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const photos = await storage.getScopeGearPhotos(req.params.scopeItemId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching gear photos:", error);
      res.status(500).json({ error: "Failed to fetch gear photos" });
    }
  });

  // Upload a gear photo
  app.post("/api/scope/:scopeItemId/gear-photos", requireAuth, requireTeamMember, gearPhotoUpload.single('photo'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }

      const companyId = req.user!.companyId!;
      const photoData = {
        scopeItemId: req.params.scopeItemId,
        photoUrl: `/uploads/gear-photos/${req.file.filename}`,
        gearItemName: req.body.gearItemName || 'Unnamed Item',
        companyId,
      };

      const validationResult = insertScopeGearPhotoSchema.safeParse(photoData);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const newPhoto = await storage.createScopeGearPhoto(validationResult.data);
      res.status(201).json(newPhoto);
    } catch (error) {
      console.error("Error uploading gear photo:", error);
      res.status(500).json({ error: "Failed to upload gear photo" });
    }
  });

  // Delete a gear photo
  app.delete("/api/gear-photos/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteScopeGearPhoto(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Photo not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting gear photo:", error);
      res.status(500).json({ error: "Failed to delete gear photo" });
    }
  });

  // ============================================================
  // SCOPE INTEGRATION HELPERS
  // ============================================================

  // Push scope items to estimate
  app.post("/api/scope/push-to-estimate", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scopeItemIds, estimateId } = req.body;
      if (!scopeItemIds || !Array.isArray(scopeItemIds)) {
        return res.status(400).json({ error: "Scope item IDs must be an array" });
      }
      if (!estimateId) {
        return res.status(400).json({ error: "Estimate ID is required" });
      }

      const estimateItems = await storage.pushScopeToEstimate(scopeItemIds, estimateId);
      res.status(201).json(estimateItems);
    } catch (error) {
      console.error("Error pushing scope to estimate:", error);
      res.status(500).json({ error: "Failed to push scope to estimate" });
    }
  });

  // Create RFQ from scope items
  app.post("/api/scope/create-rfq", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scopeItemIds, projectId } = req.body;
      if (!scopeItemIds || !Array.isArray(scopeItemIds)) {
        return res.status(400).json({ error: "Scope item IDs must be an array" });
      }
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const rfq = await storage.createRfqFromScope(scopeItemIds, projectId);
      res.status(201).json(rfq);
    } catch (error) {
      console.error("Error creating RFQ from scope:", error);
      res.status(500).json({ error: "Failed to create RFQ from scope" });
    }
  });

  // Create PO from scope items
  app.post("/api/scope/create-po", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scopeItemIds, projectId } = req.body;
      if (!scopeItemIds || !Array.isArray(scopeItemIds)) {
        return res.status(400).json({ error: "Scope item IDs must be an array" });
      }
      if (!projectId) {
        return res.status(400).json({ error: "Project ID is required" });
      }

      const po = await storage.createPoFromScope(scopeItemIds, projectId);
      res.status(201).json(po);
    } catch (error) {
      console.error("Error creating PO from scope:", error);
      res.status(500).json({ error: "Failed to create PO from scope" });
    }
  });

  // Link scope item to schedule item
  app.post("/api/scope/:scopeItemId/link-schedule", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scheduleItemId } = req.body;
      if (!scheduleItemId) {
        return res.status(400).json({ error: "Schedule item ID is required" });
      }

      const updatedItem = await storage.linkScopeToScheduleItem(req.params.scopeItemId, scheduleItemId);
      if (!updatedItem) {
        return res.status(404).json({ error: "Scope item not found" });
      }

      res.json(updatedItem);
    } catch (error) {
      console.error("Error linking scope to schedule:", error);
      res.status(500).json({ error: "Failed to link scope to schedule" });
    }
  });

  // ============================================================
  // USER ROLE SYSTEM API ROUTES
  // ============================================================

  // ============================================================
  // EMAIL/PASSWORD AUTHENTICATION ROUTES
  // ============================================================
  
  // Register new user
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, name, companyName } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      if (!name || !companyName) {
        return res.status(400).json({ message: "Name and company name are required" });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      
      // Split name into first and last name
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(' ') || '';
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Step 1: Create user without company
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        userCategory: "team",
      });
      
      // Step 2: Create company with user as owner
      const company = await storage.createCompany({
        name: companyName,
      }, user.id);
      
      // Step 3: Update user with companyId
      await storage.updateUser(user.id, {
        companyId: company.id,
      });
      
      // Step 4: Fetch updated user with companyId
      const updatedUser = await storage.getUser(user.id);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to retrieve updated user" });
      }
      
      // Create session and explicitly save it
      (req.session as any).userId = user.id;
      
      // Force save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.status(201).json({ user: toSafeUser(updatedUser) });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });
  
  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      
      // Get user
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Verify password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Create session and explicitly save it
      (req.session as any).userId = user.id;
      
      // Force save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Failed to save session" });
        }
        res.json({ user: toSafeUser(user) });
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });
  
  // Logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
  
  // Get current authenticated user
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      // User is attached by isAuthenticated middleware
      const user = req.user;
      
      if (!user) {
        console.error('❌ [GET /api/auth/user] No user found!');
        return res.status(404).json({ message: "User not found" });
      }
      
      const safeUser = toSafeUser(user);
      
      // Fetch company nickname if user has a company
      let companyNickname = null;
      if (user.companyId) {
        const company = await storage.getCompany(user.companyId);
        companyNickname = company?.nickname || company?.name || null;
      }
      
      console.log('✅ [GET /api/auth/user] Returning user:', {
        id: safeUser.id,
        email: safeUser.email,
        companyId: safeUser.companyId,
        roleId: safeUser.roleId,
        companyNickname,
      });
      res.json({ ...safeUser, companyNickname });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update current user's profile (firstName, lastName, phone)
  app.patch('/api/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { firstName, lastName, phone } = req.body;

      // Update user profile
      const updatedUser = await storage.updateUser(userId, {
        firstName,
        lastName,
        phone,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(toSafeUser(updatedUser));
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Toggle Gmail sending preference
  app.post('/api/profile/gmail-sending', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { enabled } = req.body;
      
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled must be a boolean" });
      }

      // If enabling, verify user has Google account connected
      if (enabled) {
        const user = await storage.getUser(userId);
        if (!user?.googleCalendarAccessToken || !user?.googleCalendarRefreshToken) {
          return res.status(400).json({ 
            message: "Please connect your Google account first to enable Gmail sending" 
          });
        }
      }

      const updatedUser = await storage.updateUser(userId, {
        useGmailForSending: enabled,
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      console.log(`📧 Gmail sending ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
      
      res.json({ 
        success: true, 
        useGmailForSending: updatedUser.useGmailForSending 
      });
    } catch (error) {
      console.error("Error toggling Gmail sending:", error);
      res.status(500).json({ message: "Failed to update Gmail sending preference" });
    }
  });
  
  // ============================================================
  // GOOGLE CALENDAR OAUTH ROUTES
  // ============================================================

  // Initialize Google OAuth2 client for Google Calendar
  const getCalendarRedirectUri = () => {
    if (process.env.REPLIT_DOMAINS) {
      // Use the first domain from REPLIT_DOMAINS
      const domain = process.env.REPLIT_DOMAINS.split(',')[0];
      return `https://${domain}/api/google-calendar/callback`;
    }
    return 'http://localhost:5000/api/google-calendar/callback';
  };

  const calendarOauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getCalendarRedirectUri()
  );

  // Initiate Google Calendar OAuth flow
  app.get('/api/google-calendar/initiate', async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Generate CSRF protection state token
      const state = randomBytes(32).toString('hex');
      
      // Store user ID and state in session for callback verification
      (req.session as any).googleOAuthUserId = userId;
      (req.session as any).googleOAuthState = state;

      const authUrl = calendarOauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/calendar'],
        prompt: 'consent', // Force consent to get refresh token
        state: state, // CSRF protection
      });

      res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Google OAuth:", error);
      res.status(500).json({ message: "Failed to initiate OAuth" });
    }
  });

  // Handle Google Calendar OAuth callback
  app.get('/api/google-calendar/callback', async (req: any, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      const userId = (req.session as any)?.googleOAuthUserId;
      const storedState = (req.session as any)?.googleOAuthState;

      // Handle OAuth errors from Google
      if (oauthError) {
        console.error("OAuth error from Google:", oauthError);
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect(`/profile?error=oauth_denied`);
      }

      if (!code) {
        console.error("No authorization code received");
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect('/profile?error=no_code');
      }

      if (!userId) {
        console.error("No userId in session");
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect('/profile?error=session_expired');
      }

      // Verify CSRF state token
      if (!state || !storedState || state !== storedState) {
        console.error("State mismatch - CSRF protection triggered");
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect('/profile?error=invalid_state');
      }

      // Exchange code for tokens
      const { tokens } = await calendarOauth2Client.getToken(code as string);
      
      // Validate tokens received
      if (!tokens.access_token) {
        console.error("No access token received from Google");
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect('/profile?error=no_token');
      }

      calendarOauth2Client.setCredentials(tokens);

      // Get user's Google account email
      const oauth2 = google.oauth2({ version: 'v2', auth: calendarOauth2Client });
      const { data } = await oauth2.userinfo.get();

      // Update user with Google Calendar tokens
      await storage.updateUser(userId, {
        googleCalendarAccessToken: tokens.access_token,
        googleCalendarRefreshToken: tokens.refresh_token || null,
        googleCalendarEmail: data.email || null,
        googleCalendarTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleCalendarConnectedAt: new Date(),
      });

      // Clear OAuth session data
      delete (req.session as any).googleOAuthUserId;
      delete (req.session as any).googleOAuthState;

      res.redirect('/profile?success=calendar_connected');
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      // Clear session data on error
      delete (req.session as any).googleOAuthUserId;
      delete (req.session as any).googleOAuthState;
      res.redirect('/profile?error=oauth_failed');
    }
  });

  // Disconnect Google Calendar (legacy endpoint - use /api/google-calendar/disconnect instead)
  app.post('/api/google-calendar/legacy-disconnect', async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Revoke Google token if exists
      if (user.googleCalendarAccessToken) {
        try {
          await calendarOauth2Client.revokeToken(user.googleCalendarAccessToken);
        } catch (revokeError) {
          console.error("Error revoking Google token:", revokeError);
          // Continue anyway to clear local tokens
        }
      }

      // Clear Google Calendar tokens from database
      await storage.updateUser(userId, {
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarEmail: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Google Calendar:", error);
      res.status(500).json({ message: "Failed to disconnect calendar" });
    }
  });

  // ============================================================
  // GOOGLE CALENDAR PER-USER OAUTH ROUTES
  // ============================================================
  
  // Get Google Calendar connection status
  app.get('/api/google-calendar/status', requireAuth, async (req: any, res) => {
    try {
      const { GoogleOAuthService } = await import('./services/googleOAuthService');
      const oauthService = new GoogleOAuthService(storage);
      const status = await oauthService.getConnectionStatus(req.user.id);
      console.log('📅 [Google Calendar Status]', {
        userId: req.user.id,
        connected: status.connected,
        email: status.email,
        tokenExpiry: status.tokenExpiry,
        isExpired: status.isExpired,
        connectedAt: status.connectedAt,
      });
      res.json(status);
    } catch (error) {
      console.error("Error getting Google Calendar status:", error);
      res.json({ connected: false, email: null });
    }
  });

  // Get OAuth URL to initiate connection
  app.get('/api/google-calendar/auth-url', requireAuth, async (req: any, res) => {
    try {
      const { GoogleOAuthService } = await import('./services/googleOAuthService');
      const oauthService = new GoogleOAuthService(storage);
      const authUrl = oauthService.generateAuthUrl(req.user.id);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Error generating Google OAuth URL:", error);
      res.status(500).json({ 
        message: error.message || "Failed to generate OAuth URL" 
      });
    }
  });

  // OAuth callback handler
  app.get('/api/google-calendar/callback', async (req: any, res) => {
    try {
      const { code, state, error } = req.query;
      
      if (error) {
        return res.redirect(`/?google_calendar_error=${encodeURIComponent(error)}`);
      }
      
      if (!code || !state) {
        return res.redirect('/?google_calendar_error=missing_params');
      }
      
      const { GoogleOAuthService } = await import('./services/googleOAuthService');
      const oauthService = new GoogleOAuthService(storage);
      
      await oauthService.handleCallback(code, state);
      
      res.redirect('/profile?google_calendar_success=true');
    } catch (error: any) {
      console.error("Error handling Google OAuth callback:", error);
      res.redirect(`/profile?google_calendar_error=${encodeURIComponent(error.message || 'callback_failed')}`);
    }
  });

  // Disconnect Google Calendar
  app.post('/api/google-calendar/disconnect', requireAuth, async (req: any, res) => {
    try {
      const { GoogleOAuthService } = await import('./services/googleOAuthService');
      const oauthService = new GoogleOAuthService(storage);
      await oauthService.disconnectCalendar(req.user.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Google Calendar:", error);
      res.status(500).json({ message: "Failed to disconnect calendar" });
    }
  });

  // Get Google Calendar events
  app.get('/api/google-calendar/events', requireAuth, async (req: any, res) => {
    try {
      const { GoogleOAuthService } = await import('./services/googleOAuthService');
      const oauthService = new GoogleOAuthService(storage);
      
      console.log('🔍 [Google Calendar] Fetching events for user:', req.user.id);
      
      const status = await oauthService.getConnectionStatus(req.user.id);
      console.log('🔍 [Google Calendar] Connection status:', {
        connected: status.connected,
        email: status.email,
        isExpired: status.isExpired,
        tokenExpiry: status.tokenExpiry,
      });
      
      if (!status.connected) {
        console.log('⚠️ [Google Calendar] Not connected, returning empty events');
        return res.json([]);
      }

      if (status.isExpired) {
        console.log('⚠️ [Google Calendar] Token is expired, needs reconnection');
        return res.status(401).json({ 
          error: 'token_expired',
          message: 'Your Google Calendar connection has expired. Please reconnect to continue syncing events.' 
        });
      }

      const calendar = await oauthService.getCalendarClient(req.user.id);
      
      // Get events for the next 3 months and past 1 month
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1);
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 3);

      console.log('🔍 [Google Calendar] Fetching events from Google API...', {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
      });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });

      const eventCount = response.data.items?.length || 0;
      console.log(`✅ [Google Calendar] Retrieved ${eventCount} events from Google API`);

      const events = (response.data.items || []).map((event: any) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        const isAllDay = !event.start?.dateTime;

        // For all-day events, Google Calendar uses exclusive end dates
        // (e.g., a 1-day event on May 1st has end date May 2nd)
        // We need to subtract one day to get the actual end date
        let endDate = end ? new Date(end) : new Date();
        if (isAllDay && end) {
          endDate = new Date(end);
          endDate.setDate(endDate.getDate() - 1);
        }

        // Extract time from ISO string to avoid timezone conversion issues
        const extractTime = (dateTimeStr: string | undefined) => {
          if (!dateTimeStr) return null;
          try {
            // ISO format: 2024-01-15T14:30:00+10:00
            const timePart = dateTimeStr.split('T')[1];
            if (!timePart) return null;
            // Extract HH:MM from the time part
            const [hours, minutes] = timePart.split(':');
            return `${hours}:${minutes}`;
          } catch {
            return null;
          }
        };

        return {
          id: `google-${event.id}`,
          title: event.summary || '(No title)',
          startDate: start ? new Date(start) : new Date(),
          endDate,
          startTime: isAllDay ? null : extractTime(event.start?.dateTime),
          endTime: isAllDay ? null : extractTime(event.end?.dateTime),
          type: 'google-calendar' as const,
          color: '#4285f4', // Google Calendar blue
          description: event.description || null,
          location: event.location || null,
          isCompleted: false,
        };
      });

      res.json(events);
    } catch (error: any) {
      console.error("❌ [Google Calendar] Error fetching events:", {
        error: error.message,
        stack: error.stack,
        code: error.code,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // Check if it's a token expiration error
      if (error.response?.status === 401 || error.code === 'invalid_grant') {
        return res.status(401).json({ 
          error: 'token_expired',
          message: 'Your Google Calendar connection has expired. Please reconnect to continue syncing events.' 
        });
      }
      
      // Return empty array for other errors to avoid breaking the UI
      res.json([]);
    }
  });

  // ============================================================
  // GOOGLE DRIVE INTEGRATION (Company-level)
  // ============================================================

  // Get Google Drive connection status
  app.get('/api/google-drive/status', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const status = await driveService.getConnectionStatus(req.user.companyId);
      res.json(status);
    } catch (error: any) {
      console.error("Error getting Google Drive status:", error);
      res.status(500).json({ message: "Failed to get Drive status", error: error.message });
    }
  });

  // Save Google Drive OAuth credentials (admin only)
  app.post('/api/google-drive/credentials', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { clientId, clientSecret } = req.body;
      
      if (!clientId || !clientSecret) {
        return res.status(400).json({ message: "Client ID and Client Secret are required" });
      }
      
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      await driveService.saveCredentials(req.user.companyId, clientId, clientSecret);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving Google Drive credentials:", error);
      res.status(500).json({ message: "Failed to save credentials", error: error.message });
    }
  });

  // Get auth URL to connect Google Drive (admin only)
  app.get('/api/google-drive/auth-url', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const host = req.get('host') || 'localhost:5000';
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const authUrl = await driveService.generateAuthUrl(req.user.companyId, req.user.id, host);
      res.json({ authUrl });
    } catch (error: any) {
      console.error("Error generating Google Drive auth URL:", error);
      res.status(500).json({ message: "Failed to generate auth URL", error: error.message });
    }
  });

  // OAuth callback for Google Drive
  app.get('/api/google-drive/callback', async (req: any, res) => {
    try {
      const { code, state, error } = req.query;
      
      if (error) {
        console.error("Google Drive OAuth error:", error);
        return res.redirect(`/settings?google_drive_error=${encodeURIComponent(error)}`);
      }

      if (!code || !state) {
        return res.redirect('/settings?google_drive_error=missing_params');
      }
      
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      
      await driveService.handleCallback(code, state);
      
      res.redirect('/settings?tab=integrations&google_drive_success=true');
    } catch (error: any) {
      console.error("Error handling Google Drive OAuth callback:", error);
      res.redirect(`/settings?tab=integrations&google_drive_error=${encodeURIComponent(error.message || 'callback_failed')}`);
    }
  });

  // Disconnect Google Drive (admin only)
  app.post('/api/google-drive/disconnect', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      await driveService.disconnectDrive(req.user.companyId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error disconnecting Google Drive:", error);
      res.status(500).json({ message: "Failed to disconnect Drive", error: error.message });
    }
  });

  // List shared drives
  app.get('/api/google-drive/shared-drives', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const sharedDrives = await driveService.listSharedDrives(req.user.companyId);
      res.json(sharedDrives);
    } catch (error: any) {
      console.error("Error listing shared drives:", error);
      res.status(500).json({ message: "Failed to list shared drives", error: error.message });
    }
  });

  // Set root folder (admin only)
  app.post('/api/google-drive/root-folder', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const { folderId } = req.body;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      await driveService.setRootFolder(req.user.companyId, folderId || null);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error setting root folder:", error);
      res.status(500).json({ message: "Failed to set root folder", error: error.message });
    }
  });

  // List files in a folder
  app.get('/api/google-drive/files', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { folderId, foldersOnly } = req.query;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      let files = await driveService.listFiles(req.user.companyId, folderId as string | undefined);
      
      if (foldersOnly === 'true') {
        files = files.filter(f => f.isFolder);
      }
      
      res.json(files);
    } catch (error: any) {
      console.error("Error listing files:", error.message);
      if (error.message?.includes('not connected') || error.code === 'TOKEN_REFRESH_FAILED' || error.code === 'TOKEN_DECRYPT_FAILED') {
        return res.status(401).json({ 
          error: 'session_expired', 
          message: error.message || 'Google Drive session expired. Please reconnect in Company Settings.',
          needsReconnect: true
        });
      }
      res.status(500).json({ message: "Failed to list files", error: error.message });
    }
  });

  // Get folder path for breadcrumbs
  app.get('/api/google-drive/folder-path/:folderId', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { folderId } = req.params;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const path = await driveService.getFolderPath(req.user.companyId, folderId);
      res.json(path);
    } catch (error: any) {
      console.error("Error getting folder path:", error);
      res.status(500).json({ message: "Failed to get folder path", error: error.message });
    }
  });

  // Get single file details
  app.get('/api/google-drive/files/:fileId', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { fileId } = req.params;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const file = await driveService.getFile(req.user.companyId, fileId);
      res.json(file);
    } catch (error: any) {
      console.error("Error getting file:", error);
      res.status(500).json({ message: "Failed to get file", error: error.message });
    }
  });

  // Create folder
  app.post('/api/google-drive/folders', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { name, parentId } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Folder name is required" });
      }
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const folder = await driveService.createFolder(req.user.companyId, name, parentId);
      res.json(folder);
    } catch (error: any) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder", error: error.message });
    }
  });

  // Download file
  app.get('/api/google-drive/download/:fileId', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { fileId } = req.params;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const { data, mimeType, name } = await driveService.downloadFile(req.user.companyId, fileId);
      
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
      res.send(data);
    } catch (error: any) {
      console.error("Error downloading file:", error);
      res.status(500).json({ message: "Failed to download file", error: error.message });
    }
  });

  // Delete file
  app.delete('/api/google-drive/files/:fileId', requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { fileId } = req.params;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      await driveService.deleteFile(req.user.companyId, fileId);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting file:", error);
      res.status(500).json({ message: "Failed to delete file", error: error.message });
    }
  });

  // ============================================================
  // FOLDER TEMPLATES ROUTES
  // ============================================================
  
  // Get all folder templates for company
  app.get("/api/folder-templates", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const templates = await storage.getFolderTemplates(req.user.companyId);
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching folder templates:", error);
      res.status(500).json({ error: "Failed to fetch folder templates" });
    }
  });

  // Get single folder template
  app.get("/api/folder-templates/:id", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const template = await storage.getFolderTemplate(req.params.id, req.user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Folder template not found" });
      }
      res.json(template);
    } catch (error: any) {
      console.error("Error fetching folder template:", error);
      res.status(500).json({ error: "Failed to fetch folder template" });
    }
  });

  // Create folder template
  app.post("/api/folder-templates", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const template = await storage.createFolderTemplate({
        ...req.body,
        companyId: req.user.companyId,
        createdBy: req.user.id,
      });
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating folder template:", error);
      res.status(500).json({ error: "Failed to create folder template" });
    }
  });

  // Update folder template
  app.patch("/api/folder-templates/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const template = await storage.updateFolderTemplate(req.params.id, req.body, req.user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Folder template not found" });
      }
      res.json(template);
    } catch (error: any) {
      console.error("Error updating folder template:", error);
      res.status(500).json({ error: "Failed to update folder template" });
    }
  });

  // Delete folder template
  app.delete("/api/folder-templates/:id", requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const deleted = await storage.deleteFolderTemplate(req.params.id, req.user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Folder template not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting folder template:", error);
      res.status(500).json({ error: "Failed to delete folder template" });
    }
  });

  // Apply folder template to create folders in Google Drive for a project
  app.post("/api/folder-templates/:id/apply", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { projectId, parentFolderId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const template = await storage.getFolderTemplate(req.params.id, req.user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Folder template not found" });
      }

      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      
      // Get the project to use its name for the root folder
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Create the folder structure recursively
      const createFoldersRecursively = async (folders: any[], parentId: string | undefined): Promise<any[]> => {
        const results = [];
        for (const folder of folders) {
          const created = await driveService.createFolder(req.user.companyId, folder.name, parentId);
          const result: any = { name: folder.name, id: created.id };
          if (folder.children && folder.children.length > 0) {
            result.children = await createFoldersRecursively(folder.children, created.id);
          }
          results.push(result);

          // Log the folder creation
          await storage.createDriveFileActivityLog({
            companyId: req.user.companyId,
            projectId,
            action: "create_folder",
            driveFileId: created.id,
            fileName: folder.name,
            userId: req.user.id,
            userName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email,
            details: { templateId: template.id, templateName: template.name },
          });
        }
        return results;
      };

      const folderStructure = template.folderStructure as any[] || [];
      const createdFolders = await createFoldersRecursively(folderStructure, parentFolderId);

      res.json({ success: true, folders: createdFolders });
    } catch (error: any) {
      console.error("Error applying folder template:", error);
      res.status(500).json({ error: "Failed to apply folder template", message: error.message });
    }
  });

  // ============================================================
  // DRIVE FILE ATTACHMENTS ROUTES
  // ============================================================

  // Get file attachments for an entity
  app.get("/api/drive-attachments/:type/:id", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const attachments = await storage.getDriveFileAttachments(
        req.params.type,
        req.params.id,
        req.user.companyId
      );
      res.json(attachments);
    } catch (error: any) {
      console.error("Error fetching drive attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  // Create file attachment
  app.post("/api/drive-attachments", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const attachment = await storage.createDriveFileAttachment({
        ...req.body,
        companyId: req.user.companyId,
        attachedBy: req.user.id,
      });
      res.status(201).json(attachment);
    } catch (error: any) {
      console.error("Error creating drive attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Delete file attachment
  app.delete("/api/drive-attachments/:id", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const deleted = await storage.deleteDriveFileAttachment(req.params.id, req.user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting drive attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  // ============================================================
  // DRIVE FILE ACTIVITY LOGS ROUTES
  // ============================================================

  // Get activity logs for company or project
  app.get("/api/drive-activity", requireAuth, requireTeamMember, async (req: any, res) => {
    try {
      const { projectId, limit } = req.query;
      const logs = await storage.getDriveFileActivityLogs(
        req.user.companyId,
        projectId as string | undefined,
        limit ? parseInt(limit as string) : undefined
      );
      res.json(logs);
    } catch (error: any) {
      console.error("Error fetching drive activity logs:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });

  // ============================================================
  // COMPANY ROUTES
  // ============================================================
  
  // Create company (onboarding)
  app.post("/api/companies", async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if user already has a company
      if (user.companyId) {
        return res.status(400).json({ message: "User already belongs to a company" });
      }
      
      // Create company
      const company = await storage.createCompany(req.body, userId);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });

  // Check if current user can approve bills
  app.get("/api/user/can-approve-bills", async (req, res) => {
    try {
      if (!req.user) {
        return res.json(false);
      }
      const canApprove = await storage.canUserApproveBills(req.user.id);
      res.json(canApprove);
    } catch (error) {
      console.error("Error checking bill approval permission:", error);
      res.json(false);
    }
  });

  // User Management Routes
  app.get("/api/users", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { category } = req.query;
      // SECURITY: Filter users by company to prevent cross-tenant data leak
      const users = await storage.getUsersByCompanyWithRoles(currentUser.companyId, category as any);
      // Use safe user helper to remove passwords
      const safeUsers = users.map(user => toSafeUser(user));
      res.json(safeUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const currentUser = req.user as any;
      const requestedUserId = req.params.id;
      
      if (!currentUser?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Allow users to always view their own profile
      const isOwnProfile = String(currentUser?.id) === String(requestedUserId);
      
      // If not own profile, check admin.users view permission
      if (!isOwnProfile) {
        const hasPermission = await storage.checkUserPermission(currentUser.id, "admin.users", "view");
        if (!hasPermission) {
          return res.status(403).json({ error: "Permission denied" });
        }
      }
      
      const user = await storage.getUserWithRole(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Security: Ensure user is in same company (prevents cross-tenant access)
      if (user.companyId !== currentUser.companyId) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Use safe user helper consistently
      res.json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  app.post("/api/users", requireTeamMember, requirePermission("admin.users", "add"), async (req, res) => {
    try {
      // Validate password strength first
      if (req.body.password) {
        const passwordValidation = PasswordUtils.validatePasswordStrength(req.body.password);
        if (!passwordValidation.isValid) {
          return res.status(400).json({ 
            error: "Password validation failed", 
            details: passwordValidation.errors 
          });
        }
      }

      const validationResult = insertUserSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const user = await storage.createUser(validationResult.data);
      // Use safe user helper to remove password
      res.status(201).json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/users/:id", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
      // Validate password strength if password is being updated
      if (req.body.password) {
        const passwordValidation = PasswordUtils.validatePasswordStrength(req.body.password);
        if (!passwordValidation.isValid) {
          return res.status(400).json({ 
            error: "Password validation failed", 
            details: passwordValidation.errors 
          });
        }
      }

      const updateSchema = insertUserSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const user = await storage.updateUser(req.params.id, validationResult.data);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      // Use safe user helper to remove password
      res.json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Change password endpoint with strong validation
  app.post("/api/users/:id/change-password", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      const user = await storage.changeUserPassword(req.params.id, newPassword);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      if (error.message?.includes("Password validation failed")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // Send password reset link to user (manager-initiated)
  app.post("/api/users/:id/send-password-reset", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser || !targetUser.email) {
        return res.status(404).json({ error: "User not found or has no email" });
      }
      
      // Generate a secure reset token
      const crypto = require("crypto");
      const plainToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      // Hash the token before storing (security best practice)
      const tokenHash = crypto.createHash("sha256").update(plainToken).digest("hex");
      
      // Store the HASHED token in database - must succeed before sending email
      await storage.createPasswordResetToken({
        userId: targetUser.id,
        token: tokenHash, // Store hash, not plain token
        expiresAt,
        requestedBy: req.user!.id,
      });
      
      // Send reset email with PLAIN token (user receives unhashed token)
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${req.get('host')}` 
        : `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${baseUrl}/reset-password?token=${plainToken}&email=${encodeURIComponent(targetUser.email)}`;
      
      try {
        const { sendEmail } = require("./utils/emailService");
        await sendEmail({
          to: targetUser.email,
          subject: "Reset Your BuildPro Password",
          html: `
            <h2>Password Reset Request</h2>
            <p>Hi ${targetUser.firstName || 'there'},</p>
            <p>Your team administrator has requested a password reset for your BuildPro account.</p>
            <p>Click the link below to set a new password:</p>
            <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #bba7db; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a></p>
            <p>This link will expire in 24 hours.</p>
            <p>If you did not request this, please ignore this email or contact your administrator.</p>
            <p>Thanks,<br>The BuildPro Team</p>
          `,
          text: `Password Reset Request\n\nYour team administrator has requested a password reset. Visit this link to set a new password: ${resetUrl}\n\nThis link will expire in 24 hours.`,
        });
        
        res.json({ message: "Password reset email sent successfully" });
      } catch (emailError: any) {
        console.error("Failed to send password reset email:", emailError);
        res.status(500).json({ error: "Failed to send reset email. Please check email configuration." });
      }
    } catch (error: any) {
      console.error("Password reset error:", error);
      res.status(500).json({ error: "Failed to initiate password reset" });
    }
  });

  // User Column Preferences Routes
  app.get("/api/user-column-preferences/:pageKey", requireAuth, async (req, res) => {
    try {
      const preferences = await storage.getUserColumnPreferences(req.user!.id, req.params.pageKey);
      res.json(preferences || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch column preferences" });
    }
  });

  app.post("/api/user-column-preferences", requireAuth, async (req, res) => {
    try {
      const validationResult = insertUserColumnPreferencesSchema.safeParse({
        ...req.body,
        userId: req.user!.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const preferences = await storage.saveUserColumnPreferences(validationResult.data);
      res.json(preferences);
    } catch (error) {
      res.status(500).json({ error: "Failed to save column preferences" });
    }
  });

  // User View Preferences Routes
  app.get("/api/user-view-preferences/:viewKey", requireAuth, async (req, res) => {
    try {
      const preferences = await storage.getUserViewPreferences(req.user!.id, req.params.viewKey);
      res.json(preferences || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch view preferences" });
    }
  });

  app.post("/api/user-view-preferences", requireAuth, async (req, res) => {
    try {
      const validationResult = insertUserViewPreferencesSchema.safeParse({
        ...req.body,
        userId: req.user!.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const preferences = await storage.saveUserViewPreferences(validationResult.data);
      res.json(preferences);
    } catch (error) {
      res.status(500).json({ error: "Failed to save view preferences" });
    }
  });

  // Dashboard Views Routes
  app.get("/api/dashboard-views", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const viewType = req.query.viewType as "personal" | "business" | undefined;
      const views = await storage.getDashboardViews(companyId, user.id, viewType);
      res.json(views);
    } catch (error) {
      console.error("Error fetching dashboard views:", error);
      res.status(500).json({ error: "Failed to fetch dashboard views" });
    }
  });

  // Get company default dashboard for a view type
  app.get("/api/dashboard-views/company-default/:viewType", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const viewType = req.params.viewType as "personal" | "business";
      if (!["personal", "business"].includes(viewType)) {
        return res.status(400).json({ error: "Invalid view type" });
      }
      
      const view = await storage.getCompanyDefaultDashboard(companyId, viewType);
      res.json(view || null);
    } catch (error) {
      console.error("Error fetching company default dashboard:", error);
      res.status(500).json({ error: "Failed to fetch company default dashboard" });
    }
  });

  app.get("/api/dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const view = await storage.getDashboardView(req.params.id, companyId);
      if (!view) {
        return res.status(404).json({ error: "Dashboard view not found" });
      }
      res.json(view);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard view" });
    }
  });

  app.post("/api/dashboard-views", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const validationResult = insertDashboardViewSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const view = await storage.createDashboardView({
        ...validationResult.data,
        companyId,
        creatorId: user.id,
      });

      // If permissions were provided, set them
      if (req.body.roleIds || req.body.userIds) {
        await storage.setDashboardViewPermissions(view.id, {
          roleIds: req.body.roleIds,
          userIds: req.body.userIds,
        });
      }

      res.status(201).json(view);
    } catch (error) {
      console.error("Error creating dashboard view:", error);
      res.status(500).json({ error: "Failed to create dashboard view" });
    }
  });

  app.patch("/api/dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if user has permission to update (is creator or admin)
      const existingView = await storage.getDashboardView(req.params.id, companyId);
      if (!existingView) {
        return res.status(404).json({ error: "Dashboard view not found" });
      }
      
      // Only allow creator to update their own views
      if (existingView.creatorId !== user.id) {
        return res.status(403).json({ error: "You can only edit your own views" });
      }

      const view = await storage.updateDashboardView(req.params.id, req.body, companyId);

      // If permissions were provided, update them
      if (req.body.roleIds !== undefined || req.body.userIds !== undefined) {
        await storage.setDashboardViewPermissions(req.params.id, {
          roleIds: req.body.roleIds,
          userIds: req.body.userIds,
        });
      }

      res.json(view);
    } catch (error) {
      res.status(500).json({ error: "Failed to update dashboard view" });
    }
  });

  app.delete("/api/dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if user has permission to delete (is creator)
      const existingView = await storage.getDashboardView(req.params.id, companyId);
      if (!existingView) {
        return res.status(404).json({ error: "Dashboard view not found" });
      }
      
      if (existingView.creatorId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own views" });
      }

      await storage.deleteDashboardView(req.params.id, companyId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete dashboard view" });
    }
  });

  // Set a view as company default
  app.post("/api/dashboard-views/:id/set-company-default", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if view exists
      const existingView = await storage.getDashboardView(req.params.id, companyId);
      if (!existingView) {
        return res.status(404).json({ error: "Dashboard view not found" });
      }
      
      // Check if user has permission - must be creator or admin/manager
      const userRole = await storage.getUserRole(user.roleId);
      const isAdminOrManager = userRole && (userRole.name === "Admin" || userRole.name === "Manager");
      const isCreator = existingView.creatorId === user.id;
      
      if (!isAdminOrManager && !isCreator) {
        return res.status(403).json({ error: "Only admins, managers, or the view creator can set company defaults" });
      }
      
      await storage.setCompanyDefaultView(req.params.id, companyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting company default view:", error);
      res.status(500).json({ error: "Failed to set company default view" });
    }
  });

  // Get Dashboard View Permissions
  app.get("/api/dashboard-views/:id/permissions", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if view exists and belongs to the company
      const view = await storage.getDashboardView(req.params.id, companyId);
      if (!view) {
        return res.status(404).json({ error: "Dashboard view not found" });
      }
      
      const permissions = await storage.getDashboardViewPermissions(req.params.id);
      
      // Extract roleIds and userIds from permissions
      const roleIds = permissions.filter(p => p.roleId).map(p => p.roleId as string);
      const userIds = permissions.filter(p => p.userId).map(p => p.userId as string);
      
      res.json({ roleIds, userIds });
    } catch (error) {
      console.error("Error fetching dashboard view permissions:", error);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  // User Dashboard Preference (active view)
  app.get("/api/dashboard-preference", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const preference = await storage.getUserDashboardPreference(user.id, companyId);
      res.json(preference || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch dashboard preference" });
    }
  });

  app.post("/api/dashboard-preference", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { activeViewId } = req.body;
      const preference = await storage.setUserDashboardPreference(user.id, companyId, activeViewId);
      res.json(preference);
    } catch (error) {
      res.status(500).json({ error: "Failed to save dashboard preference" });
    }
  });

  // Dashboard Theme Customization Routes
  app.get("/api/dashboard-themes/:dashboardType", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { dashboardType } = req.params;
      const { projectId } = req.query;
      
      const theme = await storage.getDashboardTheme(
        user.id, 
        companyId, 
        dashboardType,
        projectId as string | undefined
      );
      res.json(theme || null);
    } catch (error) {
      console.error("Error fetching dashboard theme:", error);
      res.status(500).json({ error: "Failed to fetch dashboard theme" });
    }
  });

  app.post("/api/dashboard-themes", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      console.log("[dashboard-themes] Received body:", JSON.stringify(req.body, null, 2));
      
      const themeData = {
        ...req.body,
        userId: user.id,
        companyId,
      };
      
      console.log("[dashboard-themes] Saving themeData:", JSON.stringify(themeData, null, 2));
      
      const theme = await storage.saveDashboardTheme(themeData);
      console.log("[dashboard-themes] Saved theme result:", JSON.stringify(theme, null, 2));
      res.json(theme);
    } catch (error) {
      console.error("Error saving dashboard theme:", error);
      res.status(500).json({ error: "Failed to save dashboard theme" });
    }
  });

  app.delete("/api/dashboard-themes/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      await storage.deleteDashboardTheme(req.params.id, companyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting dashboard theme:", error);
      res.status(500).json({ error: "Failed to delete dashboard theme" });
    }
  });

  // Business Dashboard Views Routes (with access control)
  app.get("/api/business-dashboard-views", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Ensure default view exists for this company
      await storage.ensureDefaultBusinessDashboardView(companyId);
      
      const views = await storage.getBusinessDashboardViews(companyId, user.id, user.roleId);
      res.json(views);
    } catch (error) {
      console.error("Error fetching business dashboard views:", error);
      res.status(500).json({ error: "Failed to fetch dashboard views" });
    }
  });

  app.get("/api/business-dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const view = await storage.getBusinessDashboardView(req.params.id, companyId, user.id, user.roleId);
      if (!view) {
        return res.status(404).json({ error: "View not found or access denied" });
      }
      res.json(view);
    } catch (error) {
      console.error("Error fetching dashboard view:", error);
      res.status(500).json({ error: "Failed to fetch dashboard view" });
    }
  });

  app.post("/api/business-dashboard-views", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const viewData = {
        ...req.body,
        companyId,
        createdById: user.id,
      };
      
      const view = await storage.createBusinessDashboardView(viewData);
      res.json(view);
    } catch (error) {
      console.error("Error creating dashboard view:", error);
      res.status(500).json({ error: "Failed to create dashboard view" });
    }
  });

  app.patch("/api/business-dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if user can access this view first (visibility check)
      const existingView = await storage.getBusinessDashboardView(req.params.id, companyId, user.id, user.roleId);
      if (!existingView) {
        return res.status(404).json({ error: "View not found or access denied" });
      }
      
      // For editing: allow if user is creator, is admin, or if it's the default "everyone" view
      const isCreator = existingView.createdById === user.id;
      const isAdmin = await storage.checkUserPermission(user.id, "admin.company", "edit");
      const isDefaultEveryoneView = existingView.isDefault && existingView.visibility === "everyone";
      
      if (!isCreator && !isAdmin && !isDefaultEveryoneView) {
        return res.status(403).json({ error: "You don't have permission to edit this view" });
      }
      
      // Validate that only allowed fields are updated
      const allowedFields = ['name', 'widgets', 'visibility', 'allowedRoleIds', 'allowedUserIds', 'displayOrder'];
      const updates: Record<string, any> = {};
      for (const key of allowedFields) {
        if (req.body[key] !== undefined) {
          updates[key] = req.body[key];
        }
      }
      
      const view = await storage.updateBusinessDashboardView(req.params.id, companyId, updates);
      res.json(view);
    } catch (error) {
      console.error("Error updating dashboard view:", error);
      res.status(500).json({ error: "Failed to update dashboard view" });
    }
  });

  app.delete("/api/business-dashboard-views/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // Check if user can access this view first (visibility check)
      const existingView = await storage.getBusinessDashboardView(req.params.id, companyId, user.id, user.roleId);
      if (!existingView) {
        return res.status(404).json({ error: "View not found or access denied" });
      }
      
      // Cannot delete default view
      if (existingView.isDefault) {
        return res.status(400).json({ error: "Cannot delete the default view" });
      }
      
      // Allow delete if user is creator or has admin permission
      const isCreator = existingView.createdById === user.id;
      const isAdmin = await storage.checkUserPermission(user.id, "admin.company", "delete");
      
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ error: "You don't have permission to delete this view" });
      }
      
      await storage.deleteBusinessDashboardView(req.params.id, companyId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting dashboard view:", error);
      res.status(500).json({ error: "Failed to delete dashboard view" });
    }
  });

  // User Role Management Routes
  app.get("/api/user-roles", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { category } = req.query;
      const roles = await storage.getUserRoles(category as any, companyId);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });

  app.get("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const role = await storage.getUserRole(req.params.id, companyId);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user role" });
    }
  });

  app.post("/api/user-roles", requireAuth, requireTeamMember, requirePermission("admin.roles", "add"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const validationResult = insertUserRoleSchema.omit({ companyId: true, displayOrder: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const role = await storage.createUserRole({ ...validationResult.data, companyId });
      res.status(201).json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user role" });
    }
  });

  app.patch("/api/user-roles/reorder", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const reorderSchema = z.object({
        updates: z.array(z.object({
          id: z.string(),
          displayOrder: z.number().int()
        }))
      });

      const validationResult = reorderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      await storage.updateUserRolesOrder(validationResult.data.updates, companyId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder user roles" });
    }
  });

  app.patch("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const updateSchema = insertUserRoleSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const role = await storage.updateUserRole(req.params.id, validationResult.data, companyId);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.delete("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "delete"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user?.companyId;
      
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      // First check if the role exists
      const role = await storage.getUserRole(req.params.id, companyId);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }

      // Check if role is built-in
      if (role.isBuiltIn) {
        return res.status(400).json({ error: "Cannot delete built-in roles." });
      }

      // Check if any users are assigned to this role
      const users = await storage.getUsers();
      const usersWithRole = users.filter(user => user.roleId === req.params.id && user.isActive);
      
      if (usersWithRole.length > 0) {
        return res.status(400).json({ error: "Cannot delete role. Users are currently assigned to this role." });
      }

      // Attempt to delete the role
      const success = await storage.deleteUserRole(req.params.id, companyId);
      if (!success) {
        return res.status(400).json({ error: "Failed to delete user role" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user role" });
    }
  });

  // Permission Management Routes
  app.get("/api/permissions", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const { category } = req.query;
      const permissions = await storage.getPermissions(category as string);
      res.json(permissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  app.get("/api/permissions/:id", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const permission = await storage.getPermission(req.params.id);
      if (!permission) {
        return res.status(404).json({ error: "Permission not found" });
      }
      res.json(permission);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch permission" });
    }
  });

  app.post("/api/permissions", requireTeamMember, requirePermission("admin.roles", "add"), async (req, res) => {
    try {
      const validationResult = insertPermissionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const permission = await storage.createPermission(validationResult.data);
      res.status(201).json(permission);
    } catch (error) {
      res.status(500).json({ error: "Failed to create permission" });
    }
  });

  // Role-Permission Matrix Routes
  app.get("/api/user-roles/:roleId/permissions", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const rolePermissions = await storage.getRolePermissions(req.params.roleId);
      res.json(rolePermissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });

  app.post("/api/user-roles/:roleId/permissions", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const { permissions } = req.body;
      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: "Permissions must be an array" });
      }

      // Validate each permission object
      const permissionSchema = z.object({
        permissionId: z.string(),
        allowedActions: z.array(z.enum(["view", "add", "edit", "delete"]))
      });
      
      const validationResult = z.array(permissionSchema).safeParse(permissions);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      await storage.setRolePermissions(req.params.roleId, validationResult.data);
      res.json({ message: "Role permissions updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update role permissions" });
    }
  });

  // User Project Access Routes
  app.get("/api/users/:userId/project-access", requireTeamMember, async (req, res) => {
    try {
      const projectAccess = await storage.getUserProjectAccess(req.params.userId);
      res.json(projectAccess);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user project access" });
    }
  });

  app.post("/api/users/:userId/project-access", requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertUserProjectAccessSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const access = await storage.createUserProjectAccess({
        ...validationResult.data,
        userId: req.params.userId
      });
      
      // Auto-add user to project channel if it exists
      try {
        const user = await storage.getUser(access.grantedBy || '');
        if (user?.companyId && access.projectId) {
          const channels = await storage.getChannels(user.companyId);
          const projectChannel = channels.find(c => c.projectId === access.projectId);
          
          if (projectChannel) {
            // Check if user is already a member
            const members = await storage.getChannelMembers(projectChannel.id);
            const isMember = members.some(m => m.userId === req.params.userId);
            
            if (!isMember) {
              await storage.addChannelMember({
                channelId: projectChannel.id,
                userId: req.params.userId
              });
              console.log(`Auto-added user ${req.params.userId} to project channel ${projectChannel.name}`);
            }
          }
        }
      } catch (channelError) {
        // Log error but don't fail the access grant
        console.error("Error adding user to project channel:", channelError);
      }
      
      res.status(201).json(access);
    } catch (error) {
      res.status(500).json({ error: "Failed to grant project access" });
    }
  });

  app.post("/api/project-access/grant", requireTeamMember, async (req, res) => {
    try {
      const { userId, projectId, accessLevel, grantedBy } = req.body;
      if (!userId || !projectId || !accessLevel || !grantedBy) {
        return res.status(400).json({ 
          error: "userId, projectId, accessLevel, and grantedBy are required" 
        });
      }

      const access = await storage.grantProjectAccess(userId, projectId, accessLevel, grantedBy);
      
      // Auto-add user to project channel if it exists
      try {
        const user = await storage.getUser(grantedBy);
        if (user?.companyId) {
          const channels = await storage.getChannels(user.companyId);
          const projectChannel = channels.find(c => c.projectId === projectId);
          
          if (projectChannel) {
            // Check if user is already a member
            const members = await storage.getChannelMembers(projectChannel.id);
            const isMember = members.some(m => m.userId === userId);
            
            if (!isMember) {
              await storage.addChannelMember({
                channelId: projectChannel.id,
                userId: userId
              });
              console.log(`Auto-added user ${userId} to project channel ${projectChannel.name}`);
            }
          }
        }
      } catch (channelError) {
        // Log error but don't fail the access grant
        console.error("Error adding user to project channel:", channelError);
      }
      
      res.status(201).json(access);
    } catch (error) {
      res.status(500).json({ error: "Failed to grant project access" });
    }
  });

  // User Invitation Routes
  app.get("/api/invitations", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const { status } = req.query;
      // SECURITY: Filter invitations by company to prevent cross-tenant data leak
      const invitations = await storage.getUserInvitationsByCompany(currentUser.companyId, status as string);
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.get("/api/invitations/:id", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const invitation = await storage.getUserInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });

  app.post("/api/invitations", requireTeamMember, requirePermission("admin.users", "add"), async (req, res) => {
    try {
      const validationResult = insertUserInvitationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Get company name to store in invitation for display on accept page
      const companyId = validationResult.data.companyId;
      const company = await storage.getCompany(companyId);
      const companyDisplayName = company?.nickname || company?.name || null;
      
      // Storage layer will auto-generate inviteToken and expiresAt
      // Include company name in the invitation record
      const invitation = await storage.createUserInvitation({
        ...validationResult.data,
        company: companyDisplayName,
      } as any);
      
      // Get inviter information for the email
      const inviter = await storage.getUser(invitation.invitedBy);
      
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      const host = req.get('host');
      const inviteUrl = `${protocol}://${host}/accept-invite/${invitation.inviteToken}`;
      
      // Send invitation email (use Gmail if inviter has it enabled)
      try {
        await sendInvitationEmail({
          to: invitation.email,
          inviterName: inviter?.firstName && inviter?.lastName 
            ? `${inviter.firstName} ${inviter.lastName}` 
            : inviter?.email || 'A team member',
          companyName: company?.name || 'the team',
          inviteUrl,
          recipientName: invitation.firstName || undefined,
          userId: invitation.invitedBy, // Pass inviter's userId for Gmail sending
        });
        
        console.log(`Invitation email sent to ${invitation.email}`);
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Don't fail the whole request if email fails
        // The user can still use the copy-paste link
      }
      
      res.status(201).json({
        ...invitation,
        inviteUrl,
      });
    } catch (error) {
      console.error('Error creating invitation:', error);
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });

  app.get("/api/invitations/by-token/:token", async (req, res) => {
    try {
      const invitation = await storage.getUserInvitationByToken(req.params.token);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found or expired" });
      }
      
      // Check if invitation is still valid
      if (invitation.status !== "pending" || invitation.expiresAt < new Date()) {
        return res.status(400).json({ error: "Invitation has expired or already been used" });
      }

      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });

  app.post("/api/invitations/:token/accept", async (req, res) => {
    try {
      console.log(`[AcceptInvitation] Processing token: ${req.params.token?.substring(0, 8)}...`);
      const { username, password, firstName, lastName } = req.body;
      
      if (!password) {
        console.log('[AcceptInvitation] Failed: Password not provided');
        return res.status(400).json({ error: "Password is required" });
      }

      // Validate password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        console.log('[AcceptInvitation] Failed: Password validation failed', passwordValidation.errors);
        return res.status(400).json({ 
          error: "Password validation failed", 
          details: passwordValidation.errors 
        });
      }

      console.log(`[AcceptInvitation] Creating user account for: ${username || 'email-based username'}`);
      const result = await storage.acceptInvitation(req.params.token, {
        username,
        password,
        firstName,
        lastName
      });

      if (!result) {
        console.log('[AcceptInvitation] Failed: Invalid or expired invitation');
        return res.status(400).json({ error: "Invalid or expired invitation" });
      }

      // Auto-login: Create session for the newly created user
      (req.session as any).userId = result.user.id;
      
      // Force save session before responding
      req.session.save((err) => {
        if (err) {
          console.error("Session save error after invitation acceptance:", err);
          // Still return success - user can log in manually
          const { password: _, ...safeUser } = result.user;
          return res.status(201).json({
            user: safeUser,
            invitation: result.invitation,
            message: "Account created successfully. Please log in."
          });
        }
        
        // Never return password in API response
        const { password: _, ...safeUser } = result.user;
        res.status(201).json({
          user: safeUser,
          invitation: result.invitation,
          message: "Account created successfully"
        });
      });
    } catch (error: any) {
      console.error('[AcceptInvitation] Error:', error.message || error);
      if (error.message?.includes("Password validation failed")) {
        return res.status(400).json({ error: "Password does not meet requirements" });
      }
      // SECURITY: Return generic error to client, log details server-side only
      res.status(500).json({ error: "Failed to accept invitation. Please try again or contact support." });
    }
  });

  // Resend invitation email
  app.post("/api/invitations/:id/resend", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const invitation = await storage.getUserInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // SECURITY: Only allow resending invitations for same company
      if (invitation.companyId !== currentUser.companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Can only resend pending invitations" });
      }

      // Regenerate token and extend expiry
      const newToken = PasswordUtils.generateSecureToken();
      const newExpiry = PasswordUtils.generateInviteExpiry();
      
      await storage.updateUserInvitation(invitation.id, {
        inviteToken: newToken,
        expiresAt: newExpiry,
      });

      // Get company and inviter info for email
      const company = await storage.getCompany(invitation.companyId);
      const inviter = await storage.getUser(invitation.invitedBy);
      
      const protocol = req.get('x-forwarded-proto') || (req.secure ? 'https' : 'http');
      const host = req.get('host');
      const inviteUrl = `${protocol}://${host}/accept-invite/${newToken}`;

      try {
        await sendInvitationEmail({
          to: invitation.email,
          inviterName: inviter?.firstName && inviter?.lastName 
            ? `${inviter.firstName} ${inviter.lastName}` 
            : inviter?.email || 'A team member',
          companyName: company?.name || 'the team',
          inviteUrl,
          recipientName: invitation.firstName || undefined,
          userId: currentUser.id,
        });
        
        console.log(`Invitation resent to ${invitation.email}`);
      } catch (emailError) {
        console.error('Failed to resend invitation email:', emailError);
      }

      res.json({ success: true, inviteUrl, message: "Invitation resent successfully" });
    } catch (error) {
      console.error('Error resending invitation:', error);
      res.status(500).json({ error: "Failed to resend invitation" });
    }
  });

  // Cancel invitation (uses "edit" permission since it just changes status, not actual deletion)
  app.delete("/api/invitations/:id", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      if (!currentUser?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const invitation = await storage.getUserInvitation(req.params.id);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found" });
      }

      // SECURITY: Only allow deleting invitations for same company
      if (invitation.companyId !== currentUser.companyId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (invitation.status !== "pending") {
        return res.status(400).json({ error: "Can only cancel pending invitations" });
      }

      await storage.updateUserInvitation(invitation.id, {
        status: "cancelled",
      } as any);

      res.json({ success: true, message: "Invitation cancelled" });
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      res.status(500).json({ error: "Failed to cancel invitation" });
    }
  });

  // Selections API Routes
  app.get("/api/selections", async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const selections = await storage.getSelections(projectId as string);
      res.json(selections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch selections" });
    }
  });

  app.get("/api/selections/:id", async (req, res) => {
    try {
      const selection = await storage.getSelectionWithOptions(req.params.id);
      if (!selection) {
        return res.status(404).json({ error: "Selection not found" });
      }
      res.json(selection);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch selection" });
    }
  });

  app.post("/api/selections", async (req, res) => {
    try {
      const validationResult = insertSelectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const selection = await storage.createSelection(validationResult.data);
      res.status(201).json(selection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create selection" });
    }
  });

  app.patch("/api/selections/:id", async (req, res) => {
    try {
      const validationResult = insertSelectionSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const selection = await storage.updateSelection(req.params.id, validationResult.data);
      if (!selection) {
        return res.status(404).json({ error: "Selection not found" });
      }
      res.json(selection);
    } catch (error) {
      res.status(500).json({ error: "Failed to update selection" });
    }
  });

  app.delete("/api/selections/:id", async (req, res) => {
    try {
      const success = await storage.deleteSelection(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Selection not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete selection" });
    }
  });

  // Selection Options API Routes
  app.get("/api/selections/:selectionId/options", async (req, res) => {
    try {
      const options = await storage.getSelectionOptions(req.params.selectionId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch selection options" });
    }
  });

  app.post("/api/selections/:selectionId/options", async (req, res) => {
    try {
      const validationResult = insertSelectionOptionSchema.safeParse({
        ...req.body,
        selectionId: req.params.selectionId
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.createSelectionOption(validationResult.data);
      res.status(201).json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to create selection option" });
    }
  });

  app.patch("/api/selection-options/:id", async (req, res) => {
    try {
      const validationResult = insertSelectionOptionSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.updateSelectionOption(req.params.id, validationResult.data);
      if (!option) {
        return res.status(404).json({ error: "Selection option not found" });
      }
      res.json(option);
    } catch (error) {
      res.status(500).json({ error: "Failed to update selection option" });
    }
  });

  app.delete("/api/selection-options/:id", async (req, res) => {
    try {
      const success = await storage.deleteSelectionOption(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Selection option not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete selection option" });
    }
  });

  // Client Selections API Routes
  app.get("/api/client-selections", async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const clientSelections = await storage.getClientSelections(projectId as string);
      res.json(clientSelections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client selections" });
    }
  });

  app.post("/api/client-selections", async (req, res) => {
    try {
      const validationResult = insertClientSelectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const clientSelection = await storage.createClientSelection(validationResult.data);
      res.status(201).json(clientSelection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create client selection" });
    }
  });

  // Suppliers API Routes
  app.get("/api/suppliers", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { supplierType } = req.query;
      const suppliers = await storage.getSuppliers(companyId, supplierType as "supplier" | "trade" | undefined);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/suppliers/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const supplier = await storage.getSupplierById(req.params.id);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier" });
    }
  });

  app.post("/api/suppliers", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const validationResult = insertSupplierSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const supplier = await storage.createSupplier({ ...validationResult.data, companyId });
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSupplierSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const supplier = await storage.updateSupplier(req.params.id, validationResult.data);
      res.json(supplier);
    } catch (error) {
      if (error instanceof Error && error.message === "Supplier not found") {
        return res.status(404).json({ error: "Supplier not found" });
      }
      res.status(500).json({ error: "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });

  // Supplier Labels API Routes
  app.get("/api/supplier-labels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const labels = await storage.getSupplierLabels(companyId);
      res.json(labels);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier labels" });
    }
  });

  app.post("/api/supplier-labels", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const validationResult = insertSupplierLabelSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const label = await storage.createSupplierLabel({ ...validationResult.data, companyId });
      res.status(201).json(label);
    } catch (error) {
      res.status(500).json({ error: "Failed to create supplier label" });
    }
  });

  app.patch("/api/supplier-labels/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const validationResult = insertSupplierLabelSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const label = await storage.updateSupplierLabel(req.params.id, validationResult.data);
      res.json(label);
    } catch (error) {
      if (error instanceof Error && error.message === "Supplier label not found") {
        return res.status(404).json({ error: "Supplier label not found" });
      }
      res.status(500).json({ error: "Failed to update supplier label" });
    }
  });

  app.delete("/api/supplier-labels/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      await storage.deleteSupplierLabel(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier label" });
    }
  });

  // Supplier Label Assignments
  app.get("/api/suppliers/:id/labels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const assignments = await storage.getSupplierLabelAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier labels" });
    }
  });

  app.put("/api/suppliers/:id/labels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { labelIds } = req.body;
      if (!Array.isArray(labelIds)) {
        return res.status(400).json({ error: "labelIds must be an array" });
      }
      await storage.setSupplierLabels(req.params.id, labelIds);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update supplier labels" });
    }
  });

  // Supplier Insurances API Routes
  app.get("/api/suppliers/:id/insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const insurances = await storage.getSupplierInsurances(req.params.id);
      res.json(insurances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier insurances" });
    }
  });

  app.post("/api/suppliers/:id/insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSupplierInsuranceSchema.safeParse({
        ...req.body,
        supplierId: req.params.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const insurance = await storage.createSupplierInsurance(validationResult.data);
      res.status(201).json(insurance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create supplier insurance" });
    }
  });

  app.patch("/api/supplier-insurances/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSupplierInsuranceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const insurance = await storage.updateSupplierInsurance(req.params.id, validationResult.data);
      res.json(insurance);
    } catch (error) {
      if (error instanceof Error && error.message === "Supplier insurance not found") {
        return res.status(404).json({ error: "Supplier insurance not found" });
      }
      res.status(500).json({ error: "Failed to update supplier insurance" });
    }
  });

  app.delete("/api/supplier-insurances/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      await storage.deleteSupplierInsurance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier insurance" });
    }
  });

  // Expiring insurances (for dashboard/notifications)
  app.get("/api/expiring-insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const daysAhead = parseInt(req.query.days as string) || 30;
      const insurances = await storage.getExpiringInsurances(companyId, daysAhead);
      res.json(insurances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expiring insurances" });
    }
  });

  // Contact Insurances API Routes (for contacts with contactType='supplier')
  app.get("/api/contacts/:id/insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const insurances = await storage.getContactInsurances(req.params.id);
      res.json(insurances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact insurances" });
    }
  });

  app.post("/api/contacts/:id/insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertContactInsuranceSchema.safeParse({
        ...req.body,
        contactId: req.params.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const insurance = await storage.createContactInsurance(validationResult.data);
      res.status(201).json(insurance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create contact insurance" });
    }
  });

  app.patch("/api/contact-insurances/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertContactInsuranceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const insurance = await storage.updateContactInsurance(req.params.id, validationResult.data);
      res.json(insurance);
    } catch (error) {
      if (error instanceof Error && error.message === "Contact insurance not found") {
        return res.status(404).json({ error: "Contact insurance not found" });
      }
      res.status(500).json({ error: "Failed to update contact insurance" });
    }
  });

  app.delete("/api/contact-insurances/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      await storage.deleteContactInsurance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete contact insurance" });
    }
  });

  // Expiring contact insurances (for dashboard/notifications)
  app.get("/api/expiring-contact-insurances", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const daysAhead = parseInt(req.query.days as string) || 30;
      const insurances = await storage.getExpiringContactInsurances(companyId, daysAhead);
      res.json(insurances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch expiring contact insurances" });
    }
  });

  // Supplier Contacts API Routes
  app.get("/api/suppliers/:id/contacts", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const contacts = await storage.getSupplierContacts(req.params.id);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch supplier contacts" });
    }
  });

  app.post("/api/suppliers/:id/contacts", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSupplierContactSchema.safeParse({
        ...req.body,
        supplierId: req.params.id,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const contact = await storage.createSupplierContact(validationResult.data);
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to create supplier contact" });
    }
  });

  app.patch("/api/supplier-contacts/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSupplierContactSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const contact = await storage.updateSupplierContact(req.params.id, validationResult.data);
      res.json(contact);
    } catch (error) {
      if (error instanceof Error && error.message === "Supplier contact not found") {
        return res.status(404).json({ error: "Supplier contact not found" });
      }
      res.status(500).json({ error: "Failed to update supplier contact" });
    }
  });

  app.delete("/api/supplier-contacts/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      await storage.deleteSupplierContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier contact" });
    }
  });

  // Contacts API Routes
  app.get("/api/contacts", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { contactType } = req.query;
      const contacts = await storage.getContacts(companyId, contactType as "team" | "supplier" | "client" | undefined);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const contact = await storage.getContact(req.params.id, companyId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const validationResult = insertContactSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const contact = await storage.createContact({ ...validationResult.data, companyId });
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Bulk import contacts - single request instead of multiple individual calls
  app.post("/api/contacts/bulk", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { contacts } = req.body;
      
      if (!Array.isArray(contacts)) {
        return res.status(400).json({ error: "contacts must be an array" });
      }

      const results = { success: 0, errors: [] as string[] };
      
      for (let i = 0; i < contacts.length; i++) {
        const contactData = contacts[i];
        try {
          // Sanitize data: convert null values to empty strings or defaults
          const sanitizedData = {
            ...contactData,
            // Convert null strings to empty string for optional text fields
            email: contactData.email ?? "",
            phone: contactData.phone ?? "",
            mobile: contactData.mobile ?? "",
            company: contactData.company ?? "",
            position: contactData.position ?? "",
            address: contactData.address ?? "",
            suburb: contactData.suburb ?? "",
            state: contactData.state ?? "",
            postcode: contactData.postcode ?? "",
            country: contactData.country ?? "",
            notes: contactData.notes ?? "",
            abn: contactData.abn ?? "",
            // Default contactType to 'supplier' if not provided
            contactType: contactData.contactType || "supplier",
          };
          
          const validationResult = insertContactSchema.safeParse(sanitizedData);
          if (!validationResult.success) {
            results.errors.push(`Row ${i + 1} (${contactData.name || 'Unknown'}): ${fromZodError(validationResult.error).toString()}`);
            continue;
          }
          await storage.createContact({ ...validationResult.data, companyId });
          results.success++;
        } catch (error: any) {
          results.errors.push(`Row ${i + 1} (${contactData.name || 'Unknown'}): ${error.message || 'Failed to import'}`);
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Bulk import error:", error);
      res.status(500).json({ error: "Failed to import contacts" });
    }
  });

  app.patch("/api/contacts/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      console.log("[PATCH /api/contacts] Request body:", JSON.stringify(req.body, null, 2));
      const validationResult = insertContactSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        const errorDetails = fromZodError(validationResult.error).toString();
        console.error("[PATCH /api/contacts] Validation failed:", errorDetails);
        return res.status(400).json({ 
          error: "Validation failed", 
          details: errorDetails 
        });
      }

      const contact = await storage.updateContact(req.params.id, validationResult.data, companyId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Contact avatar upload - use memory storage first, then write to disk after validation
  const contactAvatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 2 * 1024 * 1024, // 2MB limit
    },
    fileFilter: (req, file, cb) => {
      // Only allow specific image types
      const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed'));
      }
    }
  });

  app.post("/api/contacts/avatar/upload", requireAuth, requireTeamMember, contactAvatarUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const contactId = req.body.contactId;
      if (!contactId) {
        return res.status(400).json({ error: "Contact ID is required" });
      }

      const companyId = req.user!.companyId!;

      // Verify contact belongs to user's company before allowing upload
      const existingContact = await storage.getContact(contactId, companyId);
      if (!existingContact) {
        return res.status(404).json({ error: "Contact not found or access denied" });
      }

      // Generate safe filename based on mimetype only (no user input in filename)
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const ext = mimeToExt[req.file.mimetype] || 'jpg';
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = `avatar-${uniqueSuffix}.${ext}`;

      // Ensure upload directory exists
      const uploadDir = 'uploads/contact-avatars/';
      const fs = await import('fs');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Write file to disk
      const filePath = `${uploadDir}${filename}`;
      fs.writeFileSync(filePath, req.file.buffer);

      // Construct the URL for the uploaded file
      const avatarUrl = `/uploads/contact-avatars/${filename}`;

      // Update the contact with the new avatar URL
      await storage.updateContact(contactId, { avatarUrl }, companyId);

      res.json({ avatarUrl });
    } catch (error) {
      console.error("Avatar upload error:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  app.post("/api/contacts/:id/archive", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const contact = await storage.archiveContact(req.params.id, companyId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to archive contact" });
    }
  });

  app.post("/api/contacts/:id/restore", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const contact = await storage.restoreContact(req.params.id, companyId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to restore contact" });
    }
  });

  app.delete("/api/contacts/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const contactId = req.params.id;
      
      const contact = await storage.getContact(contactId, companyId);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      await storage.deleteContact(contactId, companyId);
      res.json({ success: true, message: "Contact deleted" });
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  app.post("/api/contacts/merge", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { sourceId, targetId } = req.body;
      const companyId = req.user!.companyId!;

      if (!sourceId || !targetId) {
        return res.status(400).json({ error: "sourceId and targetId are required" });
      }

      if (sourceId === targetId) {
        return res.status(400).json({ error: "Cannot merge a contact into itself" });
      }

      // Verify both contacts exist and belong to this company
      const sourceContact = await storage.getContact(sourceId, companyId);
      const targetContact = await storage.getContact(targetId, companyId);

      if (!sourceContact) {
        return res.status(404).json({ error: "Source contact not found" });
      }
      if (!targetContact) {
        return res.status(404).json({ error: "Target contact not found" });
      }

      if (targetContact.isArchived) {
        return res.status(400).json({ error: "Cannot merge into an archived contact" });
      }

      const result = await storage.mergeContacts(sourceId, targetId, companyId);
      
      if (!result.success) {
        return res.status(500).json({ error: "Failed to merge contacts" });
      }

      res.json({ 
        success: true, 
        message: `Merged "${sourceContact.name}" into "${targetContact.name}"`,
        transferredCounts: result.transferredCounts 
      });
    } catch (error) {
      console.error("Error merging contacts:", error);
      res.status(500).json({ error: "Failed to merge contacts" });
    }
  });

  // Bulk action on contacts (archive, restore, change type, delete)
  app.post("/api/contacts/bulk-action", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { ids, action, contactType } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "ids must be a non-empty array" });
      }
      
      if (!action || !["archive", "restore", "changeType", "delete"].includes(action)) {
        return res.status(400).json({ error: "action must be one of: archive, restore, changeType, delete" });
      }
      
      if (action === "changeType" && !["trade", "supplier", "client"].includes(contactType)) {
        return res.status(400).json({ error: "contactType must be one of: trade, supplier, client" });
      }
      
      const results = { success: 0, errors: [] as string[] };
      
      for (const id of ids) {
        try {
          if (action === "archive") {
            await storage.archiveContact(id, companyId);
          } else if (action === "restore") {
            await storage.restoreContact(id, companyId);
          } else if (action === "changeType") {
            await storage.updateContact(id, { contactType }, companyId);
          } else if (action === "delete") {
            await storage.deleteContact(id, companyId);
          }
          results.success++;
        } catch (error: any) {
          results.errors.push(`Contact ${id}: ${error.message || 'Failed'}`);
        }
      }
      
      res.json(results);
    } catch (error) {
      console.error("Bulk action error:", error);
      res.status(500).json({ error: "Failed to perform bulk action" });
    }
  });

  // RFQ (Request for Quote) API Routes
  app.get("/api/rfqs", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { projectId } = req.query;
      const companyId = req.user!.companyId;
      
      const rfqs = await storage.getRFQs(companyId!, projectId as string | undefined);
      res.json(rfqs);
    } catch (error) {
      console.error("Error fetching RFQs:", error);
      res.status(500).json({ error: "Failed to fetch RFQs" });
    }
  });

  app.get("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfq = await storage.getRFQ(req.params.id);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      
      // Company isolation check
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(rfq);
    } catch (error) {
      console.error("Error fetching RFQ:", error);
      res.status(500).json({ error: "Failed to fetch RFQ" });
    }
  });

  app.post("/api/rfqs", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      
      // Generate RFQ number (format: PROJ-RFQ-001)
      const project = await storage.getProject(validationResult.data.projectId);
      const existingRFQs = await storage.getRFQs(companyId, validationResult.data.projectId);
      const rfqCount = existingRFQs.length + 1;
      const rfqNumber = `${project?.name.substring(0, 4).toUpperCase() || 'PROJ'}-RFQ-${String(rfqCount).padStart(3, '0')}`;

      const rfqData = {
        ...validationResult.data,
        companyId,
        rfqNumber,
        createdBy: req.user!.id,
        createdByName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
        status: 'draft' as const,
      };

      const rfq = await storage.createRFQ(rfqData);
      res.status(201).json(rfq);
    } catch (error: any) {
      console.error("Error creating RFQ:", error);
      res.status(500).json({ error: "Failed to create RFQ", details: error.message });
    }
  });

  app.patch("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check
      const existingRFQ = await storage.getRFQ(req.params.id);
      if (!existingRFQ) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (existingRFQ.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updateSchema = insertRfqSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const rfq = await storage.updateRFQ(req.params.id, validationResult.data);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      res.json(rfq);
    } catch (error: any) {
      console.error("Error updating RFQ:", error);
      res.status(500).json({ error: "Failed to update RFQ" });
    }
  });

  app.delete("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check
      const existingRFQ = await storage.getRFQ(req.params.id);
      if (!existingRFQ) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (existingRFQ.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteRFQ(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFQ:", error);
      res.status(500).json({ error: "Failed to delete RFQ" });
    }
  });

  // RFQ Items API Routes
  app.get("/api/rfqs/:rfqId/items", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getRFQItems(req.params.rfqId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching RFQ items:", error);
      res.status(500).json({ error: "Failed to fetch RFQ items" });
    }
  });

  app.post("/api/rfq-items", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createRFQItem(validationResult.data);
      res.status(201).json(item);
    } catch (error: any) {
      console.error("Error creating RFQ item:", error);
      res.status(500).json({ error: "Failed to create RFQ item", details: error.message });
    }
  });

  app.patch("/api/rfq-items/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const updateSchema = insertRfqItemSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateRFQItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "RFQ item not found" });
      }
      res.json(item);
    } catch (error: any) {
      console.error("Error updating RFQ item:", error);
      res.status(500).json({ error: "Failed to update RFQ item" });
    }
  });

  app.delete("/api/rfq-items/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const deleted = await storage.deleteRFQItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFQ item:", error);
      res.status(500).json({ error: "Failed to delete RFQ item" });
    }
  });

  // RFQ Quotes API Routes
  app.get("/api/rfqs/:rfqId/quotes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check - verify RFQ ownership
      const rfq = await storage.getRFQ(req.params.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const quotes = await storage.getRFQQuotes(req.params.rfqId);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching RFQ quotes:", error);
      res.status(500).json({ error: "Failed to fetch RFQ quotes" });
    }
  });

  app.post("/api/rfq-quotes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqQuoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Company isolation check - verify RFQ ownership
      const rfq = await storage.getRFQ(validationResult.data.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Add uploadedBy
      const quoteData = {
        ...validationResult.data,
        uploadedBy: req.user!.id,
      };

      const quote = await storage.createRFQQuote(quoteData);
      res.status(201).json(quote);
    } catch (error: any) {
      console.error("Error creating RFQ quote:", error);
      res.status(500).json({ error: "Failed to create RFQ quote", details: error.message });
    }
  });

  app.patch("/api/rfq-quotes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqQuoteSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Security: Prevent rfqId reassignment
      if (validationResult.data.rfqId) {
        return res.status(400).json({ 
          error: "Cannot change rfqId of an existing quote" 
        });
      }

      // Company isolation check - fetch existing quote and verify RFQ ownership
      const existingQuote = await storage.getRFQQuote(req.params.id);
      if (!existingQuote) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const rfq = await storage.getRFQ(existingQuote.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const quote = await storage.updateRFQQuote(req.params.id, validationResult.data);
      res.json(quote);
    } catch (error: any) {
      console.error("Error updating RFQ quote:", error);
      res.status(500).json({ error: "Failed to update RFQ quote", details: error.message });
    }
  });

  app.delete("/api/rfq-quotes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check - fetch existing quote and verify RFQ ownership
      const existingQuote = await storage.getRFQQuote(req.params.id);
      if (!existingQuote) {
        return res.status(404).json({ error: "Quote not found" });
      }

      const rfq = await storage.getRFQ(existingQuote.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteRFQQuote(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Quote not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFQ quote:", error);
      res.status(500).json({ error: "Failed to delete RFQ quote" });
    }
  });

  // RFQ Follow-ups API Routes
  app.get("/api/rfqs/:rfqId/follow-ups", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check - verify RFQ ownership
      const rfq = await storage.getRFQ(req.params.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const followUps = await storage.getRFQFollowUps(req.params.rfqId);
      res.json(followUps);
    } catch (error) {
      console.error("Error fetching RFQ follow-ups:", error);
      res.status(500).json({ error: "Failed to fetch RFQ follow-ups" });
    }
  });

  app.post("/api/rfq-follow-ups", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqFollowUpSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Company isolation check - verify RFQ ownership
      const rfq = await storage.getRFQ(validationResult.data.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const followUp = await storage.createRFQFollowUp(validationResult.data);
      res.status(201).json(followUp);
    } catch (error: any) {
      console.error("Error creating RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to create RFQ follow-up", details: error.message });
    }
  });

  app.patch("/api/rfq-follow-ups/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqFollowUpSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Security: Prevent rfqId reassignment to avoid cross-company injection
      if (validationResult.data.rfqId) {
        return res.status(400).json({ 
          error: "Cannot change rfqId of an existing follow-up" 
        });
      }

      // Company isolation check - fetch existing follow-up and verify RFQ ownership
      const existingFollowUp = await db.select().from(schema.rfqFollowUps)
        .where(eq(schema.rfqFollowUps.id, req.params.id)).limit(1);
      if (!existingFollowUp.length) {
        return res.status(404).json({ error: "Follow-up not found" });
      }

      const rfq = await storage.getRFQ(existingFollowUp[0].rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const followUp = await storage.updateRFQFollowUp(req.params.id, validationResult.data);
      res.json(followUp);
    } catch (error: any) {
      console.error("Error updating RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to update RFQ follow-up", details: error.message });
    }
  });

  app.delete("/api/rfq-follow-ups/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Company isolation check - fetch existing follow-up and verify RFQ ownership
      const existingFollowUp = await db.select().from(schema.rfqFollowUps)
        .where(eq(schema.rfqFollowUps.id, req.params.id)).limit(1);
      if (!existingFollowUp.length) {
        return res.status(404).json({ error: "Follow-up not found" });
      }

      const rfq = await storage.getRFQ(existingFollowUp[0].rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteRFQFollowUp(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ follow-up not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to delete RFQ follow-up" });
    }
  });

  // RFQ Portal Token Routes
  app.get("/api/rfqs/:rfqId/portal-tokens", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfq = await storage.getRFQ(req.params.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const tokens = await storage.getRFQPortalTokens(req.params.rfqId);
      res.json(tokens);
    } catch (error) {
      console.error("Error fetching RFQ portal tokens:", error);
      res.status(500).json({ error: "Failed to fetch portal tokens" });
    }
  });

  app.post("/api/rfq-portal-tokens", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { rfqId, supplierEmail, supplierId, expiresAt } = req.body;
      
      const rfq = await storage.getRFQ(rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const token = randomUUID();
      const portalToken = await storage.createRFQPortalToken({
        rfqId,
        supplierId,
        supplierEmail,
        token,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        isActive: true,
      });
      res.status(201).json(portalToken);
    } catch (error: any) {
      console.error("Error creating RFQ portal token:", error);
      res.status(500).json({ error: "Failed to create portal token" });
    }
  });

  // Public RFQ Portal (no auth required for suppliers)
  app.get("/api/portal/rfq/:token", async (req, res) => {
    try {
      const portalToken = await storage.getRFQPortalTokenByToken(req.params.token);
      if (!portalToken) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This link has expired" });
      }

      // Mark as viewed if first time
      if (!portalToken.viewedAt) {
        await storage.updateRFQPortalToken(portalToken.id, { viewedAt: new Date() });
      }

      const rfq = await storage.getRFQ(portalToken.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }

      const items = await storage.getRFQItems(rfq.id);
      
      // Return limited RFQ info for supplier
      res.json({
        rfq: {
          id: rfq.id,
          rfqNumber: rfq.rfqNumber,
          title: rfq.title,
          description: rfq.description,
          scope: rfq.scope,
          dueDate: rfq.dueDate,
          attachmentUrls: rfq.attachmentUrls,
          attachmentFileNames: rfq.attachmentFileNames,
        },
        items,
        supplierEmail: portalToken.supplierEmail,
        alreadySubmitted: !!portalToken.quoteSubmittedId,
      });
    } catch (error) {
      console.error("Error fetching portal RFQ:", error);
      res.status(500).json({ error: "Failed to load quote request" });
    }
  });

  app.post("/api/portal/rfq/:token/submit-quote", async (req, res) => {
    try {
      const portalToken = await storage.getRFQPortalTokenByToken(req.params.token);
      if (!portalToken) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      if (portalToken.expiresAt && new Date(portalToken.expiresAt) < new Date()) {
        return res.status(410).json({ error: "This link has expired" });
      }
      if (portalToken.quoteSubmittedId) {
        return res.status(400).json({ error: "Quote already submitted via this link" });
      }

      const { totalAmount, leadTime, validUntil, notes, supplierName, supplierEmail } = req.body;
      
      if (!totalAmount || totalAmount <= 0) {
        return res.status(400).json({ error: "Quote amount is required" });
      }

      const quote = await storage.createRFQQuote({
        rfqId: portalToken.rfqId,
        supplierId: portalToken.supplierId || null,
        supplierName: supplierName || "",
        supplierEmail: supplierEmail || portalToken.supplierEmail || "",
        totalAmount: Math.round(totalAmount * 100), // Convert to cents
        leadTime: leadTime || null,
        validUntil: validUntil ? new Date(validUntil) : null,
        notes: notes || null,
        submittedViaPortal: true,
        submittedAt: new Date(),
        status: "pending",
      });

      // Mark token as used
      await storage.updateRFQPortalToken(portalToken.id, { 
        quoteSubmittedId: quote.id 
      });

      res.status(201).json({ success: true, message: "Quote submitted successfully" });
    } catch (error: any) {
      console.error("Error submitting portal quote:", error);
      res.status(500).json({ error: "Failed to submit quote" });
    }
  });

  // RFI (Request for Information) Routes
  app.get("/api/rfis", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { projectId } = req.query;
      const rfis = await storage.getRFIs(
        req.user!.companyId!,
        projectId as string | undefined
      );
      res.json(rfis);
    } catch (error) {
      console.error("Error fetching RFIs:", error);
      res.status(500).json({ error: "Failed to fetch RFIs" });
    }
  });

  app.get("/api/rfis/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfi = await storage.getRFI(req.params.id);
      if (!rfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      if (rfi.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(rfi);
    } catch (error) {
      console.error("Error fetching RFI:", error);
      res.status(500).json({ error: "Failed to fetch RFI" });
    }
  });

  app.post("/api/rfis", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfiSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }

      const rfi = await storage.createRFI(
        validationResult.data,
        req.user!.companyId!,
        req.user!.id,
        `${req.user!.firstName || ""} ${req.user!.lastName || ""}`.trim() || req.user!.email || "Unknown"
      );
      res.status(201).json(rfi);
    } catch (error: any) {
      console.error("Error creating RFI:", error);
      res.status(500).json({ error: "Failed to create RFI", details: error.message });
    }
  });

  app.patch("/api/rfis/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingRfi = await storage.getRFI(req.params.id);
      if (!existingRfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      if (existingRfi.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const validationResult = insertRfiSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }

      const rfi = await storage.updateRFI(req.params.id, validationResult.data);
      res.json(rfi);
    } catch (error: any) {
      console.error("Error updating RFI:", error);
      res.status(500).json({ error: "Failed to update RFI", details: error.message });
    }
  });

  app.delete("/api/rfis/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingRfi = await storage.getRFI(req.params.id);
      if (!existingRfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      if (existingRfi.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const deleted = await storage.deleteRFI(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFI not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFI:", error);
      res.status(500).json({ error: "Failed to delete RFI" });
    }
  });

  // RFI Comments Routes
  app.get("/api/rfis/:rfiId/comments", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfi = await storage.getRFI(req.params.rfiId);
      if (!rfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      if (rfi.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const comments = await storage.getRFIComments(req.params.rfiId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching RFI comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/rfi-comments", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { rfiId, content, attachmentUrls, attachmentFileNames, isExternalResponse } = req.body;
      
      const rfi = await storage.getRFI(rfiId);
      if (!rfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      if (rfi.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const comment = await storage.createRFIComment({
        rfiId,
        content,
        attachmentUrls: attachmentUrls || [],
        attachmentFileNames: attachmentFileNames || [],
        createdById: req.user!.id,
        createdByName: `${req.user!.firstName || ""} ${req.user!.lastName || ""}`.trim() || req.user!.email || "Unknown",
        isExternalResponse: isExternalResponse || false,
      });
      res.status(201).json(comment);
    } catch (error: any) {
      console.error("Error creating RFI comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  app.delete("/api/rfi-comments/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const deleted = await storage.deleteRFIComment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Comment not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting RFI comment:", error);
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // Bills API Routes
  app.get("/api/bills", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const bills = await storage.getBills(
        projectId as string | undefined, 
        status as string | undefined
      );
      res.json(bills);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  app.get("/api/bills/:id", async (req, res) => {
    try {
      const bill = await storage.getBillById(req.params.id);
      if (!bill) {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill" });
    }
  });

  app.post("/api/bills", async (req, res) => {
    try {
      const validationResult = insertBillSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const bill = await storage.createBill(validationResult.data);
      res.status(201).json(bill);
    } catch (error) {
      res.status(500).json({ error: "Failed to create bill" });
    }
  });

  app.patch("/api/bills/:id", async (req, res) => {
    try {
      const validationResult = insertBillSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const bill = await storage.updateBill(req.params.id, validationResult.data);
      res.json(bill);
    } catch (error) {
      if (error instanceof Error && error.message === "Bill not found") {
        return res.status(404).json({ error: "Bill not found" });
      }
      res.status(500).json({ error: "Failed to update bill" });
    }
  });

  app.delete("/api/bills/:id", async (req, res) => {
    try {
      await storage.deleteBill(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });

  app.get("/api/bills/:id/line-items", async (req, res) => {
    try {
      const lineItems = await storage.getBillLineItems(req.params.id);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill line items" });
    }
  });

  app.post("/api/bills/:billId/line-items", async (req, res) => {
    try {
      const validationResult = insertBillLineItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const lineItem = await storage.createBillLineItem(validationResult.data);
      res.status(201).json(lineItem);
    } catch (error) {
      res.status(500).json({ error: "Failed to create bill line item" });
    }
  });

  app.patch("/api/bills/:billId/line-items/:id", async (req, res) => {
    try {
      const validationResult = insertBillLineItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const lineItem = await storage.updateBillLineItem(req.params.id, validationResult.data);
      res.json(lineItem);
    } catch (error) {
      if (error instanceof Error && error.message === "Bill line item not found") {
        return res.status(404).json({ error: "Bill line item not found" });
      }
      res.status(500).json({ error: "Failed to update bill line item" });
    }
  });

  app.delete("/api/bills/:billId/line-items/:id", async (req, res) => {
    try {
      await storage.deleteBillLineItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill line item" });
    }
  });

  // Get unlinked bill line items (no priceListItemId) for AI review
  app.get("/api/bill-line-items/unlinked", async (req, res) => {
    try {
      const companyId = req.query.companyId as string;
      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }
      const items = await storage.getUnlinkedBillLineItems(companyId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching unlinked bill line items:", error);
      res.status(500).json({ error: "Failed to fetch unlinked bill line items" });
    }
  });

  // Link a bill line item to a price list item
  app.patch("/api/bill-line-items/:id/link-price-item", async (req, res) => {
    try {
      const { priceListItemId } = req.body;
      const lineItem = await storage.updateBillLineItem(req.params.id, { priceListItemId });
      res.json(lineItem);
    } catch (error) {
      if (error instanceof Error && error.message === "Bill line item not found") {
        return res.status(404).json({ error: "Bill line item not found" });
      }
      res.status(500).json({ error: "Failed to link bill line item" });
    }
  });

  // Bill Line Item Allowances routes
  app.get("/api/bills/:billId/line-item-allowances", async (req, res) => {
    try {
      const allowances = await storage.getBillLineItemAllowancesByBillId(req.params.billId);
      res.json(allowances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill line item allowances" });
    }
  });

  app.post("/api/bill-line-item-allowances", async (req, res) => {
    try {
      const validationResult = insertBillLineItemAllowanceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const allowance = await storage.createBillLineItemAllowance(validationResult.data);
      res.status(201).json(allowance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create bill line item allowance" });
    }
  });

  app.patch("/api/bill-line-item-allowances/:id", async (req, res) => {
    try {
      const validationResult = insertBillLineItemAllowanceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const allowance = await storage.updateBillLineItemAllowance(req.params.id, validationResult.data);
      if (!allowance) {
        return res.status(404).json({ error: "Bill line item allowance not found" });
      }
      res.json(allowance);
    } catch (error) {
      res.status(500).json({ error: "Failed to update bill line item allowance" });
    }
  });

  app.delete("/api/bill-line-item-allowances/:id", async (req, res) => {
    try {
      await storage.deleteBillLineItemAllowance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill line item allowance" });
    }
  });

  // Bill Approvals routes
  app.get("/api/bills/:id/approvals", async (req, res) => {
    try {
      const approvals = await storage.getBillApprovals(req.params.id);
      res.json(approvals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill approvals" });
    }
  });

  app.post("/api/bills/:id/approve", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const canApprove = await storage.canUserApproveBills(req.user.id);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to approve bills" });
      }

      const validationResult = insertBillApprovalSchema.safeParse({
        billId: req.params.id,
        approvedById: req.user.id,
        status: "approved",
        comments: req.body.comments || null,
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const approval = await storage.createBillApproval(validationResult.data);
      
      await storage.updateBill(req.params.id, { 
        status: "awaiting_payment" 
      });

      // Log activity if comments were added
      if (req.body.comments && req.body.comments.trim()) {
        try {
          const bill = await storage.getBillById(req.params.id);
          if (bill) {
            const userName = req.user.firstName && req.user.lastName 
              ? `${req.user.firstName} ${req.user.lastName}`
              : req.user.username || "User";
            
            const billName = bill.billNumber || `Bill #${bill.id.slice(0, 8)}`;
            
            await storage.createActivity({
              projectId: bill.projectId,
              userId: req.user.id,
              userName: userName,
              activityType: "bill",
              action: "updated",
              description: `${userName} added comment to bill '${billName}'`,
              entityId: req.params.id,
              entityName: billName,
              metadata: {}
            });
          }
        } catch (error) {
          console.error("Failed to log bill comment activity:", error);
        }
      }

      res.status(201).json(approval);
    } catch (error) {
      res.status(500).json({ error: "Failed to approve bill" });
    }
  });

  app.post("/api/bills/:id/reject", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const canApprove = await storage.canUserApproveBills(req.user.id);
      if (!canApprove) {
        return res.status(403).json({ error: "You do not have permission to reject bills" });
      }

      const validationResult = insertBillApprovalSchema.safeParse({
        billId: req.params.id,
        approvedById: req.user.id,
        status: "rejected",
        comments: req.body.comments || null,
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const approval = await storage.createBillApproval(validationResult.data);
      
      await storage.updateBill(req.params.id, { 
        status: "draft" 
      });

      // Log activity if comments were added
      if (req.body.comments && req.body.comments.trim()) {
        try {
          const bill = await storage.getBillById(req.params.id);
          if (bill) {
            const userName = req.user.firstName && req.user.lastName 
              ? `${req.user.firstName} ${req.user.lastName}`
              : req.user.username || "User";
            
            const billName = bill.billNumber || `Bill #${bill.id.slice(0, 8)}`;
            
            await storage.createActivity({
              projectId: bill.projectId,
              userId: req.user.id,
              userName: userName,
              activityType: "bill",
              action: "updated",
              description: `${userName} added comment to bill '${billName}'`,
              entityId: req.params.id,
              entityName: billName,
              metadata: {}
            });
          }
        } catch (error) {
          console.error("Failed to log bill comment activity:", error);
        }
      }

      res.status(201).json(approval);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject bill" });
    }
  });

  // Variations API Routes
  app.get("/api/variations", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const variations = await storage.getVariations(
        projectId as string | undefined,
        status as string | undefined
      );
      res.json(variations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch variations" });
    }
  });

  app.get("/api/variations/:id", async (req, res) => {
    try {
      const variation = await storage.getVariation(req.params.id);
      if (!variation) {
        return res.status(404).json({ error: "Variation not found" });
      }
      res.json(variation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch variation" });
    }
  });

  app.post("/api/variations", async (req, res) => {
    try {
      const validationResult = insertVariationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Generate variation number if not provided
      let variationNumber = validationResult.data.variationNumber;
      if (!variationNumber || variationNumber === "Auto-generated") {
        const projectId = validationResult.data.projectId;
        const existingVariations = await storage.getVariations(projectId);
        const projectPrefix = Math.floor(1000 + Math.random() * 9000); // Random 4-digit number
        const variationCount = existingVariations.length + 1;
        variationNumber = `${projectPrefix}-VO-${String(variationCount).padStart(3, '0')}`;
      }

      const variation = await storage.createVariation({
        ...validationResult.data,
        variationNumber
      });
      res.status(201).json(variation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create variation" });
    }
  });

  app.patch("/api/variations/:id", async (req, res) => {
    try {
      const validationResult = insertVariationSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const variation = await storage.updateVariation(req.params.id, validationResult.data);
      if (!variation) {
        return res.status(404).json({ error: "Variation not found" });
      }
      res.json(variation);
    } catch (error) {
      res.status(500).json({ error: "Failed to update variation" });
    }
  });

  app.delete("/api/variations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteVariation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Variation not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete variation" });
    }
  });

  // Variation Items API Routes
  app.get("/api/variations/:id/items", async (req, res) => {
    try {
      const items = await storage.getVariationItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch variation items" });
    }
  });

  app.post("/api/variations/:id/items", async (req, res) => {
    try {
      const validationResult = insertVariationItemSchema.safeParse({
        ...req.body,
        variationId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createVariationItem(validationResult.data);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to create variation item" });
    }
  });

  app.patch("/api/variation-items/:id", async (req, res) => {
    try {
      const validationResult = insertVariationItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateVariationItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Variation item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update variation item" });
    }
  });

  app.delete("/api/variation-items/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteVariationItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Variation item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete variation item" });
    }
  });

  // ============================================
  // PURCHASE ORDERS API ROUTES
  // ============================================

  // Get all purchase orders (with optional filters)
  app.get("/api/purchase-orders", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const { projectId, status, poType } = req.query;
      const purchaseOrders = await storage.getPurchaseOrders(
        req.user.companyId,
        projectId as string | undefined,
        status as string | undefined,
        poType as string | undefined
      );
      res.json(purchaseOrders);
    } catch (error) {
      console.error("Failed to fetch purchase orders:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  // Get single purchase order
  app.get("/api/purchase-orders/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      if (po.companyId !== req.user.companyId) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      res.json(po);
    } catch (error) {
      console.error("Failed to fetch purchase order:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  // Get next PO number
  app.get("/api/purchase-orders/next-number/:type", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const poType = req.params.type as "main" | "site";
      if (poType !== "main" && poType !== "site") {
        return res.status(400).json({ error: "Invalid PO type. Must be 'main' or 'site'" });
      }
      const poNumber = await storage.getNextPONumber(req.user.companyId, poType);
      res.json({ poNumber });
    } catch (error) {
      console.error("Failed to get next PO number:", error);
      res.status(500).json({ error: "Failed to get next PO number" });
    }
  });

  // Create purchase order
  app.post("/api/purchase-orders", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Auto-generate PO number if not provided
      const poType = req.body.type || req.body.poType || "main";
      const poNumber = req.body.poNumber || await storage.getNextPONumber(req.user.companyId, poType);

      // projectId is required - if not provided, return an error
      if (!req.body.projectId) {
        return res.status(400).json({ 
          error: "Project required", 
          details: "Please select a project for this purchase order" 
        });
      }

      const poData = {
        ...req.body,
        poNumber,
        poType,
        companyId: req.user.companyId,
        createdById: req.user.id
      };

      const validationResult = insertPurchaseOrderSchema.safeParse(poData);

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const po = await storage.createPurchaseOrder(validationResult.data);
      res.status(201).json(po);
    } catch (error) {
      console.error("Failed to create purchase order:", error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  // Update purchase order
  app.patch("/api/purchase-orders/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const existingPo = await storage.getPurchaseOrder(req.params.id);
      if (!existingPo || existingPo.companyId !== req.user.companyId) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const validationResult = insertPurchaseOrderSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const po = await storage.updatePurchaseOrder(req.params.id, validationResult.data);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      res.json(po);
    } catch (error) {
      console.error("Failed to update purchase order:", error);
      res.status(500).json({ error: "Failed to update purchase order" });
    }
  });

  // Delete purchase order
  app.delete("/api/purchase-orders/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const existingPo = await storage.getPurchaseOrder(req.params.id);
      if (!existingPo || existingPo.companyId !== req.user.companyId) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const deleted = await storage.deletePurchaseOrder(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete purchase order:", error);
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  });

  // Send purchase order (change status and optionally send email)
  app.post("/api/purchase-orders/:id/send", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const po = await storage.getPurchaseOrder(req.params.id);
      if (!po || po.companyId !== req.user.companyId) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const updatedPo = await storage.updatePurchaseOrder(req.params.id, {
        status: "sent",
        sentAt: new Date()
      });

      res.json(updatedPo);
    } catch (error) {
      console.error("Failed to send purchase order:", error);
      res.status(500).json({ error: "Failed to send purchase order" });
    }
  });

  // Helper to verify PO ownership
  async function verifyPOOwnership(poId: string, companyId: string): Promise<boolean> {
    const po = await storage.getPurchaseOrder(poId);
    return po !== undefined && po.companyId === companyId;
  }

  // ============================================
  // PURCHASE ORDER ITEMS API ROUTES
  // ============================================

  // Get items for a purchase order
  app.get("/api/purchase-orders/:poId/items", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      const items = await storage.getPurchaseOrderItems(req.params.poId);
      res.json(items);
    } catch (error) {
      console.error("Failed to fetch purchase order items:", error);
      res.status(500).json({ error: "Failed to fetch purchase order items" });
    }
  });

  // Create purchase order item
  app.post("/api/purchase-orders/:poId/items", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const validationResult = insertPurchaseOrderItemSchema.safeParse({
        ...req.body,
        purchaseOrderId: req.params.poId
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createPurchaseOrderItem(validationResult.data);
      res.status(201).json(item);
    } catch (error) {
      console.error("Failed to create purchase order item:", error);
      res.status(500).json({ error: "Failed to create purchase order item" });
    }
  });

  // Bulk create purchase order items (for import from estimate)
  app.post("/api/purchase-orders/:poId/items/bulk", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const items = req.body.items;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }

      const createdItems = [];
      for (const item of items) {
        const validationResult = insertPurchaseOrderItemSchema.safeParse({
          ...item,
          purchaseOrderId: req.params.poId
        });

        if (!validationResult.success) {
          return res.status(400).json({ 
            error: "Validation failed for one or more items", 
            details: fromZodError(validationResult.error).toString() 
          });
        }

        const created = await storage.createPurchaseOrderItem(validationResult.data);
        createdItems.push(created);
      }

      res.status(201).json(createdItems);
    } catch (error) {
      console.error("Failed to bulk create purchase order items:", error);
      res.status(500).json({ error: "Failed to bulk create purchase order items" });
    }
  });

  // Helper to verify PO item ownership via its parent PO
  async function verifyPOItemOwnership(itemId: string, companyId: string): Promise<boolean> {
    const item = await storage.getPurchaseOrderItem(itemId);
    if (!item) return false;
    return verifyPOOwnership(item.purchaseOrderId, companyId);
  }

  // Update purchase order item
  app.patch("/api/purchase-order-items/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOItemOwnership(req.params.id, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }

      const validationResult = insertPurchaseOrderItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updatePurchaseOrderItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Failed to update purchase order item:", error);
      res.status(500).json({ error: "Failed to update purchase order item" });
    }
  });

  // Delete purchase order item
  app.delete("/api/purchase-order-items/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOItemOwnership(req.params.id, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }

      const deleted = await storage.deletePurchaseOrderItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete purchase order item:", error);
      res.status(500).json({ error: "Failed to delete purchase order item" });
    }
  });

  // Reorder purchase order items (accepts array of item IDs in order)
  app.post("/api/purchase-orders/:poId/items/reorder", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      // Handle both formats: {updates: [...]} and {itemIds: [...]}
      const itemIds = req.body.itemIds || req.body.updates?.map((u: any) => u.id);
      if (!Array.isArray(itemIds)) {
        return res.status(400).json({ error: "itemIds must be an array" });
      }

      const updates = itemIds.map((id: string, index: number) => ({
        id,
        displayOrder: index,
      }));

      await storage.reorderPurchaseOrderItems(updates);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to reorder purchase order items:", error);
      res.status(500).json({ error: "Failed to reorder purchase order items" });
    }
  });

  // Update specific purchase order item (nested route)
  app.patch("/api/purchase-orders/:poId/items/:itemId", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      // Verify item belongs to this PO
      const existingItem = await storage.getPurchaseOrderItem(req.params.itemId);
      if (!existingItem || existingItem.purchaseOrderId !== req.params.poId) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }

      const validationResult = insertPurchaseOrderItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updatePurchaseOrderItem(req.params.itemId, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Failed to update purchase order item:", error);
      res.status(500).json({ error: "Failed to update purchase order item" });
    }
  });

  // Delete specific purchase order item (nested route)
  app.delete("/api/purchase-orders/:poId/items/:itemId", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      // Verify item belongs to this PO
      const existingItem = await storage.getPurchaseOrderItem(req.params.itemId);
      if (!existingItem || existingItem.purchaseOrderId !== req.params.poId) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }

      const deleted = await storage.deletePurchaseOrderItem(req.params.itemId);
      if (!deleted) {
        return res.status(404).json({ error: "Purchase order item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete purchase order item:", error);
      res.status(500).json({ error: "Failed to delete purchase order item" });
    }
  });

  // ============================================
  // PURCHASE ORDER ATTACHMENTS API ROUTES
  // ============================================

  // Get attachments for a purchase order
  app.get("/api/purchase-orders/:poId/attachments", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      const attachments = await storage.getPurchaseOrderAttachments(req.params.poId);
      res.json(attachments);
    } catch (error) {
      console.error("Failed to fetch purchase order attachments:", error);
      res.status(500).json({ error: "Failed to fetch purchase order attachments" });
    }
  });

  // Create purchase order attachment
  app.post("/api/purchase-orders/:poId/attachments", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const validationResult = insertPurchaseOrderAttachmentSchema.safeParse({
        ...req.body,
        purchaseOrderId: req.params.poId,
        uploadedById: req.user.id
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const attachment = await storage.createPurchaseOrderAttachment(validationResult.data);
      res.status(201).json(attachment);
    } catch (error) {
      console.error("Failed to create purchase order attachment:", error);
      res.status(500).json({ error: "Failed to create purchase order attachment" });
    }
  });

  // Helper to verify attachment ownership via its parent PO
  async function verifyPOAttachmentOwnership(attachmentId: string, companyId: string): Promise<boolean> {
    const attachment = await storage.getPurchaseOrderAttachment(attachmentId);
    if (!attachment) return false;
    return verifyPOOwnership(attachment.purchaseOrderId, companyId);
  }

  // Delete purchase order attachment
  app.delete("/api/purchase-order-attachments/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOAttachmentOwnership(req.params.id, req.user.companyId)) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      const deleted = await storage.deletePurchaseOrderAttachment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete purchase order attachment:", error);
      res.status(500).json({ error: "Failed to delete purchase order attachment" });
    }
  });

  // ============================================
  // PURCHASE ORDER SIGNATURES API ROUTES
  // ============================================

  // Get signatures for a purchase order
  app.get("/api/purchase-orders/:poId/signatures", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      const signatures = await storage.getPurchaseOrderSignatures(req.params.poId);
      res.json(signatures);
    } catch (error) {
      console.error("Failed to fetch purchase order signatures:", error);
      res.status(500).json({ error: "Failed to fetch purchase order signatures" });
    }
  });

  // Create signature request (generate token for supplier portal)
  app.post("/api/purchase-orders/:poId/request-signature", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      if (!await verifyPOOwnership(req.params.poId, req.user.companyId)) {
        return res.status(404).json({ error: "Purchase order not found" });
      }

      const signatureToken = randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const signature = await storage.createPurchaseOrderSignature({
        purchaseOrderId: req.params.poId,
        signatureToken,
        signerType: "supplier",
        signerName: req.body.signerName || null,
        signerEmail: req.body.signerEmail || null,
        expiresAt
      });

      const signatureUrl = `/sign-po/${signatureToken}`;

      res.status(201).json({ 
        signature, 
        signatureUrl,
        expiresAt 
      });
    } catch (error) {
      console.error("Failed to create signature request:", error);
      res.status(500).json({ error: "Failed to create signature request" });
    }
  });

  // Public route: Get PO for signing (via token)
  app.get("/api/purchase-orders/sign/:token", async (req, res) => {
    try {
      const po = await storage.getPurchaseOrderBySignatureToken(req.params.token);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found or link expired" });
      }

      // Get items
      const items = await storage.getPurchaseOrderItems(po.id);

      res.json({ purchaseOrder: po, items });
    } catch (error) {
      console.error("Failed to fetch purchase order for signing:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  // Public route: Submit signature
  app.post("/api/purchase-orders/sign/:token", async (req, res) => {
    try {
      const po = await storage.getPurchaseOrderBySignatureToken(req.params.token);
      if (!po) {
        return res.status(404).json({ error: "Purchase order not found or link expired" });
      }

      // Find the pending signature by token
      const signatures = await storage.getPurchaseOrderSignatures(po.id);
      const pendingSignature = signatures.find(s => s.signatureToken === req.params.token && !s.signedAt);
      
      if (!pendingSignature) {
        return res.status(400).json({ error: "Signature already submitted or expired" });
      }

      // Update the signature with the actual signature data
      // Note: We'd need an update method - for now, we'll update the PO status
      await storage.updatePurchaseOrder(po.id, {
        status: "approved",
        approvedAt: new Date()
      });

      res.json({ success: true, message: "Purchase order signed successfully" });
    } catch (error) {
      console.error("Failed to sign purchase order:", error);
      res.status(500).json({ error: "Failed to sign purchase order" });
    }
  });

  // ============================================
  // PURCHASE ORDER TEMPLATES API ROUTES
  // ============================================

  // Get all templates for company
  app.get("/api/purchase-order-templates", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const templates = await storage.getPurchaseOrderTemplates(req.user.companyId);
      res.json(templates);
    } catch (error) {
      console.error("Failed to fetch purchase order templates:", error);
      res.status(500).json({ error: "Failed to fetch purchase order templates" });
    }
  });

  // Get single template
  app.get("/api/purchase-order-templates/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const template = await storage.getPurchaseOrderTemplate(req.params.id, req.user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Failed to fetch purchase order template:", error);
      res.status(500).json({ error: "Failed to fetch purchase order template" });
    }
  });

  // Create template
  app.post("/api/purchase-order-templates", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const validationResult = insertPurchaseOrderTemplateSchema.safeParse({
        ...req.body,
        companyId: req.user.companyId
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.createPurchaseOrderTemplate(validationResult.data);
      res.status(201).json(template);
    } catch (error) {
      console.error("Failed to create purchase order template:", error);
      res.status(500).json({ error: "Failed to create purchase order template" });
    }
  });

  // Update template
  app.patch("/api/purchase-order-templates/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const validationResult = insertPurchaseOrderTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.updatePurchaseOrderTemplate(req.params.id, validationResult.data, req.user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Failed to update purchase order template:", error);
      res.status(500).json({ error: "Failed to update purchase order template" });
    }
  });

  // Delete template (soft delete)
  app.delete("/api/purchase-order-templates/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const deleted = await storage.deletePurchaseOrderTemplate(req.params.id, req.user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to delete purchase order template:", error);
      res.status(500).json({ error: "Failed to delete purchase order template" });
    }
  });

  // ============================================
  // FAVORITE SUPPLIERS API ROUTES
  // ============================================

  // Get user's favorite suppliers
  app.get("/api/favorite-suppliers", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const favorites = await storage.getFavoriteSuppliers(req.user.id, req.user.companyId);
      res.json(favorites);
    } catch (error) {
      console.error("Failed to fetch favorite suppliers:", error);
      res.status(500).json({ error: "Failed to fetch favorite suppliers" });
    }
  });

  // Add favorite supplier
  app.post("/api/favorite-suppliers", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const validationResult = insertFavoriteSupplierSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        companyId: req.user.companyId
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const favorite = await storage.createFavoriteSupplier(validationResult.data);
      res.status(201).json(favorite);
    } catch (error) {
      console.error("Failed to add favorite supplier:", error);
      res.status(500).json({ error: "Failed to add favorite supplier" });
    }
  });

  // Remove favorite supplier
  app.delete("/api/favorite-suppliers/:id", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const deleted = await storage.deleteFavoriteSupplier(req.params.id, req.user.id, req.user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Favorite supplier not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to remove favorite supplier:", error);
      res.status(500).json({ error: "Failed to remove favorite supplier" });
    }
  });

  // Reorder favorite suppliers
  app.post("/api/favorite-suppliers/reorder", async (req, res) => {
    try {
      const updates = req.body.updates;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderFavoriteSuppliers(updates);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to reorder favorite suppliers:", error);
      res.status(500).json({ error: "Failed to reorder favorite suppliers" });
    }
  });

  // ============================================
  // FAVORITE COST CODES API ROUTES
  // ============================================

  // Get user's favorite cost codes
  app.get("/api/favorite-cost-codes", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const favorites = await storage.getFavoriteCostCodes(req.user.id, req.user.companyId);
      res.json(favorites);
    } catch (error) {
      console.error("Failed to fetch favorite cost codes:", error);
      res.status(500).json({ error: "Failed to fetch favorite cost codes" });
    }
  });

  // Add favorite cost code
  app.post("/api/favorite-cost-codes", async (req, res) => {
    try {
      if (!req.user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const validationResult = insertFavoriteCostCodeSchema.safeParse({
        ...req.body,
        userId: req.user.id,
        companyId: req.user.companyId
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const favorite = await storage.createFavoriteCostCode(validationResult.data);
      res.status(201).json(favorite);
    } catch (error) {
      console.error("Failed to add favorite cost code:", error);
      res.status(500).json({ error: "Failed to add favorite cost code" });
    }
  });

  // Remove favorite cost code
  app.delete("/api/favorite-cost-codes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteFavoriteCostCode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Favorite cost code not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Failed to remove favorite cost code:", error);
      res.status(500).json({ error: "Failed to remove favorite cost code" });
    }
  });

  // Reorder favorite cost codes
  app.post("/api/favorite-cost-codes/reorder", async (req, res) => {
    try {
      const updates = req.body.updates;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderFavoriteCostCodes(updates);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to reorder favorite cost codes:", error);
      res.status(500).json({ error: "Failed to reorder favorite cost codes" });
    }
  });

  // ============================================
  // IMPORT FROM ESTIMATE ROUTE
  // ============================================

  // Get estimate items for import
  app.get("/api/purchase-orders/import/estimate-items/:estimateId", async (req, res) => {
    try {
      const estimateItems = await storage.getEstimateItems(req.params.estimateId);
      res.json(estimateItems);
    } catch (error) {
      console.error("Failed to fetch estimate items for import:", error);
      res.status(500).json({ error: "Failed to fetch estimate items" });
    }
  });

  // Client Invoices API Routes
  app.get("/api/client-invoices", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const invoices = await storage.getClientInvoices(
        projectId as string | undefined,
        status as string | undefined
      );
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoices" });
    }
  });

  app.get("/api/client-invoices/:id", async (req, res) => {
    try {
      const invoice = await storage.getClientInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Client invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoice" });
    }
  });

  app.post("/api/client-invoices", async (req, res) => {
    try {
      const validationResult = insertClientInvoiceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invoice = await storage.createClientInvoice(validationResult.data);
      res.status(201).json(invoice);
    } catch (error) {
      res.status(500).json({ error: "Failed to create client invoice" });
    }
  });

  app.patch("/api/client-invoices/:id", async (req, res) => {
    try {
      const validationResult = insertClientInvoiceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invoice = await storage.updateClientInvoice(req.params.id, validationResult.data);
      if (!invoice) {
        return res.status(404).json({ error: "Client invoice not found" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: "Failed to update client invoice" });
    }
  });

  app.delete("/api/client-invoices/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteClientInvoice(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Client invoice not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete client invoice" });
    }
  });

  // Client Invoice Items API Routes
  app.get("/api/client-invoices/:id/items", async (req, res) => {
    try {
      const items = await storage.getClientInvoiceItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoice items" });
    }
  });

  app.post("/api/client-invoices/:id/items", async (req, res) => {
    try {
      const validationResult = insertClientInvoiceItemSchema.safeParse({
        ...req.body,
        invoiceId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createClientInvoiceItem(validationResult.data);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to create client invoice item" });
    }
  });

  app.patch("/api/client-invoice-items/:id", async (req, res) => {
    try {
      const validationResult = insertClientInvoiceItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateClientInvoiceItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Client invoice item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update client invoice item" });
    }
  });

  app.delete("/api/client-invoice-items/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteClientInvoiceItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Client invoice item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete client invoice item" });
    }
  });

  // Client Invoice Payments API Routes
  app.get("/api/client-invoices/:id/payments", async (req, res) => {
    try {
      const payments = await storage.getClientInvoicePayments(req.params.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoice payments" });
    }
  });

  app.post("/api/client-invoices/:id/payments", async (req, res) => {
    try {
      const validationResult = insertClientInvoicePaymentSchema.safeParse({
        ...req.body,
        invoiceId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const payment = await storage.createClientInvoicePayment(validationResult.data);
      res.status(201).json(payment);
    } catch (error) {
      res.status(500).json({ error: "Failed to create client invoice payment" });
    }
  });

  app.delete("/api/client-invoice-payments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteClientInvoicePayment(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Client invoice payment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete client invoice payment" });
    }
  });

  // Invoice-Estimate Junction Routes
  app.get("/api/client-invoices/:id/estimates", async (req, res) => {
    try {
      const estimates = await storage.getInvoiceEstimates(req.params.id);
      res.json(estimates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice estimates" });
    }
  });

  app.post("/api/client-invoices/:id/estimates", async (req, res) => {
    try {
      const validationResult = insertInvoiceEstimateSchema.safeParse({
        ...req.body,
        invoiceId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invoiceEstimate = await storage.createInvoiceEstimate(validationResult.data);
      res.status(201).json(invoiceEstimate);
    } catch (error) {
      res.status(500).json({ error: "Failed to create invoice estimate" });
    }
  });

  app.delete("/api/invoice-estimates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInvoiceEstimate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Invoice estimate not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete invoice estimate" });
    }
  });

  // Invoice-Variation Junction Routes
  app.get("/api/client-invoices/:id/variations", async (req, res) => {
    try {
      const variations = await storage.getInvoiceVariations(req.params.id);
      res.json(variations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice variations" });
    }
  });

  app.post("/api/client-invoices/:id/variations", async (req, res) => {
    try {
      const validationResult = insertInvoiceVariationSchema.safeParse({
        ...req.body,
        invoiceId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invoiceVariation = await storage.createInvoiceVariation(validationResult.data);
      res.status(201).json(invoiceVariation);
    } catch (error) {
      res.status(500).json({ error: "Failed to create invoice variation" });
    }
  });

  app.delete("/api/invoice-variations/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInvoiceVariation(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Invoice variation not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete invoice variation" });
    }
  });

  // Invoice-Bill Junction Routes
  app.get("/api/client-invoices/:id/bills", async (req, res) => {
    try {
      const bills = await storage.getInvoiceBills(req.params.id);
      res.json(bills);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice bills" });
    }
  });

  app.post("/api/client-invoices/:id/bills", async (req, res) => {
    try {
      const validationResult = insertInvoiceBillSchema.safeParse({
        ...req.body,
        invoiceId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invoiceBill = await storage.createInvoiceBill(validationResult.data);
      res.status(201).json(invoiceBill);
    } catch (error) {
      res.status(500).json({ error: "Failed to create invoice bill" });
    }
  });

  app.delete("/api/invoice-bills/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteInvoiceBill(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Invoice bill not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete invoice bill" });
    }
  });

  // Proposals API Routes
  app.get("/api/proposals", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const proposals = await storage.getProposals(
        projectId as string | undefined,
        status as string | undefined
      );
      res.json(proposals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposals" });
    }
  });

  app.get("/api/proposals/:id", async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal" });
    }
  });

  app.post("/api/proposals", async (req, res) => {
    try {
      const validationResult = insertProposalSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const proposal = await storage.createProposal(validationResult.data);
      res.status(201).json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to create proposal" });
    }
  });

  app.patch("/api/proposals/:id", async (req, res) => {
    try {
      const validationResult = insertProposalSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const proposal = await storage.updateProposal(req.params.id, validationResult.data);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to update proposal" });
    }
  });

  app.delete("/api/proposals/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProposal(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete proposal" });
    }
  });

  // Proposal Sections API Routes
  app.get("/api/proposals/:id/sections", async (req, res) => {
    try {
      const sections = await storage.getProposalSections(req.params.id);
      res.json(sections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal sections" });
    }
  });

  app.post("/api/proposals/:id/sections", async (req, res) => {
    try {
      const validationResult = insertProposalSectionSchema.safeParse({
        ...req.body,
        proposalId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const section = await storage.createProposalSection(validationResult.data);
      res.status(201).json(section);
    } catch (error) {
      res.status(500).json({ error: "Failed to create proposal section" });
    }
  });

  app.patch("/api/proposal-sections/:id", async (req, res) => {
    try {
      const validationResult = insertProposalSectionSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const section = await storage.updateProposalSection(req.params.id, validationResult.data);
      if (!section) {
        return res.status(404).json({ error: "Proposal section not found" });
      }
      res.json(section);
    } catch (error) {
      res.status(500).json({ error: "Failed to update proposal section" });
    }
  });

  app.delete("/api/proposal-sections/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProposalSection(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Proposal section not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete proposal section" });
    }
  });

  // Proposal Items API Routes
  app.get("/api/proposals/:id/items", async (req, res) => {
    try {
      const items = await storage.getProposalItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal items" });
    }
  });

  app.post("/api/proposals/:id/items", async (req, res) => {
    try {
      const validationResult = insertProposalItemSchema.safeParse({
        ...req.body,
        proposalId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const item = await storage.createProposalItem(validationResult.data);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to create proposal item" });
    }
  });

  app.patch("/api/proposal-items/:id", async (req, res) => {
    try {
      const validationResult = insertProposalItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const item = await storage.updateProposalItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Proposal item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update proposal item" });
    }
  });

  app.delete("/api/proposal-items/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteProposalItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Proposal item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete proposal item" });
    }
  });

  // Proposal Acceptances API Routes
  app.get("/api/proposals/:id/acceptances", async (req, res) => {
    try {
      const acceptances = await storage.getProposalAcceptances(req.params.id);
      res.json(acceptances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal acceptances" });
    }
  });

  app.post("/api/proposals/:id/acceptances", async (req, res) => {
    try {
      const validationResult = insertProposalAcceptanceSchema.safeParse({
        ...req.body,
        proposalId: req.params.id
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const acceptance = await storage.createProposalAcceptance(validationResult.data);
      res.status(201).json(acceptance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create proposal acceptance" });
    }
  });

  app.get("/api/proposals/:id/latest-acceptance", async (req, res) => {
    try {
      const acceptance = await storage.getLatestProposalAcceptance(req.params.id);
      res.json(acceptance || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest proposal acceptance" });
    }
  });

  // Proposal Status Transition Routes
  app.post("/api/proposals/:id/send", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      
      // Validate state transition
      if (existing.status !== "draft") {
        return res.status(400).json({ error: "Only draft proposals can be sent" });
      }

      const { sentTo, sentBy, sentAt } = req.body;
      const proposal = await storage.updateProposal(req.params.id, {
        status: "sent",
        sentAt: sentAt || new Date(),
        sentBy: sentBy || null,
        sentTo: sentTo || null
      });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to send proposal" });
    }
  });

  app.post("/api/proposals/:id/accept", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      // Validate state transition
      if (existing.status !== "sent") {
        return res.status(400).json({ error: "Only sent proposals can be accepted" });
      }

      const { acceptedBy, signatureData, notes } = req.body;
      
      // Create acceptance record
      const acceptance = await storage.createProposalAcceptance({
        proposalId: req.params.id,
        acceptedBy: acceptedBy || null,
        signatureData: signatureData || null,
        notes: notes || null
      });

      // Update proposal status atomically
      const proposal = await storage.updateProposal(req.params.id, {
        status: "accepted",
        acceptedAt: acceptance.acceptedAt
      });

      res.json({ proposal, acceptance });
    } catch (error) {
      res.status(500).json({ error: "Failed to accept proposal" });
    }
  });

  app.post("/api/proposals/:id/reject", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      // Validate state transition  
      if (existing.status !== "sent") {
        return res.status(400).json({ error: "Only sent proposals can be rejected" });
      }

      const { rejectedBy, notes } = req.body;
      const proposal = await storage.updateProposal(req.params.id, {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: rejectedBy || null,
        rejectionNotes: notes || null
      });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject proposal" });
    }
  });

  // Proposal to Invoice Conversion
  app.post("/api/proposals/:id/convert-to-invoice", async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      if (proposal.status !== "accepted") {
        return res.status(400).json({ error: "Only accepted proposals can be converted to invoices" });
      }

      // Get proposal items
      const items = await storage.getProposalItems(req.params.id);

      // Create client invoice
      const invoice = await storage.createClientInvoice({
        projectId: proposal.projectId,
        invoiceNumber: `INV-${Date.now()}`, // Generate invoice number
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        status: "draft",
        subtotal: proposal.totalAmount,
        taxAmount: proposal.taxAmount,
        total: proposal.totalAmount + proposal.taxAmount,
        notes: `Converted from proposal: ${proposal.title}`,
        termsAndConditions: proposal.termsAndConditions
      });

      // Create invoice items from proposal items
      for (const item of items) {
        await storage.createClientInvoiceItem({
          invoiceId: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          amount: item.totalAmount
        });
      }

      // Update proposal to mark as converted
      await storage.updateProposal(req.params.id, {
        convertedToInvoiceAt: new Date(),
        invoiceId: invoice.id
      });

      res.json({ invoice, proposal });
    } catch (error) {
      console.error("Error converting proposal to invoice:", error);
      res.status(500).json({ error: "Failed to convert proposal to invoice" });
    }
  });

  // Company routes
  app.get("/api/companies/:id", requireAuth, async (req, res) => {
    try {
      const company = await storage.getCompany(req.params.id);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.patch("/api/companies/:id", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = req.user as Express.User;
      // Verify the user belongs to this company
      if (user.companyId !== req.params.id) {
        return res.status(403).json({ error: "Cannot update another company" });
      }
      
      const { nickname, name } = req.body;
      const updateData: any = {};
      
      if (nickname !== undefined) updateData.nickname = nickname;
      if (name !== undefined) updateData.name = name;
      
      const company = await storage.updateCompany(req.params.id, updateData);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  // Company Settings routes (protected - admin access only)
  app.get("/api/company-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company settings" });
    }
  });

  app.patch("/api/company-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const partialSchema = insertCompanySettingsSchema.partial();
      const validationResult = partialSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const settings = await storage.updateCompanySettings(validationResult.data);
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to update company settings" });
    }
  });

  // System Configuration routes (protected - admin access only in production)
  // Note: Development bypass is handled by global middleware at line 82-85
  app.get("/api/system-configuration", 
    ...(process.env.NODE_ENV !== 'development' ? [requireAuth, requireAdmin] : []),
    async (req, res) => {
      try {
        const config = await storage.getSystemConfiguration();
        res.json(config || {});
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch system configuration" });
      }
    }
  );

  app.put("/api/system-configuration",
    ...(process.env.NODE_ENV !== 'development' ? [requireAuth, requireAdmin] : []),
    async (req, res) => {
    try {
      const validationResult = insertSystemConfigurationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const config = await storage.updateSystemConfiguration(validationResult.data);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: "Failed to update system configuration" });
    }
  });

  // OCR Invoice Processing endpoint
  app.post("/api/ocr/process-invoice", async (req, res) => {
    try {
      const { getOCRService } = await import("./services/ocr");
      const ocrService = getOCRService();

      const { fileData, fileName } = req.body;

      if (!fileData || !fileName) {
        return res.status(400).json({ error: "File data and file name are required" });
      }

      const result = await ocrService.processInvoiceFromBase64(fileData, fileName);
      res.json(result);
    } catch (error: any) {
      console.error("OCR processing error:", error);
      res.status(500).json({ error: error.message || "Failed to process invoice with OCR" });
    }
  });

  // Email-to-Bill Webhook endpoint (accepts SendGrid multipart/form-data)
  const upload = multer({ storage: multer.memoryStorage() });
  
  // Google Drive Upload (placed after multer is defined)
  app.post('/api/google-drive/upload', requireAuth, requireTeamMember, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }
      const { parentId } = req.body;
      const { GoogleDriveService } = await import('./services/googleDriveService');
      const driveService = new GoogleDriveService(storage);
      const file = await driveService.uploadFile(
        req.user.companyId,
        req.file.originalname,
        req.file.mimetype,
        req.file.buffer,
        parentId
      );
      res.json(file);
    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file", error: error.message });
    }
  });

  app.post("/api/webhooks/email-invoice", upload.any(), async (req, res) => {
    try {
      console.log("Email webhook received:", {
        hasBody: !!req.body,
        hasFiles: !!req.files,
        fileCount: req.files?.length || 0,
        bodyKeys: Object.keys(req.body || {}),
      });

      const { getEmailParserService } = await import("./services/emailParser");
      const { getAutoBillCreatorService } = await import("./services/autoBillCreator");
      
      const emailParser = getEmailParserService();
      const autoBillCreator = getAutoBillCreatorService();

      // Check if we have the required email data
      if (!req.body || (!req.body.from && !req.body.subject)) {
        return res.status(400).json({ 
          error: "Invalid email data",
          message: "Request must contain email metadata (from, subject, etc.)",
          received: { body: req.body, files: req.files?.length || 0 }
        });
      }

      // Parse email (supports SendGrid multipart format)
      const parsedEmail = emailParser.parseSendGridEmail(req.body, req.files as any);

      if (!parsedEmail.attachments || parsedEmail.attachments.length === 0) {
        return res.status(400).json({ 
          error: "No attachments found in email",
          message: "Please forward an email with invoice attachments (PDF or images)",
          emailData: { from: parsedEmail.from, subject: parsedEmail.subject }
        });
      }

      console.log("Parsed email:", {
        from: parsedEmail.from,
        subject: parsedEmail.subject,
        attachmentCount: parsedEmail.attachments.length,
      });

      // Get default user (system user or first admin)
      const users = await storage.getUsers("team");
      const defaultUser = users.find(u => u.username === "admin") || users[0];

      if (!defaultUser) {
        return res.status(500).json({ error: "No system user found" });
      }

      // Process email and create bills
      const results = await autoBillCreator.processEmailInvoices(parsedEmail, {
        defaultUserId: defaultUser.id,
        autoMatch: true, // Auto-match suppliers and projects
      });

      console.log("Email processing complete:", {
        processedCount: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      });

      // Return results
      res.json({
        success: true,
        message: `Processed ${results.length} invoice(s)`,
        results,
      });
    } catch (error: any) {
      console.error("Email-to-bill webhook error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to process email invoice",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      });
    }
  });

  // Activity Feed routes
  app.get("/api/activities", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const userId = req.query.userId as string | undefined;
      const companyId = req.query.companyId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      // At least one filter is required
      if (!projectId && !userId && !companyId) {
        return res.status(400).json({ error: "At least one of projectId, userId, or companyId is required" });
      }

      const activities = await storage.getActivities({ projectId, userId, companyId, limit });
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const activityData = insertActivitySchema.parse({
        ...req.body,
        userId: user.id,
        userName: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.email,
        companyId: req.body.companyId || user.companyId,
      });
      const activity = await storage.createActivity(activityData);
      res.json(activity);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid activity data", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Pin/unpin activity
  app.patch("/api/activities/:id", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { pinned } = req.body;
      
      const updateData: any = {};
      if (typeof pinned === "boolean") {
        updateData.pinned = pinned;
        updateData.pinnedAt = pinned ? new Date() : null;
        updateData.pinnedBy = pinned ? user.id : null;
      }

      const activity = await storage.updateActivity(req.params.id, updateData);
      if (!activity) {
        return res.status(404).json({ error: "Activity not found" });
      }
      res.json(activity);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Site Diary Template routes
  app.get("/api/site-diary-templates", async (req, res) => {
    try {
      const templates = await storage.getSiteDiaryTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch site diary templates",
        details: error.message 
      });
    }
  });

  // Get default site diary template for company (must be before :id route)
  app.get("/api/site-diary-templates/default/:companyId", async (req, res) => {
    try {
      const template = await storage.getDefaultSiteDiaryTemplate(req.params.companyId);
      if (!template) {
        // Return null if no default set - not an error
        return res.json(null);
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch default template",
        details: error.message 
      });
    }
  });

  app.get("/api/site-diary-templates/:id", async (req, res) => {
    try {
      const template = await storage.getSiteDiaryTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch template",
        details: error.message 
      });
    }
  });

  // Set a template as the default for a company
  app.post("/api/site-diary-templates/:id/set-default", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const template = await storage.setDefaultSiteDiaryTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to set default template",
        details: error.message 
      });
    }
  });

  app.post("/api/site-diary-templates", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.createSiteDiaryTemplate(validationResult.data);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create template",
        details: error.message 
      });
    }
  });

  app.patch("/api/site-diary-templates/:id", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.updateSiteDiaryTemplate(req.params.id, validationResult.data);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update template",
        details: error.message 
      });
    }
  });

  app.delete("/api/site-diary-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteSiteDiaryTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete template",
        details: error.message 
      });
    }
  });

  // Import site diary templates from Excel
  const siteDiaryImportUpload = multer({ storage: multer.memoryStorage() });
  app.post("/api/site-diary-templates/import", siteDiaryImportUpload.single("file"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const XLSX = await import("xlsx");
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet) as any[];

      if (data.length === 0) {
        return res.status(400).json({ error: "Excel file is empty" });
      }

      // Group rows by template name
      const templateGroups = new Map<string, any[]>();
      for (const row of data) {
        const templateName = row["Template Name"];
        if (!templateName) continue;
        if (!templateGroups.has(templateName)) {
          templateGroups.set(templateName, []);
        }
        templateGroups.get(templateName)!.push(row);
      }

      const createdTemplates: any[] = [];
      const errors: string[] = [];

      // Map Excel field types to our field types
      const mapFieldType = (excelType: string): "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file" | "photo-gallery" => {
        const normalizedType = (excelType || "").toLowerCase().trim();
        switch (normalizedType) {
          case "text": return "text";
          case "textarea": return "textarea";
          case "multiple choice": return "select";
          case "date": return "date";
          case "checkbox": return "checkbox";
          case "heading": return "text"; // Headings become text fields
          case "table": return "textarea"; // Tables become text areas
          case "number": return "number";
          default: return "text";
        }
      };

      // Process each template
      for (const [templateName, rows] of templateGroups) {
        try {
          const fields: any[] = [];
          let fieldOrder = 0;

          // Group by main field (Item Number X.0) and sub-fields (X.1, X.2, etc.)
          const fieldGroups = new Map<string, any[]>();
          for (const row of rows) {
            const itemNumber = String(row["Item Number"] || "");
            const mainFieldNum = itemNumber.split(".")[0];
            if (!fieldGroups.has(mainFieldNum)) {
              fieldGroups.set(mainFieldNum, []);
            }
            fieldGroups.get(mainFieldNum)!.push(row);
          }

          // Process each main field group
          for (const [, groupRows] of fieldGroups) {
            // Find the main field (X.0)
            const mainRow = groupRows.find((r: any) => String(r["Item Number"] || "").endsWith(".0")) || groupRows[0];
            const fieldTitle = mainRow["Field Title"];
            const fieldType = mainRow["Field Type"];
            const fieldOptions = mainRow["Field Options"];

            if (!fieldTitle) continue;

            // Parse options for select/multiple choice fields
            let options: { label: string; value: string }[] | undefined;
            if (fieldOptions && typeof fieldOptions === "string" && fieldOptions.trim()) {
              options = fieldOptions.split("|").map((opt: string) => {
                const trimmed = opt.trim();
                return {
                  label: trimmed,
                  value: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                };
              });
            }

            // Handle table fields with sub-fields
            let description = "";
            if (fieldType === "Table") {
              const subFields = groupRows.filter((r: any) => !String(r["Item Number"] || "").endsWith(".0"));
              if (subFields.length > 0) {
                description = "Columns: " + subFields.map((sf: any) => sf["Sub-field Title"]).filter(Boolean).join(", ");
              }
            }

            const field = {
              id: `field_${fieldOrder}_${Date.now()}`,
              title: fieldTitle + (description ? ` (${description})` : ""),
              type: mapFieldType(fieldType),
              required: false,
              options: options,
              order: fieldOrder++,
            };

            fields.push(field);
          }

          // Create the template
          const templateData = {
            name: templateName.trim(),
            description: `Imported from Excel on ${new Date().toLocaleDateString()}`,
            fields: fields,
            companyId: user.companyId,
            createdBy: user.id,
            createdByName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
            isDefault: false,
          };

          const template = await storage.createSiteDiaryTemplate(templateData);
          createdTemplates.push(template);
        } catch (err: any) {
          errors.push(`Failed to create template "${templateName}": ${err.message}`);
        }
      }

      res.json({
        success: true,
        message: `Successfully imported ${createdTemplates.length} templates`,
        templatesCreated: createdTemplates.length,
        templates: createdTemplates,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Error importing site diary templates:", error);
      res.status(500).json({
        error: "Failed to import templates",
        details: error.message,
      });
    }
  });

  // Site Diary Entry routes
  app.get("/api/projects/:projectId/site-diary-entries", async (req, res) => {
    try {
      const entries = await storage.getSiteDiaryEntries(req.params.projectId);
      res.json(entries);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch site diary entries",
        details: error.message 
      });
    }
  });

  app.get("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getSiteDiaryEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch entry",
        details: error.message 
      });
    }
  });

  app.post("/api/site-diary-entries", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryEntrySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Verify template exists
      const template = await storage.getSiteDiaryTemplate(validationResult.data.templateId);
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }

      // Verify project exists
      const project = await storage.getProject(validationResult.data.projectId);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }

      const entry = await storage.createSiteDiaryEntry(validationResult.data);
      res.status(201).json(entry);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create entry",
        details: error.message 
      });
    }
  });

  app.patch("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryEntrySchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Verify template exists if being updated
      if (validationResult.data.templateId) {
        const template = await storage.getSiteDiaryTemplate(validationResult.data.templateId);
        if (!template) {
          return res.status(400).json({ error: "Template not found" });
        }
      }

      // Verify project exists if being updated
      if (validationResult.data.projectId) {
        const project = await storage.getProject(validationResult.data.projectId);
        if (!project) {
          return res.status(400).json({ error: "Project not found" });
        }
      }

      const entry = await storage.updateSiteDiaryEntry(req.params.id, validationResult.data);
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json(entry);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update entry",
        details: error.message 
      });
    }
  });

  app.delete("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const success = await storage.deleteSiteDiaryEntry(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete entry",
        details: error.message 
      });
    }
  });

  // Cost Categories routes (company-specific)
  app.get("/api/cost-categories", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const categories = await storage.getCostCategories(req.user!.companyId);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch cost categories",
        details: error.message 
      });
    }
  });

  app.get("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const category = await storage.getCostCategory(req.params.id, req.user!.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch cost category",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-categories", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCategorySchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const category = await storage.createCostCategory({
        ...validationResult.data,
        companyId: req.user!.companyId
      });
      res.status(201).json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create cost category",
        details: error.message 
      });
    }
  });

  app.patch("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCategorySchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const category = await storage.updateCostCategory(req.params.id, validationResult.data, req.user!.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update cost category",
        details: error.message 
      });
    }
  });

  app.delete("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCostCategory(req.params.id, req.user!.companyId);
      if (!success) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete cost category",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-categories/:id/archive", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const category = await storage.archiveCostCategory(req.params.id, req.user!.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to archive cost category",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-categories/merge", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Validate request body
      const validationResult = z.object({
        sourceId: z.string().uuid(),
        targetId: z.string().uuid()
      }).safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const { sourceId, targetId } = validationResult.data;

      if (sourceId === targetId) {
        return res.status(400).json({ error: "Cannot merge a category into itself" });
      }

      const companyId = req.user!.companyId;

      // Check if both categories exist and belong to the user's company
      const [sourceCategory, targetCategory] = await Promise.all([
        storage.getCostCategory(sourceId, companyId),
        storage.getCostCategory(targetId, companyId)
      ]);

      if (!sourceCategory) {
        return res.status(404).json({ error: "Source category not found" });
      }

      if (!targetCategory) {
        return res.status(404).json({ error: "Target category not found" });
      }

      // Check if target category is active
      if (!targetCategory.isActive) {
        return res.status(400).json({ error: "Cannot merge into an archived category" });
      }

      await storage.mergeCostCategories(sourceId, targetId, companyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to merge cost categories",
        details: error.message 
      });
    }
  });

  // Payment Terms Options routes (company-specific)
  app.get("/api/payment-terms-options", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const options = await storage.getPaymentTermsOptions(req.user!.companyId);
      res.json(options);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch payment terms options",
        details: error.message 
      });
    }
  });

  app.get("/api/payment-terms-options/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const option = await storage.getPaymentTermsOption(req.params.id, req.user!.companyId);
      if (!option) {
        return res.status(404).json({ error: "Payment terms option not found" });
      }
      res.json(option);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch payment terms option",
        details: error.message 
      });
    }
  });

  app.post("/api/payment-terms-options", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertPaymentTermsOptionSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.createPaymentTermsOption({
        ...validationResult.data,
        companyId: req.user!.companyId
      });
      res.status(201).json(option);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create payment terms option",
        details: error.message 
      });
    }
  });

  app.patch("/api/payment-terms-options/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertPaymentTermsOptionSchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const option = await storage.updatePaymentTermsOption(
        req.params.id, 
        validationResult.data, 
        req.user!.companyId
      );
      if (!option) {
        return res.status(404).json({ error: "Payment terms option not found" });
      }
      res.json(option);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update payment terms option",
        details: error.message 
      });
    }
  });

  app.delete("/api/payment-terms-options/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deletePaymentTermsOption(req.params.id, req.user!.companyId);
      if (!success) {
        return res.status(404).json({ error: "Payment terms option not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete payment terms option",
        details: error.message 
      });
    }
  });

  app.post("/api/payment-terms-options/:id/set-default", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { type } = req.body;
      if (!type || !['bill', 'invoice'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'bill' or 'invoice'" });
      }

      await storage.setPaymentTermsDefault(req.params.id, type, req.user!.companyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to set payment terms default",
        details: error.message 
      });
    }
  });

  // Cost Codes routes (company-specific)
  app.get("/api/cost-codes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      let codes = await storage.getCostCodes(req.user!.companyId);
      
      // Filter by availableInTimesheets if query param is passed
      if (req.query.timesheets === "true") {
        codes = codes.filter(code => code.availableInTimesheets === true);
      }
      
      res.json(codes);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch cost codes",
        details: error.message 
      });
    }
  });

  app.get("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const code = await storage.getCostCode(req.params.id, req.user!.companyId);
      if (!code) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(code);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch cost code",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-codes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCodeSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId;

      // Verify category exists if provided and belongs to the user's company
      if (validationResult.data.categoryId) {
        const category = await storage.getCostCategory(validationResult.data.categoryId, companyId);
        if (!category) {
          return res.status(400).json({ error: "Cost category not found" });
        }
      }

      const code = await storage.createCostCode({
        ...validationResult.data,
        companyId
      });
      res.status(201).json(code);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create cost code",
        details: error.message 
      });
    }
  });

  app.patch("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCodeSchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId;

      // Verify category exists if being updated and belongs to the user's company
      if (validationResult.data.categoryId) {
        const category = await storage.getCostCategory(validationResult.data.categoryId, companyId);
        if (!category) {
          return res.status(400).json({ error: "Cost category not found" });
        }
      }

      const code = await storage.updateCostCode(req.params.id, validationResult.data, companyId);
      if (!code) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(code);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update cost code",
        details: error.message 
      });
    }
  });

  app.delete("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCostCode(req.params.id, req.user!.companyId);
      if (!success) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete cost code",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-codes/:id/archive", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const code = await storage.archiveCostCode(req.params.id, req.user!.companyId);
      if (!code) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(code);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to archive cost code",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-codes/merge", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { sourceId, targetId } = req.body;
      
      if (!sourceId || !targetId) {
        return res.status(400).json({ 
          error: "Both sourceId and targetId are required" 
        });
      }

      if (sourceId === targetId) {
        return res.status(400).json({ 
          error: "Source and target must be different" 
        });
      }

      const companyId = req.user!.companyId;

      // Verify both codes exist and belong to the user's company
      const sourceCode = await storage.getCostCode(sourceId, companyId);
      const targetCode = await storage.getCostCode(targetId, companyId);

      if (!sourceCode) {
        return res.status(404).json({ error: "Source cost code not found" });
      }

      if (!targetCode) {
        return res.status(404).json({ error: "Target cost code not found" });
      }

      const success = await storage.mergeCostCodes(sourceId, targetId, companyId);
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to merge cost codes",
        details: error.message 
      });
    }
  });

  app.post("/api/cost-codes/import", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ 
          error: "Items array is required" 
        });
      }

      const companyId = req.user!.companyId;
      const categoryMap = new Map<string, string>(); // code -> categoryId
      let categoriesCreated = 0;
      let codesCreated = 0;

      // Get existing categories for this company
      const existingCategories = await storage.getCostCategories(companyId);
      for (const cat of existingCategories) {
        categoryMap.set(cat.code, cat.id);
      }

      // Process each item
      for (const item of items) {
        let categoryId: string | null = null;

        // Create category if needed
        if (item.categoryCode && item.categoryTitle) {
          if (!categoryMap.has(item.categoryCode)) {
            const newCategory = await storage.createCostCategory({
              code: item.categoryCode,
              title: item.categoryTitle,
              companyId,
            });
            categoryMap.set(item.categoryCode, newCategory.id);
            categoriesCreated++;
            categoryId = newCategory.id;
          } else {
            categoryId = categoryMap.get(item.categoryCode)!;
          }
        }

        // Create cost code
        if (item.costCode && item.costCodeTitle) {
          await storage.createCostCode({
            code: item.costCode,
            title: item.costCodeTitle,
            categoryId,
            availableInTimesheets: true,
            companyId,
          });
          codesCreated++;
        }
      }

      res.json({
        categoriesCreated,
        codesCreated,
        totalProcessed: items.length,
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to import cost codes",
        details: error.message 
      });
    }
  });

  // Task Tags routes (company-specific)
  app.get("/api/task-tags", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const tags = await storage.getTaskTags(req.user!.companyId);
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch task tags",
        details: error.message 
      });
    }
  });

  app.get("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const tag = await storage.getTaskTag(req.params.id, req.user!.companyId);
      if (!tag) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch task tag",
        details: error.message 
      });
    }
  });

  app.post("/api/task-tags", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTagSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId;

      // Get max display order and increment
      const existingTags = await storage.getTaskTags(companyId);
      const maxOrder = existingTags.reduce((max, tag) => 
        Math.max(max, tag.displayOrder), 0);

      const tag = await storage.createTaskTag({
        ...validationResult.data,
        companyId,
        displayOrder: maxOrder + 1
      });
      res.status(201).json(tag);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create task tag",
        details: error.message 
      });
    }
  });

  app.patch("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTagSchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const tag = await storage.updateTaskTag(
        req.params.id, 
        validationResult.data, 
        req.user!.companyId
      );
      if (!tag) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update task tag",
        details: error.message 
      });
    }
  });

  app.delete("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteTaskTag(req.params.id, req.user!.companyId);
      if (!success) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete task tag",
        details: error.message 
      });
    }
  });

  app.post("/api/task-tags/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ 
          error: "Updates array is required" 
        });
      }

      await storage.updateTaskTagsOrder(updates, req.user!.companyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to reorder task tags",
        details: error.message 
      });
    }
  });

  // Task Template Statuses routes (company-specific)
  app.get("/api/task-template-statuses", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const statuses = await storage.getTaskTemplateStatuses(req.user!.companyId);
      res.json(statuses);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch task template statuses",
        details: error.message 
      });
    }
  });

  app.get("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const status = await storage.getTaskTemplateStatus(req.params.id, req.user!.companyId);
      if (!status) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch task template status",
        details: error.message 
      });
    }
  });

  app.post("/api/task-template-statuses", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateStatusSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId;

      // Get max display order and increment
      const existingStatuses = await storage.getTaskTemplateStatuses(companyId);
      const maxOrder = existingStatuses.reduce((max, status) => 
        Math.max(max, status.displayOrder), 0);

      const status = await storage.createTaskTemplateStatus({
        ...validationResult.data,
        companyId,
        displayOrder: maxOrder + 1
      });
      res.status(201).json(status);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create task template status",
        details: error.message 
      });
    }
  });

  app.patch("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateStatusSchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const status = await storage.updateTaskTemplateStatus(
        req.params.id, 
        validationResult.data, 
        req.user!.companyId
      );
      if (!status) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update task template status",
        details: error.message 
      });
    }
  });

  app.delete("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteTaskTemplateStatus(req.params.id, req.user!.companyId);
      if (!success) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete task template status",
        details: error.message 
      });
    }
  });

  app.post("/api/task-template-statuses/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ 
          error: "Updates array is required" 
        });
      }

      await storage.updateTaskTemplateStatusesOrder(updates, req.user!.companyId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to reorder task template statuses",
        details: error.message 
      });
    }
  });

  // Checklist Template routes
  app.get("/api/checklist-templates", async (req, res) => {
    try {
      const templates = await storage.getChecklistTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist templates",
        details: error.message 
      });
    }
  });

  app.get("/api/checklist-templates/:id", async (req, res) => {
    try {
      const template = await storage.getChecklistTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch template",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-templates", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.createChecklistTemplate(validationResult.data);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create template",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-templates/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.updateChecklistTemplate(req.params.id, validationResult.data);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update template",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete template",
        details: error.message 
      });
    }
  });

  // Duplicate checklist template (with all groups and items)
  app.post("/api/checklist-templates/:id/duplicate", async (req, res) => {
    let duplicateTemplate: any = null;
    
    try {
      const { id } = req.params;
      
      // Get original template
      const templates = await storage.getChecklistTemplates();
      const originalTemplate = templates.find(t => t.id === id);
      
      if (!originalTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      // Create duplicate template
      duplicateTemplate = await storage.createChecklistTemplate({
        name: `${originalTemplate.name} (Copy)`,
        description: originalTemplate.description,
        type: originalTemplate.type as "Task" | "Job" | "Estimation" | "Lead",
      });
      
      // Get original groups and items
      const groups = await storage.getChecklistTemplateGroups(id);
      
      // Duplicate each group and its items
      for (const group of groups) {
        const duplicateGroup = await storage.createChecklistTemplateGroup({
          templateId: duplicateTemplate.id,
          name: group.name,
          order: group.order,
        });
        
        const items = await storage.getChecklistTemplateItems(group.id);
        for (const item of items) {
          await storage.createChecklistTemplateItem({
            groupId: duplicateGroup.id,
            description: item.description,
            order: item.order,
          });
        }
      }
      
      res.json(duplicateTemplate);
    } catch (error: any) {
      // Cleanup: hard delete partially created duplicate on error
      // This will cascade delete all groups and items due to onDelete: cascade in schema
      if (duplicateTemplate) {
        try {
          await storage.hardDeleteChecklistTemplate(duplicateTemplate.id);
        } catch (cleanupError) {
          // Log cleanup error but don't override original error
          console.error("Failed to cleanup duplicate template after error:", cleanupError);
        }
      }
      res.status(500).json({ error: error.message });
    }
  });

  // Checklist Template Group routes
  app.get("/api/checklist-templates/:templateId/groups", async (req, res) => {
    try {
      const groups = await storage.getChecklistTemplateGroups(req.params.templateId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch groups",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-template-groups", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateGroupSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.createChecklistTemplateGroup(validationResult.data);
      res.status(201).json(group);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create group",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-template-groups/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateGroupSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.updateChecklistTemplateGroup(req.params.id, validationResult.data);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update group",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-template-groups/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplateGroup(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete group",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-template-groups/:id/move-to", async (req, res) => {
    try {
      const { targetGroupId } = req.body;
      if (!targetGroupId) {
        return res.status(400).json({ error: "Target group ID is required" });
      }

      const sourceGroupId = req.params.id;
      
      const sourceGroup = await storage.getChecklistTemplateGroup(sourceGroupId);
      if (!sourceGroup) {
        return res.status(404).json({ error: "Source group not found" });
      }

      const targetGroup = await storage.getChecklistTemplateGroup(targetGroupId);
      if (!targetGroup) {
        return res.status(404).json({ error: "Target group not found" });
      }

      const sourceItems = await storage.getChecklistTemplateItems(sourceGroupId);

      for (const item of sourceItems) {
        await storage.updateChecklistTemplateItem(item.id, { groupId: targetGroupId });
      }

      await storage.deleteChecklistTemplateGroup(sourceGroupId);

      res.json({ 
        success: true, 
        message: `Moved ${sourceItems.length} items from "${sourceGroup.name}" to "${targetGroup.name}"`,
        itemsMoved: sourceItems.length
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to move group",
        details: error.message 
      });
    }
  });

  // Checklist Template Item routes
  app.get("/api/checklist-template-groups/:groupId/items", async (req, res) => {
    try {
      const items = await storage.getChecklistTemplateItems(req.params.groupId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch items",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-template-items", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createChecklistTemplateItem(validationResult.data);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create item",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-template-items/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistTemplateItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateChecklistTemplateItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update item",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-template-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplateItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete item",
        details: error.message 
      });
    }
  });

  // Checklist Template Import/Export routes
  app.post("/api/checklist-templates/import", async (req, res) => {
    try {
      const { items } = req.body;
      
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ 
          error: "Items array is required" 
        });
      }

      let templatesCreated = 0;
      let groupsCreated = 0;
      let itemsCreated = 0;

      // Group items by template name
      const templateMap = new Map<string, {
        name: string;
        description: string | null;
        type: "Task" | "Job" | "Estimation" | "Lead";
        groups: Map<string, Array<{ description: string; order: number }>>;
      }>();

      // First pass: organize data structure
      for (const row of items) {
        if (!row.templateName || !row.type) {
          continue; // Skip invalid rows
        }

        const templateKey = row.templateName.trim();
        
        if (!templateMap.has(templateKey)) {
          templateMap.set(templateKey, {
            name: row.templateName,
            description: row.templateDescription || null,
            type: row.type,
            groups: new Map(),
          });
        }

        const template = templateMap.get(templateKey)!;
        
        // Use "General" as default group if no group name provided
        const groupKey = (row.groupName && row.groupName.trim()) ? row.groupName.trim() : "General";
        
        if (!template.groups.has(groupKey)) {
          template.groups.set(groupKey, []);
        }

        // Add item if provided
        if (row.itemDescription && row.itemDescription.trim()) {
          template.groups.get(groupKey)!.push({
            description: row.itemDescription,
            order: template.groups.get(groupKey)!.length,
          });
        }
      }

      // Second pass: create database records
      for (const [, templateData] of Array.from(templateMap)) {
        // Create template
        const template = await storage.createChecklistTemplate({
          name: templateData.name,
          description: templateData.description,
          type: templateData.type,
        });
        templatesCreated++;

        // Create groups and items
        let groupOrder = 0;
        for (const [groupName, groupItems] of Array.from(templateData.groups)) {
          const group = await storage.createChecklistTemplateGroup({
            templateId: template.id,
            name: groupName,
            order: groupOrder++,
          });
          groupsCreated++;

          // Create items for this group
          for (const item of groupItems) {
            await storage.createChecklistTemplateItem({
              groupId: group.id,
              description: item.description,
              order: item.order,
            });
            itemsCreated++;
          }
        }
      }

      res.json({
        templatesCreated,
        groupsCreated,
        itemsCreated,
        totalProcessed: items.length,
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to import checklist templates",
        details: error.message 
      });
    }
  });

  app.get("/api/checklist-templates/export", async (req, res) => {
    try {
      const templates = await storage.getChecklistTemplates();
      const exportData = [];

      for (const template of templates) {
        const groups = await storage.getChecklistTemplateGroups(template.id);
        
        if (groups.length === 0) {
          // Template with no groups
          exportData.push({
            templateName: template.name,
            templateDescription: template.description || "",
            type: template.type,
            groupName: "",
            itemDescription: "",
          });
        } else {
          for (const group of groups) {
            const items = await storage.getChecklistTemplateItems(group.id);
            
            if (items.length === 0) {
              // Group with no items
              exportData.push({
                templateName: template.name,
                templateDescription: template.description || "",
                type: template.type,
                groupName: group.name,
                itemDescription: "",
              });
            } else {
              for (const item of items) {
                exportData.push({
                  templateName: template.name,
                  templateDescription: template.description || "",
                  type: template.type,
                  groupName: group.name,
                  itemDescription: item.description,
                });
              }
            }
          }
        }
      }

      res.json(exportData);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to export checklist templates",
        details: error.message 
      });
    }
  });

  // Checklist Instance routes
  app.get("/api/checklist-instances", async (req, res) => {
    try {
      const projectId = req.query.projectId as string | undefined;
      const instances = await storage.getChecklistInstances(projectId);
      
      // Get item counts for each instance
      const instancesWithCounts = await Promise.all(
        instances.map(async (instance) => {
          const items = await storage.getChecklistInstanceItems(instance.id);
          const completedCount = items.filter(i => i.status === "completed" || i.status === "na").length;
          return {
            ...instance,
            completedCount,
            totalCount: items.length,
          };
        })
      );
      
      res.json(instancesWithCounts);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist instances",
        details: error.message 
      });
    }
  });

  app.get("/api/checklist-instances/:id", async (req, res) => {
    try {
      const instance = await storage.getChecklistInstance(req.params.id);
      if (!instance) {
        return res.status(404).json({ error: "Checklist instance not found" });
      }
      res.json(instance);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist instance",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-instances", async (req, res) => {
    try {
      const user = req.user as any;
      const validationResult = insertChecklistInstanceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const data = {
        ...validationResult.data,
        companyId: user?.companyId,
        createdBy: user?.id,
        createdByName: user?.name,
        // Convert empty string assigneeId to null for foreign key constraint
        assigneeId: validationResult.data.assigneeId || null,
      };

      // Extract selectedGroupIds before creating instance (it's not a db column)
      const selectedGroupIds = data.selectedGroupIds;
      delete (data as any).selectedGroupIds;

      const instance = await storage.createChecklistInstance(data);

      // If created from a template, copy the template items
      if (data.templateId) {
        const groups = await storage.getChecklistTemplateGroups(data.templateId);
        
        // Filter groups if selectedGroupIds is provided
        const filteredGroups = selectedGroupIds && selectedGroupIds.length > 0
          ? groups.filter(g => selectedGroupIds.includes(g.id))
          : groups;
        
        for (const group of filteredGroups) {
          const templateItems = await storage.getChecklistTemplateItems(group.id);
          for (const templateItem of templateItems) {
            await storage.createChecklistInstanceItem({
              instanceId: instance.id,
              groupName: group.name,
              groupOrder: group.order,
              description: templateItem.description,
              tooltip: templateItem.tooltip,
              order: templateItem.order,
              isRequired: templateItem.isRequired ?? false,
              status: "pending",
            });
          }
        }
      }

      res.status(201).json(instance);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create checklist instance",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-instances/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistInstanceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const instance = await storage.updateChecklistInstance(req.params.id, validationResult.data);
      if (!instance) {
        return res.status(404).json({ error: "Checklist instance not found" });
      }
      res.json(instance);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update checklist instance",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-instances/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistInstance(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Checklist instance not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete checklist instance",
        details: error.message 
      });
    }
  });

  // Checklist Instance Group routes (these are "Checklists" in user terminology)
  app.get("/api/checklist-instances/:instanceId/groups", async (req, res) => {
    try {
      const groups = await storage.getChecklistInstanceGroups(req.params.instanceId);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist groups",
        details: error.message 
      });
    }
  });

  app.get("/api/checklist-instance-groups/:id", async (req, res) => {
    try {
      const group = await storage.getChecklistInstanceGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Checklist group not found" });
      }
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist group",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-instances/:instanceId/groups", async (req, res) => {
    try {
      const validationResult = insertChecklistInstanceGroupSchema.safeParse({
        ...req.body,
        instanceId: req.params.instanceId,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.createChecklistInstanceGroup(validationResult.data);
      res.status(201).json(group);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create checklist group",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-instance-groups/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistInstanceGroupSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const group = await storage.updateChecklistInstanceGroup(req.params.id, validationResult.data);
      if (!group) {
        return res.status(404).json({ error: "Checklist group not found" });
      }
      res.json(group);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update checklist group",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-instance-groups/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistInstanceGroup(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Checklist group not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete checklist group",
        details: error.message 
      });
    }
  });

  // Checklist Instance Item routes
  app.get("/api/checklist-instances/:instanceId/items", async (req, res) => {
    try {
      const items = await storage.getChecklistInstanceItems(req.params.instanceId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch checklist instance items",
        details: error.message 
      });
    }
  });

  app.post("/api/checklist-instances/:instanceId/items", async (req, res) => {
    try {
      const validationResult = insertChecklistInstanceItemSchema.safeParse({
        ...req.body,
        instanceId: req.params.instanceId,
      });
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createChecklistInstanceItem(validationResult.data);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create checklist instance item",
        details: error.message 
      });
    }
  });

  app.patch("/api/checklist-instance-items/:id", async (req, res) => {
    try {
      const validationResult = insertChecklistInstanceItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateChecklistInstanceItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Checklist instance item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update checklist instance item",
        details: error.message 
      });
    }
  });

  app.delete("/api/checklist-instance-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistInstanceItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Checklist instance item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete checklist instance item",
        details: error.message 
      });
    }
  });

  // Budget routes
  app.get("/api/projects/:projectId/budget", async (req, res) => {
    try {
      const budget = await storage.getBudget(req.params.projectId);
      if (!budget) {
        // Auto-create budget if it doesn't exist
        const newBudget = await storage.calculateBudget(req.params.projectId);
        return res.json(newBudget);
      }
      res.json(budget);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch budget",
        details: error.message 
      });
    }
  });

  app.post("/api/projects/:projectId/budget/calculate", async (req, res) => {
    try {
      const budget = await storage.calculateBudget(req.params.projectId);
      res.json(budget);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to calculate budget",
        details: error.message 
      });
    }
  });

  app.patch("/api/budgets/:id", async (req, res) => {
    try {
      const validationResult = updateBudgetSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const budget = await storage.updateBudget(req.params.id, validationResult.data);
      if (!budget) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.json(budget);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update budget",
        details: error.message 
      });
    }
  });

  app.delete("/api/budgets/:id", async (req, res) => {
    try {
      const success = await storage.deleteBudget(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete budget",
        details: error.message 
      });
    }
  });

  // Budget Line Items routes
  app.get("/api/budgets/:budgetId/line-items", async (req, res) => {
    try {
      const lineItems = await storage.getBudgetLineItems(req.params.budgetId);
      res.json(lineItems);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch budget line items",
        details: error.message 
      });
    }
  });

  app.post("/api/budgets/:budgetId/line-items/recalculate", async (req, res) => {
    try {
      const lineItems = await storage.recalculateBudgetLineItems(req.params.budgetId);
      res.json(lineItems);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to recalculate budget line items",
        details: error.message 
      });
    }
  });

  app.patch("/api/budget-line-items/:id", async (req, res) => {
    try {
      const validationResult = updateBudgetLineItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const lineItem = await storage.updateBudgetLineItem(req.params.id, validationResult.data);
      if (!lineItem) {
        return res.status(404).json({ error: "Budget line item not found" });
      }
      res.json(lineItem);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update budget line item",
        details: error.message 
      });
    }
  });

  // Labour Hours Budget routes
  app.get("/api/projects/:projectId/labour-hours-budget", async (req, res) => {
    try {
      const labourHours = await storage.getLabourHoursBudget(req.params.projectId);
      res.json(labourHours);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch labour hours budget",
        details: error.message 
      });
    }
  });

  app.post("/api/projects/:projectId/labour-hours-budget/recalculate", async (req, res) => {
    try {
      const labourHours = await storage.recalculateLabourHoursBudget(req.params.projectId);
      res.json(labourHours);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to recalculate labour hours budget",
        details: error.message 
      });
    }
  });

  // Allowances routes
  app.get("/api/projects/:projectId/allowances", async (req, res) => {
    try {
      const allowances = await storage.getProjectAllowances(req.params.projectId);
      res.json(allowances);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch allowances",
        details: error.message 
      });
    }
  });

  // Timesheet routes
  app.get("/api/projects/:projectId/timesheets", async (req, res) => {
    try {
      const timesheets = await storage.getTimesheets(req.params.projectId);
      res.json(timesheets);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get project timesheets",
        details: error.message
      });
    }
  });

  app.get("/api/timesheets", async (req, res) => {
    try {
      const { projectId, userId, startDate, endDate, status, costCodeId, invoiced } = req.query;
      const timesheets = await storage.getTimesheets(
        projectId as string | undefined,
        {
          userId: userId as string | undefined,
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          status: status as string | undefined,
          costCodeId: costCodeId as string | undefined,
          invoiced: invoiced ? invoiced === 'true' : undefined,
        }
      );
      res.json(timesheets);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get timesheets",
        details: error.message
      });
    }
  });

  // Clock-in/out routes - must be before :id routes
  app.get("/api/timesheets/active", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const user = (req.user as any).dbUser;
      if (!user?.id) {
        return res.status(401).json({ error: "User not found in database" });
      }
      const activeTimesheet = await storage.getActiveTimesheet(user.id);
      res.json(activeTimesheet || null);
    } catch (error) {
      console.error("Error fetching active timesheet:", error);
      res.status(500).json({ error: "Failed to fetch active timesheet" });
    }
  });

  app.post("/api/timesheets/clock-in", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const user = (req.user as any).dbUser;
      if (!user?.id) {
        return res.status(401).json({ error: "User not found in database" });
      }
      const { projectId, costCodeId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const timesheet = await storage.clockIn(projectId, user.id, costCodeId);
      res.status(201).json(timesheet);
    } catch (error) {
      console.error("Error clocking in:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });

  app.post("/api/timesheets/clock-out", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const user = (req.user as any).dbUser;
      if (!user?.id) {
        return res.status(401).json({ error: "User not found in database" });
      }
      const { timesheetId } = req.body;
      if (!timesheetId) {
        return res.status(400).json({ error: "timesheetId is required" });
      }
      const timesheet = await storage.clockOut(timesheetId, user.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      console.error("Error clocking out:", error);
      if (error instanceof Error && error.message.includes("Unauthorized")) {
        return res.status(403).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to clock out" });
    }
  });

  app.get("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get timesheet",
        details: error.message
      });
    }
  });

  app.post("/api/timesheets", async (req, res) => {
    try {
      const timesheet = await storage.createTimesheet(req.body);
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to create timesheet",
        details: error.message
      });
    }
  });

  app.patch("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.updateTimesheet(req.params.id, req.body);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to update timesheet",
        details: error.message
      });
    }
  });

  app.delete("/api/timesheets/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTimesheet(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to delete timesheet",
        details: error.message
      });
    }
  });

  app.post("/api/timesheets/:id/submit", async (req, res) => {
    try {
      const timesheet = await storage.submitTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to submit timesheet",
        details: error.message
      });
    }
  });

  app.post("/api/timesheets/:id/approve", async (req, res) => {
    try {
      const timesheet = await storage.approveTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to approve timesheet",
        details: error.message
      });
    }
  });

  app.post("/api/timesheets/:id/reject", async (req, res) => {
    try {
      const timesheet = await storage.rejectTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to reject timesheet",
        details: error.message
      });
    }
  });

  // Timesheet cost codes routes
  app.get("/api/timesheets/:timesheetId/cost-codes", async (req, res) => {
    try {
      const costCodes = await storage.getTimesheetCostCodes(req.params.timesheetId);
      res.json(costCodes);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to get timesheet cost codes",
        details: error.message
      });
    }
  });

  app.post("/api/timesheets/:timesheetId/cost-codes", async (req, res) => {
    try {
      const costCode = await storage.createTimesheetCostCode({
        ...req.body,
        timesheetId: req.params.timesheetId
      });
      res.json(costCode);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to create timesheet cost code",
        details: error.message
      });
    }
  });

  app.patch("/api/timesheets/cost-codes/:id", async (req, res) => {
    try {
      const costCode = await storage.updateTimesheetCostCode(req.params.id, req.body);
      if (!costCode) {
        return res.status(404).json({ error: "Timesheet cost code not found" });
      }
      res.json(costCode);
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to update timesheet cost code",
        details: error.message
      });
    }
  });

  app.delete("/api/timesheets/cost-codes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTimesheetCostCode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Timesheet cost code not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({
        error: "Failed to delete timesheet cost code",
        details: error.message
      });
    }
  });

  // Timesheet Allowances routes
  app.get("/api/timesheets/:timesheetId/allowances", async (req, res) => {
    try {
      const allowances = await storage.getTimesheetAllowances(req.params.timesheetId);
      res.json(allowances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch timesheet allowances" });
    }
  });

  app.post("/api/timesheet-allowances", async (req, res) => {
    try {
      const validationResult = insertTimesheetAllowanceSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const allowance = await storage.createTimesheetAllowance(validationResult.data);
      res.status(201).json(allowance);
    } catch (error) {
      res.status(500).json({ error: "Failed to create timesheet allowance" });
    }
  });

  app.patch("/api/timesheet-allowances/:id", async (req, res) => {
    try {
      const validationResult = insertTimesheetAllowanceSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const allowance = await storage.updateTimesheetAllowance(req.params.id, validationResult.data);
      if (!allowance) {
        return res.status(404).json({ error: "Timesheet allowance not found" });
      }
      res.json(allowance);
    } catch (error) {
      res.status(500).json({ error: "Failed to update timesheet allowance" });
    }
  });

  app.delete("/api/timesheet-allowances/:id", async (req, res) => {
    try {
      await storage.deleteTimesheetAllowance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete timesheet allowance" });
    }
  });

  // Allowance Items (custom lines for PS allowances)
  app.get("/api/estimate-items/:estimateItemId/allowance-items", async (req, res) => {
    try {
      const items = await storage.getAllowanceItems(req.params.estimateItemId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch allowance items" });
    }
  });

  app.post("/api/allowance-items", async (req, res) => {
    try {
      const validationResult = insertAllowanceItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.createAllowanceItem(validationResult.data);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to create allowance item" });
    }
  });

  app.patch("/api/allowance-items/:id", async (req, res) => {
    try {
      const validationResult = insertAllowanceItemSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const item = await storage.updateAllowanceItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Allowance item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update allowance item" });
    }
  });

  app.delete("/api/allowance-items/:id", async (req, res) => {
    try {
      await storage.deleteAllowanceItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete allowance item" });
    }
  });

  // Schedule routes
  app.get("/api/projects/:projectId/schedule", async (req, res) => {
    try {
      const schedule = await storage.getSchedule(req.params.projectId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule",
        details: error.message 
      });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      const validationResult = insertScheduleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const schedule = await storage.createSchedule(validationResult.data);
      res.status(201).json(schedule);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create schedule",
        details: error.message 
      });
    }
  });

  app.patch("/api/schedules/:id", async (req, res) => {
    try {
      const validationResult = updateScheduleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const schedule = await storage.updateSchedule(req.params.id, validationResult.data);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update schedule",
        details: error.message 
      });
    }
  });

  app.put("/api/schedules/:id/status", async (req, res) => {
    try {
      const { status } = req.body;
      if (!["offline", "online", "locked"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be offline, online, or locked" });
      }
      
      const userId = req.user?.id;
      const schedule = await storage.updateScheduleStatus(req.params.id, status, userId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update schedule status",
        details: error.message 
      });
    }
  });

  app.delete("/api/schedules/:id", async (req, res) => {
    try {
      const success = await storage.deleteSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete schedule",
        details: error.message 
      });
    }
  });

  // Schedule Items routes
  app.get("/api/schedules/:scheduleId/items", async (req, res) => {
    try {
      const items = await storage.getScheduleItems(req.params.scheduleId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule items",
        details: error.message 
      });
    }
  });

  // Get schedule items for a specific project (used by Gantt timeline)
  app.get("/api/projects/:projectId/schedule-items", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getScheduleItemsByProject(req.params.projectId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule items",
        details: error.message 
      });
    }
  });

  // Get all schedule items across all schedules/projects
  app.get("/api/schedule-items/all", async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      
      const items = await storage.getAllScheduleItems(user.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch all schedule items",
        details: error.message 
      });
    }
  });

  app.get("/api/schedule-items/:id", async (req, res) => {
    try {
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule item",
        details: error.message 
      });
    }
  });

  app.post("/api/schedule-items", requireAuth, async (req, res) => {
    try {
      const validationResult = insertScheduleItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const item = await storage.createScheduleItem(validationResult.data);
      
      // Log activity for schedule item creation
      try {
        const schedule = await storage.getScheduleById(item.scheduleId);
        if (schedule && req.user) {
          const userName = req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`
            : req.user.username || req.user.email || "User";
          
          await storage.createActivity({
            projectId: schedule.projectId,
            userId: req.user.id,
            userName: userName,
            activityType: "schedule",
            action: "created",
            description: `added schedule item`,
            entityId: item.id,
            entityName: null,
            metadata: { changes: [{ name: item.name, change: "added" }] }
          });
        }
      } catch (activityError) {
        console.error("Failed to log schedule item creation activity:", activityError);
      }
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create schedule item",
        details: error.message 
      });
    }
  });

  app.patch("/api/schedule-items/:id", requireAuth, async (req, res) => {
    try {
      const validationResult = updateScheduleItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      // Get original item to track changes
      const originalItem = await storage.getScheduleItem(req.params.id);
      
      const item = await storage.updateScheduleItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      
      // Log activity for schedule item update
      try {
        const schedule = await storage.getScheduleById(item.scheduleId);
        if (schedule && req.user) {
          const userName = req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`
            : req.user.username || req.user.email || "User";
          
          // Determine what changed
          const changes: string[] = [];
          const updateData = validationResult.data;
          if (updateData.name && updateData.name !== originalItem?.name) changes.push("renamed");
          if (updateData.startDate || updateData.endDate) changes.push("dates updated");
          if (updateData.status && updateData.status !== originalItem?.status) changes.push(`status changed to ${updateData.status}`);
          if (updateData.assigneeId !== undefined && updateData.assigneeId !== originalItem?.assigneeId) changes.push("assigned");
          if (updateData.progress !== undefined && updateData.progress !== originalItem?.progress) changes.push(`progress updated to ${updateData.progress}%`);
          
          const changeDescription = changes.length > 0 ? changes.join(", ") : "updated";
          
          await storage.createActivity({
            projectId: schedule.projectId,
            userId: req.user.id,
            userName: userName,
            activityType: "schedule",
            action: "updated",
            description: `updated schedule item`,
            entityId: item.id,
            entityName: null,
            metadata: { changes: [{ name: item.name, change: changeDescription }] }
          });
        }
      } catch (activityError) {
        console.error("Failed to log schedule item update activity:", activityError);
      }
      
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update schedule item",
        details: error.message 
      });
    }
  });

  app.post("/api/schedule-items/bulk", requireAuth, async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Expected items array" });
      }
      
      // Get original items to track changes
      const originalItemsMap = new Map<string, any>();
      for (const item of items) {
        if (item.id) {
          const originalItem = await storage.getScheduleItem(item.id);
          if (originalItem) {
            originalItemsMap.set(item.id, originalItem);
          }
        }
      }
      
      const updatedItems = await storage.bulkUpdateScheduleItems(items);
      
      // Log batch activity for schedule item updates
      try {
        if (updatedItems.length > 0 && req.user) {
          const firstItem = updatedItems[0];
          const schedule = await storage.getScheduleById(firstItem.scheduleId);
          
          if (schedule) {
            const userName = req.user.firstName && req.user.lastName 
              ? `${req.user.firstName} ${req.user.lastName}`
              : req.user.username || req.user.email || "User";
            
            // Build changes list for grouped display
            const changes: Array<{ name: string; change: string }> = [];
            
            for (const item of updatedItems) {
              const original = originalItemsMap.get(item.id);
              const changeDetails: string[] = [];
              
              if (original) {
                if (item.name !== original.name) changeDetails.push("renamed");
                if (item.startDate !== original.startDate || item.endDate !== original.endDate) changeDetails.push("dates updated");
                if (item.status !== original.status) changeDetails.push(`status changed to ${item.status}`);
                if (item.assigneeId !== original.assigneeId) changeDetails.push("assigned");
                if (item.progress !== original.progress) changeDetails.push(`progress updated to ${item.progress}%`);
              }
              
              const changeText = changeDetails.length > 0 ? changeDetails.join(", ") : "updated";
              changes.push({ name: item.name, change: changeText });
            }
            
            await storage.createActivity({
              projectId: schedule.projectId,
              userId: req.user.id,
              userName: userName,
              activityType: "schedule",
              action: "batch_updated",
              description: `updated ${updatedItems.length} schedule items`,
              entityId: null,
              entityName: null,
              metadata: { changes }
            });
          }
        }
      } catch (activityError) {
        console.error("Failed to log bulk schedule item update activity:", activityError);
      }
      
      res.json(updatedItems);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to bulk update schedule items",
        details: error.message 
      });
    }
  });

  // Batch update sortOrder for schedule items (drag reorder)
  app.post("/api/schedule-items/batch-sort", requireAuth, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Expected updates array" });
      }
      
      // Validate all items belong to user's company before updating
      const userCompanyId = req.user?.companyId;
      if (!userCompanyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }
      
      // Verify each item's ownership
      for (const update of updates) {
        const { id } = update;
        if (!id) continue;
        
        const item = await storage.getScheduleItem(id);
        if (!item) {
          return res.status(404).json({ error: `Schedule item ${id} not found` });
        }
        
        const schedule = await storage.getScheduleById(item.scheduleId);
        if (!schedule) {
          return res.status(404).json({ error: `Schedule not found for item ${id}` });
        }
        
        const project = await storage.getProject(schedule.projectId);
        if (!project || project.companyId !== userCompanyId) {
          return res.status(403).json({ error: "Unauthorized to update this schedule item" });
        }
      }
      
      const updatedItems = [];
      for (const update of updates) {
        const { id, sortOrder, parentItemId } = update;
        if (!id || sortOrder === undefined) continue;
        
        const updateData: any = { sortOrder };
        if (parentItemId !== undefined) {
          updateData.parentItemId = parentItemId;
        }
        
        const item = await storage.updateScheduleItem(id, updateData);
        if (item) {
          updatedItems.push(item);
        }
      }
      
      res.json(updatedItems);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to batch update sort order",
        details: error.message 
      });
    }
  });

  // Bulk create schedule items from import
  app.post("/api/schedule-items/bulk-create", requireAuth, async (req, res) => {
    try {
      const { scheduleId, items } = req.body;
      
      if (!scheduleId) {
        return res.status(400).json({ error: "scheduleId is required" });
      }
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items array is required and must not be empty" });
      }

      const schedule = await storage.getScheduleById(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Get existing items count for sort order offset
      const existingItems = await storage.getScheduleItems(scheduleId);
      const sortOrderOffset = existingItems.length;

      const createdItems = [];
      const today = new Date();
      
      let cumulativeDays = 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const duration = typeof item.duration === 'number' && item.duration >= 1 ? item.duration : 1;
        
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + cumulativeDays);
        
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + duration - 1);
        
        cumulativeDays += duration;

        const scheduleItem = await storage.createScheduleItem({
          scheduleId,
          name: item.name,
          description: item.description || null,
          startDate: startDate,
          endDate: endDate,
          type: item.type || "task",
          status: "not_started",
          priority: "medium",
          category: item.category || null,
          sortOrder: sortOrderOffset + i,
        });
        
        createdItems.push(scheduleItem);
      }

      // Log activity
      try {
        if (req.user) {
          const userName = req.user.firstName && req.user.lastName 
            ? `${req.user.firstName} ${req.user.lastName}`
            : req.user.username || req.user.email || "User";
          
          await storage.createActivity({
            projectId: schedule.projectId,
            userId: req.user.id,
            userName: userName,
            activityType: "schedule",
            action: "imported",
            description: `imported ${createdItems.length} schedule items`,
            entityId: null,
            entityName: null,
            metadata: { 
              changes: createdItems.slice(0, 5).map(item => ({ 
                name: item.name, 
                change: "imported" 
              }))
            }
          });
        }
      } catch (activityError) {
        console.error("Failed to log bulk create activity:", activityError);
      }

      res.status(201).json(createdItems);
    } catch (error: any) {
      console.error("Failed to bulk create schedule items:", error);
      res.status(500).json({ 
        error: "Failed to import schedule items",
        details: error.message 
      });
    }
  });

  app.delete("/api/schedule-items/:id", requireAuth, async (req, res) => {
    try {
      // Get item info before deletion for activity logging
      const item = await storage.getScheduleItem(req.params.id);
      
      const success = await storage.deleteScheduleItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      
      // Log activity for schedule item deletion
      try {
        if (item && req.user) {
          const schedule = await storage.getScheduleById(item.scheduleId);
          if (schedule) {
            const userName = req.user.firstName && req.user.lastName 
              ? `${req.user.firstName} ${req.user.lastName}`
              : req.user.username || req.user.email || "User";
            
            await storage.createActivity({
              projectId: schedule.projectId,
              userId: req.user.id,
              userName: userName,
              activityType: "schedule",
              action: "deleted",
              description: `removed schedule item`,
              entityId: req.params.id,
              entityName: null,
              metadata: { changes: [{ name: item.name, change: "removed" }] }
            });
          }
        }
      } catch (activityError) {
        console.error("Failed to log schedule item deletion activity:", activityError);
      }
      
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete schedule item",
        details: error.message 
      });
    }
  });

  // Schedule item dependency management
  app.post("/api/schedule-items/:id/dependencies", async (req, res) => {
    try {
      const { predecessorId, type = "FS", lag = 0 } = req.body;
      
      if (!predecessorId) {
        return res.status(400).json({ error: "predecessorId is required" });
      }

      // Validate dependency type
      if (!["FS", "SS", "FF", "SF"].includes(type)) {
        return res.status(400).json({ error: "Invalid dependency type. Must be FS, SS, FF, or SF" });
      }

      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }

      // Check if dependency already exists
      const dependencies = (item.dependencies as any[]) || [];
      const existingDep = dependencies.find(d => d.id === predecessorId);
      if (existingDep) {
        return res.status(400).json({ error: "Dependency already exists" });
      }

      // Check for circular dependencies
      const predecessor = await storage.getScheduleItem(predecessorId);
      if (!predecessor) {
        return res.status(404).json({ error: "Predecessor item not found" });
      }

      // Prevent item from depending on itself
      if (predecessorId === req.params.id) {
        return res.status(400).json({ error: "Item cannot depend on itself" });
      }

      // Check for circular dependency chains using depth-first search
      const wouldCreateCycle = (startId: string, targetId: string, visited = new Set<string>()): boolean => {
        if (startId === targetId) return true;
        if (visited.has(startId)) return false;
        visited.add(startId);

        const predDeps = (predecessor.dependencies as any[]) || [];
        for (const dep of predDeps) {
          if (wouldCreateCycle(dep.id, targetId, visited)) {
            return true;
          }
        }
        return false;
      };

      if (wouldCreateCycle(predecessorId, req.params.id)) {
        return res.status(400).json({ error: "This would create a circular dependency" });
      }

      // Add dependency with lag
      const updatedDependencies = [...dependencies, { id: predecessorId, type, lag: parseInt(lag) || 0 }];
      const updatedItem = await storage.updateScheduleItem(req.params.id, {
        dependencies: updatedDependencies
      });

      res.json(updatedItem);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to add dependency",
        details: error.message 
      });
    }
  });

  // Update a specific dependency (type, lag)
  app.patch("/api/schedule-items/:id/dependencies/:predecessorId", async (req, res) => {
    try {
      const { type, lag } = req.body;
      
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }

      const dependencies = (item.dependencies as any[]) || [];
      const depIndex = dependencies.findIndex(d => d.id === req.params.predecessorId);
      
      if (depIndex === -1) {
        return res.status(404).json({ error: "Dependency not found" });
      }

      // Validate type if provided
      if (type !== undefined && !["FS", "SS", "FF", "SF"].includes(type)) {
        return res.status(400).json({ error: "Invalid dependency type. Must be FS, SS, FF, or SF" });
      }

      // Update the dependency
      const updatedDep = { ...dependencies[depIndex] };
      if (type !== undefined) updatedDep.type = type;
      if (lag !== undefined) updatedDep.lag = parseInt(lag) || 0;
      
      const updatedDependencies = [...dependencies];
      updatedDependencies[depIndex] = updatedDep;

      const updatedItem = await storage.updateScheduleItem(req.params.id, {
        dependencies: updatedDependencies
      });

      res.json(updatedItem);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update dependency",
        details: error.message 
      });
    }
  });

  app.delete("/api/schedule-items/:id/dependencies/:predecessorId", async (req, res) => {
    try {
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }

      const dependencies = (item.dependencies as any[]) || [];
      const updatedDependencies = dependencies.filter(d => d.id !== req.params.predecessorId);

      const updatedItem = await storage.updateScheduleItem(req.params.id, {
        dependencies: updatedDependencies
      });

      res.json(updatedItem);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to remove dependency",
        details: error.message 
      });
    }
  });

  // Activity Notes routes
  app.post("/api/activity-notes/batch-counts", requireAuth, async (req, res) => {
    try {
      const { scheduleItemIds } = req.body;
      
      if (!Array.isArray(scheduleItemIds)) {
        return res.status(400).json({ error: "scheduleItemIds must be an array" });
      }
      
      const counts = await storage.getBatchActivityNoteCounts(scheduleItemIds);
      res.json(counts);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch batch activity note counts",
        details: error.message 
      });
    }
  });

  app.get("/api/schedule-items/:scheduleItemId/activity-notes", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const [notes, totalCount] = await Promise.all([
        storage.getActivityNotes(req.params.scheduleItemId, limit, offset),
        storage.getActivityNoteCount(req.params.scheduleItemId)
      ]);
      
      res.json({
        notes,
        totalCount,
        hasMore: offset + notes.length < totalCount
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch activity notes",
        details: error.message 
      });
    }
  });

  app.post("/api/schedule-items/:scheduleItemId/activity-notes", requireAuth, async (req, res) => {
    try {
      const validationResult = insertActivityNoteSchema.safeParse({
        ...req.body,
        scheduleItemId: req.params.scheduleItemId,
        userId: req.user!.id,
        userName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim() || req.user!.email,
      });

      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).message 
        });
      }

      const newNote = await storage.createActivityNote(validationResult.data);
      res.status(201).json(newNote);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create activity note",
        details: error.message 
      });
    }
  });

  app.patch("/api/activity-notes/:id", requireAuth, async (req, res) => {
    try {
      // Check if user can edit (5-minute window)
      const canEdit = await storage.canEditActivityNote(req.params.id, req.user!.id);
      if (!canEdit) {
        return res.status(403).json({ 
          error: "Cannot edit note. Notes can only be edited within 5 minutes of creation by the author." 
        });
      }

      const validationResult = insertActivityNoteSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).message 
        });
      }

      const updatedNote = await storage.updateActivityNote(req.params.id, validationResult.data);
      if (!updatedNote) {
        return res.status(404).json({ error: "Activity note not found" });
      }

      res.json(updatedNote);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update activity note",
        details: error.message 
      });
    }
  });

  app.delete("/api/activity-notes/:id", requireAuth, async (req, res) => {
    try {
      // Check if user is admin or the note author
      const canDelete = await storage.canEditActivityNote(req.params.id, req.user!.id);
      const isAdmin = req.user!.roleName === 'Admin' || req.user!.roleName === 'Owner';
      
      if (!canDelete && !isAdmin) {
        return res.status(403).json({ 
          error: "Cannot delete note. Only the author (within 5 minutes) or admins can delete notes." 
        });
      }

      const success = await storage.deleteActivityNote(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Activity note not found" });
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete activity note",
        details: error.message 
      });
    }
  });

  // Schedule Templates routes
  app.get("/api/schedule-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      const category = req.query.category as string | undefined;
      // Storage layer now filters by companyId + public templates
      const templates = await storage.getScheduleTemplates(user.companyId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule templates",
        details: error.message 
      });
    }
  });

  app.get("/api/schedule-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // Storage layer enforces companyId filtering
      const template = await storage.getScheduleTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Schedule template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule template",
        details: error.message 
      });
    }
  });

  app.post("/api/schedule-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const validationResult = insertScheduleTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      // Add company and creator information (server-side only)
      const templateData = {
        ...validationResult.data,
        companyId: user.companyId,
        createdBy: user.id,
        createdByName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      };
      
      const template = await storage.createScheduleTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create schedule template",
        details: error.message 
      });
    }
  });

  app.patch("/api/schedule-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // Get existing template to verify ownership (storage layer enforces companyId)
      const existingTemplate = await storage.getScheduleTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Schedule template not found" });
      }

      // Prevent modification of public templates (they should be read-only)
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot modify public templates - create a copy instead" });
      }

      const validationResult = updateScheduleTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      // Prevent client from changing immutable fields
      const { companyId, createdBy, createdByName, isPublic, ...safeUpdates } = validationResult.data;
      
      // Storage layer enforces companyId check in WHERE clause
      const template = await storage.updateScheduleTemplate(req.params.id, safeUpdates, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Schedule template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update schedule template",
        details: error.message 
      });
    }
  });

  app.delete("/api/schedule-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // Get existing template to verify ownership (storage layer enforces companyId)
      const existingTemplate = await storage.getScheduleTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Schedule template not found" });
      }

      // Prevent deletion of public templates (they should be permanent)
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot delete public templates - archive instead" });
      }

      // Storage layer enforces companyId check in WHERE clause
      const success = await storage.deleteScheduleTemplate(req.params.id, user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Schedule template not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete schedule template",
        details: error.message 
      });
    }
  });

  // Apply template to a schedule
  app.post("/api/schedule-templates/:id/apply", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scheduleId } = req.body;
      const user = req.user as any;
      
      if (!scheduleId) {
        return res.status(400).json({ error: "scheduleId is required" });
      }

      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }

      // Get the template (storage layer enforces companyId + public access)
      const template = await storage.getScheduleTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Schedule template not found or access denied" });
      }

      // Get the schedule to verify it exists and belongs to user's company
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Verify schedule belongs to a project in the user's company
      const project = await storage.getProject(schedule.projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (project.companyId !== user.companyId) {
        return res.status(403).json({ error: "Access denied to this schedule" });
      }

      // Verify user is a member of the project
      const isMember = await storage.isProjectMember(user.id, schedule.projectId);
      if (!isMember) {
        return res.status(403).json({ error: "You are not a member of this project" });
      }

      // Create schedule items from template data
      const templateItems = template.templateData as any[];
      const createdItems = [];

      for (const templateItem of templateItems) {
        const newItem = await storage.createScheduleItem({
          scheduleId: scheduleId,
          name: templateItem.name,
          description: templateItem.description || null,
          notes: templateItem.notes || null,
          type: templateItem.type || "task",
          status: "not_started", // Always start as not_started
          priority: templateItem.priority || "medium",
          startDate: new Date(), // Default to today, user can adjust
          endDate: new Date(Date.now() + (templateItem.duration || 1) * 24 * 60 * 60 * 1000), // Calculate from duration
          duration: templateItem.duration || 1,
          progressPercent: 0,
          sortOrder: templateItem.sortOrder || 0,
        });
        createdItems.push(newItem);
      }

      res.status(201).json({ 
        message: "Template applied successfully",
        itemsCreated: createdItems.length,
        items: createdItems 
      });
    } catch (error: any) {
      console.error("Error applying schedule template:", error);
      res.status(500).json({ 
        error: "Failed to apply schedule template",
        details: error.message 
      });
    }
  });

  // Estimate Templates routes
  app.get("/api/estimate-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const category = req.query.category as string | undefined;
      const templates = await storage.getEstimateTemplates(user.companyId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch estimate templates",
        details: error.message 
      });
    }
  });

  app.get("/api/estimate-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const template = await storage.getEstimateTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Estimate template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch estimate template",
        details: error.message 
      });
    }
  });

  app.post("/api/estimate-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertEstimateTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const templateData = {
        ...validationResult.data,
        companyId: user.companyId,
        createdBy: user.id,
      };
      const template = await storage.createEstimateTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create estimate template",
        details: error.message 
      });
    }
  });

  app.patch("/api/estimate-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getEstimateTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Estimate template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot modify public templates - create a copy instead" });
      }
      const validationResult = updateEstimateTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const updatedTemplate = await storage.updateEstimateTemplate(
        req.params.id,
        validationResult.data,
        user.companyId
      );
      res.json(updatedTemplate);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update estimate template",
        details: error.message 
      });
    }
  });

  app.delete("/api/estimate-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getEstimateTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Estimate template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot delete public templates - archive instead" });
      }
      const success = await storage.deleteEstimateTemplate(req.params.id, user.companyId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: "Failed to delete template" });
      }
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete estimate template",
        details: error.message 
      });
    }
  });

  // Selection Templates routes
  app.get("/api/selection-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const category = req.query.category as string | undefined;
      const templates = await storage.getSelectionTemplates(user.companyId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch selection templates",
        details: error.message 
      });
    }
  });

  app.get("/api/selection-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const template = await storage.getSelectionTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "Selection template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch selection template",
        details: error.message 
      });
    }
  });

  app.post("/api/selection-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertSelectionTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const templateData = {
        ...validationResult.data,
        companyId: user.companyId,
        createdBy: user.id,
      };
      const template = await storage.createSelectionTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create selection template",
        details: error.message 
      });
    }
  });

  app.patch("/api/selection-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getSelectionTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Selection template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot modify public templates - create a copy instead" });
      }
      const validationResult = updateSelectionTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const updatedTemplate = await storage.updateSelectionTemplate(
        req.params.id,
        validationResult.data,
        user.companyId
      );
      res.json(updatedTemplate);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update selection template",
        details: error.message 
      });
    }
  });

  app.delete("/api/selection-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getSelectionTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Selection template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot delete public templates - archive instead" });
      }
      const success = await storage.deleteSelectionTemplate(req.params.id, user.companyId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: "Failed to delete template" });
      }
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete selection template",
        details: error.message 
      });
    }
  });

  // RFQ Templates routes
  app.get("/api/rfq-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const category = req.query.category as string | undefined;
      const templates = await storage.getRfqTemplates(user.companyId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch RFQ templates",
        details: error.message 
      });
    }
  });

  app.get("/api/rfq-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const template = await storage.getRfqTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "RFQ template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch RFQ template",
        details: error.message 
      });
    }
  });

  app.post("/api/rfq-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertRfqTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const templateData = {
        ...validationResult.data,
        companyId: user.companyId,
        createdBy: user.id,
        createdByName: user.name || user.username,
      };
      const template = await storage.createRfqTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create RFQ template",
        details: error.message 
      });
    }
  });

  app.patch("/api/rfq-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getRfqTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "RFQ template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot modify public templates - create a copy instead" });
      }
      const validationResult = insertRfqTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const updatedTemplate = await storage.updateRfqTemplate(
        req.params.id,
        validationResult.data,
        user.companyId
      );
      res.json(updatedTemplate);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update RFQ template",
        details: error.message 
      });
    }
  });

  app.delete("/api/rfq-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getRfqTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "RFQ template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot delete public templates - archive instead" });
      }
      const success = await storage.deleteRfqTemplate(req.params.id, user.companyId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: "Failed to delete template" });
      }
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete RFQ template",
        details: error.message 
      });
    }
  });

  // RFI Templates routes
  app.get("/api/rfi-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const category = req.query.category as string | undefined;
      const templates = await storage.getRfiTemplates(user.companyId, category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch RFI templates",
        details: error.message 
      });
    }
  });

  app.get("/api/rfi-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const template = await storage.getRfiTemplate(req.params.id, user.companyId);
      if (!template) {
        return res.status(404).json({ error: "RFI template not found" });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch RFI template",
        details: error.message 
      });
    }
  });

  app.post("/api/rfi-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertRfiTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const templateData = {
        ...validationResult.data,
        companyId: user.companyId,
        createdBy: user.id,
        createdByName: user.name || user.username,
      };
      const template = await storage.createRfiTemplate(templateData);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create RFI template",
        details: error.message 
      });
    }
  });

  app.patch("/api/rfi-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getRfiTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "RFI template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot modify public templates - create a copy instead" });
      }
      const validationResult = insertRfiTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const updatedTemplate = await storage.updateRfiTemplate(
        req.params.id,
        validationResult.data,
        user.companyId
      );
      res.json(updatedTemplate);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update RFI template",
        details: error.message 
      });
    }
  });

  app.delete("/api/rfi-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingTemplate = await storage.getRfiTemplate(req.params.id, user.companyId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "RFI template not found" });
      }
      if (existingTemplate.isPublic) {
        return res.status(403).json({ error: "Cannot delete public templates - archive instead" });
      }
      const success = await storage.deleteRfiTemplate(req.params.id, user.companyId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: "Failed to delete template" });
      }
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete RFI template",
        details: error.message 
      });
    }
  });

  // Template Categories API Routes (hierarchical categories for organizing templates)
  app.get("/api/template-categories", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const templateType = req.query.templateType as string | undefined;
      const categories = await storage.getTemplateCategories(user.companyId, templateType);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch template categories",
        details: error.message 
      });
    }
  });

  app.get("/api/template-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const category = await storage.getTemplateCategory(req.params.id, user.companyId);
      if (!category) {
        return res.status(404).json({ error: "Template category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch template category",
        details: error.message 
      });
    }
  });

  app.post("/api/template-categories", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertTemplateCategorySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const categoryData = {
        ...validationResult.data,
        companyId: user.companyId,
      };
      const category = await storage.createTemplateCategory(categoryData);
      res.status(201).json(category);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create template category",
        details: error.message 
      });
    }
  });

  app.patch("/api/template-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingCategory = await storage.getTemplateCategory(req.params.id, user.companyId);
      if (!existingCategory) {
        return res.status(404).json({ error: "Template category not found" });
      }
      const validationResult = insertTemplateCategorySchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const updatedCategory = await storage.updateTemplateCategory(
        req.params.id,
        validationResult.data,
        user.companyId
      );
      res.json(updatedCategory);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update template category",
        details: error.message 
      });
    }
  });

  app.delete("/api/template-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const existingCategory = await storage.getTemplateCategory(req.params.id, user.companyId);
      if (!existingCategory) {
        return res.status(404).json({ error: "Template category not found" });
      }
      const success = await storage.deleteTemplateCategory(req.params.id, user.companyId);
      if (success) {
        res.status(204).send();
      } else {
        res.status(500).json({ error: "Failed to delete category" });
      }
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete template category",
        details: error.message 
      });
    }
  });

  // Calendar Views API Routes
  app.get("/api/calendar-views", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { calendarType } = req.query;
      if (!calendarType || (calendarType !== "personal" && calendarType !== "business")) {
        return res.status(400).json({ error: "Invalid calendar type. Must be 'personal' or 'business'" });
      }
      
      const views = await storage.getCalendarViews(
        req.user!.id,
        calendarType as "personal" | "business",
        req.user!.companyId!
      );
      res.json(views);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch calendar views",
        details: error.message 
      });
    }
  });

  app.get("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const view = await storage.getCalendarView(req.params.id, req.user!.companyId!);
      if (!view) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.json(view);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch calendar view",
        details: error.message 
      });
    }
  });

  app.post("/api/calendar-views", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCalendarViewSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const view = await storage.createCalendarView({
        ...validationResult.data,
        userId: req.user!.id,
        companyId: req.user!.companyId!,
      });
      res.status(201).json(view);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create calendar view",
        details: error.message 
      });
    }
  });

  app.patch("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCalendarViewSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const view = await storage.updateCalendarView(
        req.params.id,
        validationResult.data,
        req.user!.companyId!
      );
      if (!view) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.json(view);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update calendar view",
        details: error.message 
      });
    }
  });

  app.delete("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCalendarView(req.params.id, req.user!.companyId!);
      if (!success) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete calendar view",
        details: error.message 
      });
    }
  });

  app.post("/api/calendar-views/cleanup-duplicates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { calendarType } = req.body;
      if (!calendarType || (calendarType !== "personal" && calendarType !== "business")) {
        return res.status(400).json({ error: "Invalid calendar type" });
      }

      const views = await storage.getCalendarViews(
        req.user!.userId!,
        req.user!.companyId!,
        calendarType
      );

      // Find all default views with the same name
      const defaultViews = views.filter(v => v.isDefault && v.name === "All Events");
      
      if (defaultViews.length <= 1) {
        return res.json({ message: "No duplicates found", deleted: 0 });
      }

      // Keep the first one, delete the rest
      const toDelete = defaultViews.slice(1);
      let deletedCount = 0;

      for (const view of toDelete) {
        const success = await storage.deleteCalendarView(view.id, req.user!.companyId!);
        if (success) deletedCount++;
      }

      res.json({ message: "Duplicates cleaned up", deleted: deletedCount });
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to cleanup duplicates",
        details: error.message 
      });
    }
  });

  // Defects API Routes
  app.get("/api/defects", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const defects = await storage.getDefects(
        projectId as string | undefined, 
        status as string | undefined
      );
      res.json(defects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defects" });
    }
  });

  app.get("/api/defects/:id", async (req, res) => {
    try {
      const defect = await storage.getDefectById(req.params.id);
      if (!defect) {
        return res.status(404).json({ error: "Defect not found" });
      }
      res.json(defect);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defect" });
    }
  });

  app.post("/api/defects", async (req, res) => {
    try {
      const validationResult = insertDefectSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const defect = await storage.createDefect(validationResult.data);
      res.status(201).json(defect);
    } catch (error) {
      res.status(500).json({ error: "Failed to create defect" });
    }
  });

  app.patch("/api/defects/:id", async (req, res) => {
    try {
      const validationResult = insertDefectSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const defect = await storage.updateDefect(req.params.id, validationResult.data);
      res.json(defect);
    } catch (error) {
      if (error instanceof Error && error.message === "Defect not found") {
        return res.status(404).json({ error: "Defect not found" });
      }
      res.status(500).json({ error: "Failed to update defect" });
    }
  });

  app.delete("/api/defects/:id", async (req, res) => {
    try {
      await storage.deleteDefect(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete defect" });
    }
  });

  // ============================================================
  // SYSTEMS LIBRARY API Routes
  // ============================================================

  // System Folders
  app.get("/api/systems/folders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { parentId } = req.query;
      const folders = await storage.getSystemFolders(
        companyId, 
        parentId === 'null' ? null : parentId as string | undefined
      );
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system folders" });
    }
  });

  app.get("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const folder = await storage.getSystemFolder(req.params.id, companyId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch folder" });
    }
  });

  app.post("/api/systems/folders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemFolderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const createdBy = req.user!.id;
      const createdByName = `${req.user!.firstName} ${req.user!.lastName}`;

      const folder = await storage.createSystemFolder({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName,
      });
      res.status(201).json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  app.patch("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemFolderSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const folder = await storage.updateSystemFolder(req.params.id, validationResult.data, companyId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to update folder" });
    }
  });

  app.delete("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      await storage.deleteSystemFolder(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });

  app.post("/api/systems/folders/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { updates } = req.body;
      await storage.updateSystemFoldersOrder(updates, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder folders" });
    }
  });

  // System Documents
  app.get("/api/systems/documents", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { folderId } = req.query;
      const documents = await storage.getSystemDocuments(
        companyId,
        folderId === 'null' ? null : folderId as string | undefined
      );
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const document = await storage.getSystemDocument(req.params.id, companyId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  app.post("/api/systems/documents", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemDocumentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const createdBy = req.user!.id;
      const createdByName = `${req.user!.firstName} ${req.user!.lastName}`;

      // Populate task template name if taskTemplateId is provided
      let taskTemplateName = null;
      if (validationResult.data.taskTemplateId) {
        const template = await storage.getTaskTemplate(validationResult.data.taskTemplateId, companyId);
        if (template) {
          taskTemplateName = template.title;
        }
      }

      const document = await storage.createSystemDocument({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName,
        taskTemplateName,
      });
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  app.patch("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemDocumentSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const updatedBy = req.user!.id;
      const updatedByName = `${req.user!.firstName} ${req.user!.lastName}`;

      // Populate task template name if taskTemplateId is provided
      let taskTemplateName = validationResult.data.taskTemplateName;
      if (validationResult.data.taskTemplateId) {
        const template = await storage.getTaskTemplate(validationResult.data.taskTemplateId, companyId);
        if (template) {
          taskTemplateName = template.title;
        }
      } else if (validationResult.data.taskTemplateId === null) {
        // If taskTemplateId is explicitly set to null, clear the name
        taskTemplateName = null;
      }

      const document = await storage.updateSystemDocument(req.params.id, {
        ...validationResult.data,
        updatedBy,
        updatedByName,
        taskTemplateName,
      }, companyId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });

  app.delete("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      await storage.deleteSystemDocument(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.post("/api/systems/documents/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { updates } = req.body;
      await storage.updateSystemDocumentsOrder(updates, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder documents" });
    }
  });

  // Task Templates
  app.get("/api/systems/task-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { isActive } = req.query;
      const templates = await storage.getTaskTemplates(
        companyId,
        isActive === 'true' ? true : isActive === 'false' ? false : undefined
      );
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task templates" });
    }
  });

  app.get("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const template = await storage.getTaskTemplate(req.params.id, companyId);
      if (!template) {
        return res.status(404).json({ error: "Task template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task template" });
    }
  });

  app.post("/api/systems/task-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      console.log("[POST /api/systems/task-templates] Request body:", JSON.stringify(req.body, null, 2));
      
      const validationResult = insertTaskTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("[POST /api/systems/task-templates] Validation failed:", fromZodError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const createdBy = req.user!.id;
      const createdByName = `${req.user!.firstName} ${req.user!.lastName}`;

      console.log("[POST /api/systems/task-templates] Creating template with companyId:", companyId, "createdBy:", createdBy);

      const template = await storage.createTaskTemplate({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName,
      });
      
      console.log("[POST /api/systems/task-templates] Template created successfully:", template.id);
      
      // If this is a recurring template and it's active, generate the next 4 weeks of tasks immediately
      if (template.isRecurringTemplate && template.isActive) {
        try {
          const result = await storage.clearAndRegenerateTemplateTask(template.id, companyId);
          console.log(`[POST /api/systems/task-templates] Generated ${result.generated} recurring task instances for template ${template.id}`);
        } catch (genError) {
          console.error("[POST /api/systems/task-templates] Failed to generate recurring tasks (non-fatal):", genError);
        }
      }
      
      res.status(201).json(template);
    } catch (error: any) {
      console.error("[POST /api/systems/task-templates] Error creating task template:", error);
      console.error("[POST /api/systems/task-templates] Error stack:", error.stack);
      res.status(500).json({ 
        error: "Failed to create task template",
        details: error.message 
      });
    }
  });

  app.patch("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const template = await storage.updateTaskTemplate(req.params.id, validationResult.data, companyId);
      if (!template) {
        return res.status(404).json({ error: "Task template not found" });
      }
      
      // If this is a recurring template, regenerate tasks to reflect changes
      if (template.isRecurringTemplate && template.isActive) {
        try {
          const result = await storage.clearAndRegenerateTemplateTask(template.id, companyId);
          console.log(`[PATCH /api/systems/task-templates] Regenerated ${result.generated} recurring task instances for template ${template.id}`);
        } catch (genError) {
          console.error("[PATCH /api/systems/task-templates] Failed to regenerate recurring tasks (non-fatal):", genError);
        }
      }
      
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task template" });
    }
  });

  app.delete("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      await storage.deleteTaskTemplate(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task template" });
    }
  });

  // Generate recurring tasks from active templates (4-week rolling window)
  app.post("/api/systems/task-templates/generate-recurring", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const result = await storage.generateRecurringTasks(companyId);
      res.json(result);
    } catch (error) {
      console.error("Failed to generate recurring tasks:", error);
      res.status(500).json({ error: "Failed to generate recurring tasks" });
    }
  });

  // Clear and regenerate tasks for a specific template (when template is edited)
  app.post("/api/systems/task-templates/:id/regenerate", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const result = await storage.clearAndRegenerateTemplateTask(req.params.id, companyId);
      res.json(result);
    } catch (error) {
      console.error("Failed to clear and regenerate template tasks:", error);
      res.status(500).json({ error: "Failed to clear and regenerate template tasks" });
    }
  });

  // Workflow Templates
  app.get("/api/systems/workflow-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const { isActive } = req.query;
      const templates = await storage.getWorkflowTemplates(
        companyId,
        isActive === 'true' ? true : isActive === 'false' ? false : undefined
      );
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow templates" });
    }
  });

  app.get("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const template = await storage.getWorkflowTemplate(req.params.id, companyId);
      if (!template) {
        return res.status(404).json({ error: "Workflow template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow template" });
    }
  });

  app.post("/api/systems/workflow-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertWorkflowTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const createdBy = req.user!.id;
      const createdByName = `${req.user!.firstName} ${req.user!.lastName}`;

      const template = await storage.createWorkflowTemplate({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName,
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create workflow template" });
    }
  });

  app.patch("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertWorkflowTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const template = await storage.updateWorkflowTemplate(req.params.id, validationResult.data, companyId);
      if (!template) {
        return res.status(404).json({ error: "Workflow template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update workflow template" });
    }
  });

  app.delete("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      await storage.deleteWorkflowTemplate(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workflow template" });
    }
  });

  // Project Workflows
  app.get("/api/projects/:projectId/workflows", requireAuth, async (req, res) => {
    try {
      const workflows = await storage.getProjectWorkflows(req.params.projectId);
      res.json(workflows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project workflows" });
    }
  });

  app.get("/api/project-workflows/:id", requireAuth, async (req, res) => {
    try {
      const workflow = await storage.getProjectWorkflow(req.params.id);
      if (!workflow) {
        return res.status(404).json({ error: "Project workflow not found" });
      }
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project workflow" });
    }
  });

  app.post("/api/project-workflows", requireAuth, async (req, res) => {
    try {
      const validationResult = insertProjectWorkflowSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const workflow = await storage.createProjectWorkflow(validationResult.data);
      res.status(201).json(workflow);
    } catch (error) {
      res.status(500).json({ error: "Failed to create project workflow" });
    }
  });

  app.patch("/api/project-workflows/:id", requireAuth, async (req, res) => {
    try {
      const validationResult = insertProjectWorkflowSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const workflow = await storage.updateProjectWorkflow(req.params.id, validationResult.data);
      if (!workflow) {
        return res.status(404).json({ error: "Project workflow not found" });
      }
      res.json(workflow);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project workflow" });
    }
  });

  app.delete("/api/project-workflows/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteProjectWorkflow(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project workflow" });
    }
  });

  // ============================================================================
  // MESSAGING API ROUTES
  // ============================================================================

  // Channels
  app.get("/api/channels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const userId = req.user!.id;
      const { type, projectId } = req.query;
      
      const filters: { type?: string; projectId?: string } = {};
      if (type && typeof type === 'string') {
        filters.type = type;
      }
      if (projectId && typeof projectId === 'string') {
        filters.projectId = projectId;
      }
      
      const channels = await storage.getChannels(companyId, userId, filters);
      
      // Get user's channel membership info and message counts
      const membershipPromises = channels.map(async (channel) => {
        const members = await storage.getChannelMembers(channel.id);
        const userMembership = members.find(m => m.userId === userId);
        
        // Get last message for this channel
        const messages = await storage.getMessages(channel.id, 1);
        const lastMessage = messages[0];
        const messageCount = await storage.getMessageCount(channel.id);
        
        return {
          ...channel,
          isPinned: userMembership?.isPinned || false,
          lastMessageAt: lastMessage?.createdAt || null,
          messageCount,
        };
      });
      
      const channelsWithPinned = await Promise.all(membershipPromises);
      
      // Sort pinned channels first, then by last message date
      channelsWithPinned.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // Then sort by last message date (most recent first)
        if (a.lastMessageAt && b.lastMessageAt) {
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        }
        if (a.lastMessageAt && !b.lastMessageAt) return -1;
        if (!a.lastMessageAt && b.lastMessageAt) return 1;
        return a.name.localeCompare(b.name);
      });
      
      res.json(channelsWithPinned);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  app.get("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const channel = await storage.getChannel(req.params.id, companyId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  app.post("/api/channels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const userId = req.user!.id;
      
      const validationResult = insertChannelSchema.omit({ companyId: true, createdById: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const channel = await storage.createChannel({
        ...validationResult.data,
        companyId,
        createdById: userId
      });
      
      // Add creator as channel member
      await storage.addChannelMember({
        channelId: channel.id,
        userId,
        role: 'owner'
      });
      
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  app.patch("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      
      const validationResult = insertChannelSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const channel = await storage.updateChannel(req.params.id, validationResult.data, companyId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  app.delete("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      await storage.deleteChannel(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  // DM Channel creation/retrieval
  app.post("/api/channels/dm", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const userId = req.user!.id;
      const { otherUserId } = req.body;
      
      if (!otherUserId) {
        return res.status(400).json({ error: "otherUserId is required" });
      }
      
      const channel = await storage.getOrCreateDMChannel(userId, otherUserId, companyId);
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to get or create DM channel" });
    }
  });

  // Create sample channels and messages for demonstration
  app.post("/api/channels/seed-sample", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const userId = req.user!.id;
      
      // Check if sample channels already exist
      const existingChannels = await storage.getChannels(companyId);
      const hasGeneral = existingChannels.some(c => c.name === "general");
      const hasRandom = existingChannels.some(c => c.name === "random");
      const hasProjectUpdates = existingChannels.some(c => c.name === "project-updates");
      
      if (hasGeneral && hasRandom && hasProjectUpdates) {
        return res.status(409).json({ error: "Sample channels already exist" });
      }
      
      const createdChannels = [];
      
      // Create sample channels if they don't exist
      let generalChannel;
      if (!hasGeneral) {
        generalChannel = await storage.createChannel({
          name: "general",
          type: "channel",
          companyId,
          createdById: userId
        });
        await storage.addChannelMember({ channelId: generalChannel.id, userId });
        createdChannels.push(generalChannel);
        
        // Create sample messages in general channel
        await storage.createMessage({
          channelId: generalChannel.id,
          userId,
          content: "Welcome to BuildPro Communications!"
        });
        
        await storage.createMessage({
          channelId: generalChannel.id,
          userId,
          content: "This is a Slack-style messaging system for your construction projects."
        });
      }
      
      let randomChannel;
      if (!hasRandom) {
        randomChannel = await storage.createChannel({
          name: "random",
          type: "channel",
          companyId,
          createdById: userId
        });
        await storage.addChannelMember({ channelId: randomChannel.id, userId });
        createdChannels.push(randomChannel);
        
        // Create sample messages in random channel
        await storage.createMessage({
          channelId: randomChannel.id,
          userId,
          content: "Coffee break anyone?"
        });
      }
      
      let projectUpdatesChannel;
      if (!hasProjectUpdates) {
        projectUpdatesChannel = await storage.createChannel({
          name: "project-updates",
          type: "channel",
          companyId,
          createdById: userId
        });
        await storage.addChannelMember({ channelId: projectUpdatesChannel.id, userId });
        createdChannels.push(projectUpdatesChannel);
        
        // Create sample messages in project-updates channel
        await storage.createMessage({
          channelId: projectUpdatesChannel.id,
          userId,
          content: "Ocean View project has been updated with new timeline."
        });
      }
      
      res.json({ 
        message: "Sample data created successfully",
        channels: createdChannels
      });
    } catch (error) {
      console.error("Failed to seed sample data:", error);
      res.status(500).json({ error: "Failed to create sample data" });
    }
  });

  // Channel Members
  app.get("/api/channels/:channelId/members", requireAuth, async (req, res) => {
    try {
      const members = await storage.getChannelMembers(req.params.channelId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channel members" });
    }
  });

  app.post("/api/channels/:channelId/members", requireAuth, async (req, res) => {
    try {
      const validationResult = insertChannelMemberSchema.omit({ channelId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const member = await storage.addChannelMember({
        ...validationResult.data,
        channelId: req.params.channelId
      });
      res.status(201).json(member);
    } catch (error) {
      res.status(500).json({ error: "Failed to add channel member" });
    }
  });

  app.delete("/api/channels/:channelId/members/:userId", requireAuth, async (req, res) => {
    try {
      await storage.removeChannelMember(req.params.channelId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove channel member" });
    }
  });

  app.post("/api/channels/:channelId/read", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      await storage.updateChannelMemberLastRead(req.params.channelId, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to update last read" });
    }
  });

  // Toggle pin status for a channel
  app.post("/api/channels/:channelId/pin", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { isPinned } = req.body;
      
      if (typeof isPinned !== "boolean") {
        return res.status(400).json({ error: "isPinned must be a boolean" });
      }
      
      await storage.updateChannelMemberPin(req.params.channelId, userId, isPinned);
      res.json({ success: true, isPinned });
    } catch (error) {
      console.error("Failed to toggle pin:", error);
      res.status(500).json({ error: "Failed to toggle pin status" });
    }
  });

  // Get unread counts for all user's channels
  app.get("/api/channels/unread/counts", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const companyId = req.user!.companyId!;
      
      const unreadCounts = await storage.getUnreadCounts(userId, companyId);
      res.json(unreadCounts);
    } catch (error) {
      console.error("Failed to get unread counts:", error);
      res.status(500).json({ error: "Failed to get unread counts" });
    }
  });

  // Messages
  app.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const companyId = req.user!.companyId!;
      const channelId = req.params.channelId;
      
      // Verify channel exists and user has access
      const channel = await storage.getChannel(channelId, companyId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      
      // Verify user is a member of the channel
      const members = await storage.getChannelMembers(channelId);
      const isMember = members.some(m => m.userId === userId);
      if (!isMember) {
        return res.status(403).json({ error: "You are not a member of this channel" });
      }
      
      const { limit, before } = req.query;
      const messages = await storage.getMessages(
        channelId,
        limit ? parseInt(limit as string) : undefined,
        before as string | undefined
      );
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Get recent messages across all channels
  app.get("/api/messages/recent", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const companyId = req.user!.companyId!;
      
      // Get all user's channels
      const channels = await storage.getUserChannels(userId, companyId);
      
      // Get recent messages from each channel
      const allMessages: any[] = [];
      for (const channel of channels) {
        const messages = await storage.getMessages(channel.id, 5); // Get 5 most recent per channel
        
        // Add channel name and sender name to each message
        for (const msg of messages) {
          const sender = await storage.getUserById(msg.userId);
          allMessages.push({
            ...msg,
            channelName: channel.name,
            senderName: sender ? `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || sender.email : 'Unknown'
          });
        }
      }
      
      // Sort by most recent first and limit to 20
      const recentMessages = allMessages
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 20);
      
      res.json(recentMessages);
    } catch (error) {
      console.error("Failed to get recent messages:", error);
      res.status(500).json({ error: "Failed to get recent messages" });
    }
  });

  app.get("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      const message = await storage.getMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch message" });
    }
  });

  app.post("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      
      const validationResult = insertMessageSchema.omit({ channelId: true, userId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      // Check for @mentions
      const content = validationResult.data.content;
      const mentionRegex = /@(\w+)/g;
      const mentions: string[] = [];
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push(match[1]);
      }

      // Check for /commands
      const hasCommand = content.startsWith('/');
      const commandType = hasCommand ? content.split(' ')[0].substring(1) : undefined;

      const message = await storage.createMessage({
        ...validationResult.data,
        channelId: req.params.channelId,
        userId,
        mentions,
        hasCommand,
        commandType
      });
      
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  app.patch("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      const validationResult = insertMessageSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const message = await storage.updateMessage(req.params.id, validationResult.data);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMessage(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // Seed default task tags and template statuses (admin only)
  app.post("/api/seed/task-management", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = req.user!.companyId;
      
      // Check if tags already exist
      const existingTags = await storage.getTaskTags(companyId);
      const existingStatuses = await storage.getTaskTemplateStatuses(companyId);
      
      let tagsCreated = 0;
      let statusesCreated = 0;
      
      // Create default tags if none exist
      if (existingTags.length === 0) {
        const defaultTags = [
          { name: "System", color: "#3b82f6", displayOrder: 0 },
          { name: "Project Management", color: "#22c55e", displayOrder: 1 },
          { name: "Schedule", color: "#f97316", displayOrder: 2 },
        ];
        
        for (const tag of defaultTags) {
          await storage.createTaskTag({ ...tag, companyId, isActive: true });
          tagsCreated++;
        }
      }
      
      // Create default statuses if none exist
      if (existingStatuses.length === 0) {
        const defaultStatuses = [
          { name: "Active", color: "#22c55e", displayOrder: 0 },
          { name: "Draft", color: "#6b7280", displayOrder: 1 },
          { name: "Archived", color: "#ef4444", displayOrder: 2 },
        ];
        
        for (const status of defaultStatuses) {
          await storage.createTaskTemplateStatus({ ...status, companyId, isActive: true });
          statusesCreated++;
        }
      }
      
      res.json({
        message: "Seed completed successfully",
        tagsCreated,
        statusesCreated,
        tagsAlreadyExisted: existingTags.length,
        statusesAlreadyExisted: existingStatuses.length,
      });
    } catch (error: any) {
      console.error("Failed to seed task management data:", error);
      res.status(500).json({ 
        error: "Failed to seed task management data",
        details: error.message 
      });
    }
  });

  // ==================== REMINDERS SYSTEM ====================

  // Business Reminders (company-wide, admin managed)
  app.get("/api/business-reminders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminders = await storage.getBusinessReminders(user.companyId);
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch business reminders", details: error.message });
    }
  });

  app.get("/api/business-reminders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminder = await storage.getBusinessReminderById(req.params.id, user.companyId);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch business reminder", details: error.message });
    }
  });

  app.post("/api/business-reminders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertBusinessReminderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const reminder = await storage.createBusinessReminder({
        ...validationResult.data,
        companyId: user.companyId,
        createdById: user.id,
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create business reminder", details: error.message });
    }
  });

  app.patch("/api/business-reminders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertBusinessReminderSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const reminder = await storage.updateBusinessReminder(req.params.id, user.companyId, validationResult.data);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update business reminder", details: error.message });
    }
  });

  app.delete("/api/business-reminders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const deleted = await storage.deleteBusinessReminder(req.params.id, user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete business reminder", details: error.message });
    }
  });

  // Personal/Item Reminders
  app.get("/api/reminders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const options: { status?: string; linkedItemType?: string } = {};
      if (req.query.status) options.status = req.query.status as string;
      if (req.query.linkedItemType) options.linkedItemType = req.query.linkedItemType as string;
      
      const reminders = await storage.getReminders(user.id, user.companyId, options);
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch reminders", details: error.message });
    }
  });

  app.get("/api/reminders/upcoming", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const reminders = await storage.getUpcomingReminders(user.id, user.companyId, limit);
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch upcoming reminders", details: error.message });
    }
  });

  app.get("/api/reminders/for-item/:itemType/:itemId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminders = await storage.getRemindersForItem(
        req.params.itemType, 
        req.params.itemId, 
        user.companyId
      );
      res.json(reminders);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch reminders for item", details: error.message });
    }
  });

  app.get("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminder = await storage.getReminderById(req.params.id, user.companyId);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch reminder", details: error.message });
    }
  });

  app.post("/api/reminders", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id || !user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertReminderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const reminder = await storage.createReminder({
        ...validationResult.data,
        companyId: user.companyId,
        userId: user.id,
        targetUserId: validationResult.data.targetUserId || user.id,
      });
      res.status(201).json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create reminder", details: error.message });
    }
  });

  app.patch("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const validationResult = insertReminderSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      const reminder = await storage.updateReminder(req.params.id, user.companyId, validationResult.data);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update reminder", details: error.message });
    }
  });

  app.post("/api/reminders/:id/snooze", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { minutes } = req.body;
      if (!minutes || typeof minutes !== 'number') {
        return res.status(400).json({ error: "Minutes is required" });
      }
      const snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
      const reminder = await storage.snoozeReminder(req.params.id, user.companyId, snoozedUntil);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to snooze reminder", details: error.message });
    }
  });

  app.post("/api/reminders/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const reminder = await storage.dismissReminder(req.params.id, user.companyId);
      if (!reminder) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.json(reminder);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to dismiss reminder", details: error.message });
    }
  });

  app.delete("/api/reminders/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const deleted = await storage.deleteReminder(req.params.id, user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Reminder not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete reminder", details: error.message });
    }
  });

  // Reminder Notifications
  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const options: { status?: string; limit?: number } = {};
      if (req.query.status) options.status = req.query.status as string;
      if (req.query.limit) options.limit = parseInt(req.query.limit as string);
      
      const notifications = await storage.getReminderNotifications(user.id, options);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch notifications", details: error.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const count = await storage.getUnreadNotificationCount(user.id);
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch unread count", details: error.message });
    }
  });

  app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const notification = await storage.markNotificationAsRead(req.params.id, user.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to mark notification as read", details: error.message });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const count = await storage.markAllNotificationsAsRead(user.id);
      res.json({ markedAsRead: count });
    } catch (error: any) {
      res.status(500).json({ error: "Failed to mark all notifications as read", details: error.message });
    }
  });

  app.post("/api/notifications/:id/dismiss", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const notification = await storage.dismissNotification(req.params.id, user.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to dismiss notification", details: error.message });
    }
  });

  // ============================================
  // PRICE LIST API ROUTES
  // ============================================

  // Price List Categories
  app.get("/api/price-list/categories", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const categories = await storage.getPriceListCategories(user.companyId);
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch price list categories", details: error.message });
    }
  });

  app.post("/api/price-list/categories", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const category = await storage.createPriceListCategory({ ...req.body, companyId: user.companyId });
      res.status(201).json(category);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create price list category", details: error.message });
    }
  });

  app.patch("/api/price-list/categories/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const category = await storage.updatePriceListCategory(req.params.id, req.body, user.companyId);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update price list category", details: error.message });
    }
  });

  app.delete("/api/price-list/categories/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const deleted = await storage.deletePriceListCategory(req.params.id, user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete price list category", details: error.message });
    }
  });

  // Price List Items
  app.get("/api/price-list/items", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const filters: any = {};
      if (req.query.categoryId) filters.categoryId = req.query.categoryId;
      if (req.query.supplierId) filters.supplierId = req.query.supplierId;
      if (req.query.isActive !== undefined) filters.isActive = req.query.isActive === "true";
      if (req.query.search) filters.search = req.query.search;
      
      const items = await storage.getPriceListItems(user.companyId, filters);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch price list items", details: error.message });
    }
  });

  app.get("/api/price-list/items/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const item = await storage.getPriceListItem(req.params.id, user.companyId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch price list item", details: error.message });
    }
  });

  app.post("/api/price-list/items", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const item = await storage.createPriceListItem({ ...req.body, companyId: user.companyId });
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create price list item", details: error.message });
    }
  });

  app.patch("/api/price-list/items/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const item = await storage.updatePriceListItem(req.params.id, req.body, user.companyId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update price list item", details: error.message });
    }
  });

  app.delete("/api/price-list/items/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const deleted = await storage.deletePriceListItem(req.params.id, user.companyId);
      if (!deleted) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: "Failed to delete price list item", details: error.message });
    }
  });

  app.post("/api/price-list/items/bulk-update", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { updates } = req.body;
      if (!Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }
      const items = await storage.bulkUpdatePriceListItems(updates, user.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to bulk update price list items", details: error.message });
    }
  });

  // AI Price List Review routes
  app.get("/api/price-list/review/unlinked", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const items = await storage.getUnlinkedBillLineItems(user.companyId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch unlinked bill line items", details: error.message });
    }
  });

  app.get("/api/price-list/review/links", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const status = req.query.status as string | undefined;
      const links = await storage.getBillLineItemPriceLinks(user.companyId, status);
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch price list links", details: error.message });
    }
  });

  app.post("/api/price-list/review/links", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const link = await storage.createBillLineItemPriceLink(req.body);
      res.status(201).json(link);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to create price list link", details: error.message });
    }
  });

  app.patch("/api/price-list/review/links/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const link = await storage.updateBillLineItemPriceLink(req.params.id, req.body);
      if (!link) {
        return res.status(404).json({ error: "Link not found" });
      }
      res.json(link);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to update price list link", details: error.message });
    }
  });

  // AI Summary endpoint for dashboard widget
  app.get("/api/ai-summary/:projectId", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const projectId = req.params.projectId;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const weekFromNow = new Date(today);
      weekFromNow.setDate(weekFromNow.getDate() + 7);

      // Gather project data
      const [project, tasks, rfis, rfqs, estimates] = await Promise.all([
        storage.getProject(projectId),
        storage.getTasks(projectId),
        storage.getRFIs(user.companyId, projectId),
        storage.getRFQs(user.companyId, projectId),
        storage.getEstimates(projectId),
      ]);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Filter tasks due today or overdue
      const todayTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate < tomorrow && t.status !== 'done';
      });

      const overdueTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate < today && t.status !== 'done';
      });

      const upcomingTasks = tasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= tomorrow && dueDate < weekFromNow && t.status !== 'done';
      });

      // Open RFIs and RFQs
      const openRFIs = rfis.filter(r => r.status === 'open' || r.status === 'pending');
      const openRFQs = rfqs.filter(r => r.status === 'draft' || r.status === 'sent');

      // Calculate budget info
      const totalBudget = estimates.reduce((sum, e) => sum + (Number(e.totalIncGst) || 0), 0);

      // Build context for AI
      const context = {
        projectName: project.name,
        projectStatus: project.status,
        todayTaskCount: todayTasks.length,
        todayTasks: todayTasks.slice(0, 5).map(t => ({ title: t.title, priority: t.priority })),
        overdueTaskCount: overdueTasks.length,
        overdueTasks: overdueTasks.slice(0, 3).map(t => ({ title: t.title, daysOverdue: Math.ceil((today.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24)) })),
        upcomingTasks: upcomingTasks.slice(0, 3).map(t => ({ title: t.title, dueDate: t.dueDate })),
        openRFICount: openRFIs.length,
        openRFQCount: openRFQs.length,
        totalBudget,
      };

      // Generate AI summary
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a construction project assistant providing daily briefings for builders. Generate a concise, actionable summary. Return JSON with these arrays:
- schedule: 2-4 brief items about today's tasks and upcoming deadlines
- actionItems: 2-4 specific things that need attention (overdue tasks, pending RFIs/RFQs)
- issues: 1-3 potential concerns or warnings (only if applicable)
Keep each item under 15 words. Be specific and practical. Don't include empty arrays.`
          },
          {
            role: "user",
            content: `Daily briefing for project "${context.projectName}":
- ${context.todayTaskCount} tasks due today: ${context.todayTasks.map(t => t.title).join(', ') || 'none'}
- ${context.overdueTaskCount} overdue tasks: ${context.overdueTasks.map(t => `${t.title} (${t.daysOverdue}d)`).join(', ') || 'none'}
- Upcoming this week: ${context.upcomingTasks.map(t => t.title).join(', ') || 'nothing scheduled'}
- ${context.openRFICount} open RFIs, ${context.openRFQCount} pending RFQs
- Total budget: $${context.totalBudget.toLocaleString()}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      res.json({
        schedule: aiResponse.schedule || [],
        actionItems: aiResponse.actionItems || [],
        issues: aiResponse.issues || [],
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("AI Summary error:", error);
      res.status(500).json({ error: "Failed to generate AI summary", details: error.message });
    }
  });

  // Personal AI Daily Summary endpoint
  app.post("/api/ai/daily-summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { taskSummary } = req.body;

      // Generate personalized AI summary
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a friendly productivity assistant for a construction project manager. Generate a brief, encouraging daily summary. Return JSON with:
- summary: A 1-2 sentence overview of their day (friendly and motivating)
- highlights: Array of 2-3 positive observations or accomplishments
- suggestions: Array of 2-3 actionable tips to be more productive today
Keep language casual and encouraging. Focus on what they can accomplish.`
          },
          {
            role: "user",
            content: `Daily summary for a team member:
- Active tasks: ${taskSummary?.activeTasks || 0}
- Overdue tasks: ${taskSummary?.overdueTasks || 0}
- Completed this week: ${taskSummary?.completedThisWeek || 0}
- Upcoming tasks: ${taskSummary?.upcomingTasks?.map((t: any) => t.title).join(', ') || 'none scheduled'}`
          }
        ],
        response_format: { type: "json_object" },
      });

      const aiResponse = JSON.parse(completion.choices[0]?.message?.content || '{}');
      
      res.json({
        summary: aiResponse.summary || "Have a productive day!",
        highlights: aiResponse.highlights || [],
        suggestions: aiResponse.suggestions || [],
        generatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Personal AI Summary error:", error);
      // Return a fallback response instead of error for better UX
      res.json({
        summary: "Ready to tackle today's tasks! Focus on your priorities and you'll have a great day.",
        highlights: ["Your workspace is organized and ready", "New day, new opportunities"],
        suggestions: ["Start with your most important task", "Take short breaks to stay focused"],
        generatedAt: new Date().toISOString(),
      });
    }
  });

  // ============================================
  // PINNED ITEMS API
  // ============================================
  
  // Get all pinned items for current user
  app.get("/api/pinned-items", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).dbUser?.id;
      const companyId = (req.user as any).dbUser?.companyId;
      
      if (!userId || !companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const items = await db.select()
        .from(pinnedItems)
        .where(and(
          eq(pinnedItems.userId, userId),
          eq(pinnedItems.companyId, companyId)
        ))
        .orderBy(asc(pinnedItems.sortOrder));
      
      res.json(items);
    } catch (error: any) {
      console.error("Error fetching pinned items:", error);
      res.status(500).json({ error: "Failed to fetch pinned items" });
    }
  });
  
  // Add a pinned item
  app.post("/api/pinned-items", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).dbUser?.id;
      const companyId = (req.user as any).dbUser?.companyId;
      
      if (!userId || !companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const parsed = insertPinnedItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }
      
      // Get the max sort order
      const existing = await db.select()
        .from(pinnedItems)
        .where(and(
          eq(pinnedItems.userId, userId),
          eq(pinnedItems.companyId, companyId)
        ));
      
      const maxOrder = existing.reduce((max, item) => Math.max(max, item.sortOrder), -1);
      
      const [item] = await db.insert(pinnedItems)
        .values({
          ...parsed.data,
          userId,
          companyId,
          sortOrder: maxOrder + 1,
        })
        .returning();
      
      res.json(item);
    } catch (error: any) {
      console.error("Error adding pinned item:", error);
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: "Item already pinned" });
      }
      res.status(500).json({ error: "Failed to add pinned item" });
    }
  });
  
  // Reorder pinned items
  app.put("/api/pinned-items/reorder", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).dbUser?.id;
      const companyId = (req.user as any).dbUser?.companyId;
      
      if (!userId || !companyId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { items } = req.body as { items: { id: string; sortOrder: number }[] };
      
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid items array" });
      }
      
      // Update each item's sort order
      for (const { id, sortOrder } of items) {
        await db.update(pinnedItems)
          .set({ sortOrder })
          .where(and(
            eq(pinnedItems.id, id),
            eq(pinnedItems.userId, userId)
          ));
      }
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error reordering pinned items:", error);
      res.status(500).json({ error: "Failed to reorder pinned items" });
    }
  });
  
  // Delete a pinned item
  app.delete("/api/pinned-items/:id", requireAuth, async (req, res) => {
    try {
      const userId = (req.user as any).dbUser?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      await db.delete(pinnedItems)
        .where(and(
          eq(pinnedItems.id, req.params.id),
          eq(pinnedItems.userId, userId)
        ));
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting pinned item:", error);
      res.status(500).json({ error: "Failed to delete pinned item" });
    }
  });

  const httpServer = createServer(app);

  // Setup Socket.io for real-time messaging with session authentication
  setupMessagingSocket(httpServer, sessionMiddleware);

  return httpServer;
}
