import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import pgSession from "connect-pg-simple";
import { db, pool } from "./db";
import bcrypt from "bcrypt";
import { google } from "googleapis";
import { randomBytes } from "crypto";
import { 
  insertNoteSchema,
  insertTaskSchema,
  insertCustomFieldDefSchema,
  insertCustomFieldOptionSchema,
  insertNoteTemplateSchema,
  insertClientSchema,
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
  insertCompanySettingsSchema,
  insertSystemConfigurationSchema,
  insertFieldCategorySchema,
  insertFieldOptionSchema,
  insertSelectionSchema,
  insertSelectionOptionSchema,
  insertOptionAttachmentSchema,
  insertClientSelectionSchema,
  insertSupplierSchema,
  insertContactSchema,
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
  updateBudgetSchema,
  updateBudgetLineItemSchema,
  insertScheduleSchema,
  updateScheduleSchema,
  insertScheduleItemSchema,
  updateScheduleItemSchema,
  insertScheduleTemplateSchema,
  updateScheduleTemplateSchema,
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
  insertScopeItemSchema,
  insertScopeStageSchema,
  insertScopeTemplateSchema,
  insertScopeGearPhotoSchema,
  insertGanttStageSchema,
  insertGanttSubtaskSchema
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { PasswordUtils } from "./utils/auth";
import { requireAuth, requireAdmin, requireTeamMember, requirePermission, toSafeUser } from "./middleware/auth";
import multer from "multer";
import { setupMessagingSocket } from "./messaging/socket";

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session middleware with PostgreSQL session store
  const PgSession = pgSession(session);
  const sessionMiddleware = session({
    store: new PgSession({
      pool: pool,
      createTableIfMissing: true,
      // Prune expired sessions every hour
      pruneSessionInterval: 60 * 60,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  });
  
  app.use(sessionMiddleware);
  
  // put application routes here
  // prefix all routes with /api

  // Global authentication middleware - protect all API routes
  app.use('/api', (req, res, next) => {
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

    // DEVELOPMENT-ONLY BYPASSES - Remove these once frontend auth is working
    if (process.env.NODE_ENV === 'development') {
      // Allow all routes in development for now to avoid breaking the app during auth migration
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
      
      const notes = await storage.getNotes(projectId as string | undefined, companyId);
      res.json(notes);
    } catch (error) {
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
        const allNotes = await storage.getNotes(currentNote.projectId || undefined, companyId);
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

  // Tasks API Routes
  app.get("/api/tasks", async (req, res) => {
    try {
      const { projectId, status, businessTasks } = req.query;
      const tasks = await storage.getTasks(
        projectId as string | undefined,
        status as string | undefined,
        businessTasks === 'true'
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
      const validationResult = insertTaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const task = await storage.createTask(validationResult.data);
      res.status(201).json(task);
    } catch (error) {
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      const updateSchema = insertTaskSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
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
      res.json(task);
    } catch (error) {
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
      const { ownerId } = req.query;
      const templates = await storage.getNoteTemplates(ownerId as string | undefined);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch note templates" });
    }
  });

  app.get("/api/note-templates/:id", async (req, res) => {
    try {
      const template = await storage.getNoteTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch note template" });
    }
  });

  app.post("/api/note-templates", async (req, res) => {
    try {
      const validationResult = insertNoteTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.createNoteTemplate(validationResult.data);
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note template" });
    }
  });

  app.patch("/api/note-templates/:id", async (req, res) => {
    try {
      const updateSchema = insertNoteTemplateSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const template = await storage.updateNoteTemplate(req.params.id, validationResult.data);
      if (!template) {
        return res.status(404).json({ error: "Note template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update note template" });
    }
  });

  app.delete("/api/note-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteNoteTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Note template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note template" });
    }
  });

  // Clients API Routes
  app.get("/api/clients", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.json([]);
      }

      const allClients = await storage.getClients();
      const companyClients = allClients.filter(c => c.companyId === user.companyId);
      
      res.json(companyClients);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }

      // Validate without companyId since it's set by the backend
      const createClientSchema = insertClientSchema.omit({ companyId: true, isActive: true });
      const validationResult = createClientSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const clientData = {
        ...validationResult.data,
        companyId: user.companyId,
        isActive: true,
      };

      const client = await storage.createClient(clientData);
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }

      // Verify client belongs to user's company
      const existingClient = await storage.getClient(req.params.id);
      if (!existingClient || existingClient.companyId !== user.companyId) {
        return res.status(404).json({ error: "Client not found" });
      }

      const updateSchema = insertClientSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const client = await storage.updateClient(req.params.id, validationResult.data);
      res.json(client);
    } catch (error) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      const userId = (req.session as any).userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }

      // Verify client belongs to user's company
      const existingClient = await storage.getClient(req.params.id);
      if (!existingClient || existingClient.companyId !== user.companyId) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClient(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete client" });
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
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const updateSchema = insertProjectSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const project = await storage.updateProject(req.params.id, validationResult.data);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      res.status(500).json({ error: "Failed to update project" });
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
  app.get("/api/task-views", async (req, res) => {
    try {
      const { ownerId } = req.query;
      const taskViews = await storage.getTaskViews(ownerId as string | undefined);
      res.json(taskViews);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task views" });
    }
  });

  app.get("/api/task-views/:id", async (req, res) => {
    try {
      const taskView = await storage.getTaskView(req.params.id);
      if (!taskView) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.json(taskView);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task view" });
    }
  });

  app.post("/api/task-views", async (req, res) => {
    try {
      const validationResult = insertTaskViewSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const taskView = await storage.createTaskView(validationResult.data);
      res.status(201).json(taskView);
    } catch (error) {
      res.status(500).json({ error: "Failed to create task view" });
    }
  });

  app.patch("/api/task-views/:id", async (req, res) => {
    try {
      const updateSchema = insertTaskViewSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const taskView = await storage.updateTaskView(req.params.id, validationResult.data);
      if (!taskView) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.json(taskView);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task view" });
    }
  });

  app.delete("/api/task-views/:id", async (req, res) => {
    try {
      const success = await storage.deleteTaskView(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Task view not found" });
      }
      res.status(204).send();
    } catch (error) {
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

  // Reorder estimate items
  app.patch("/api/estimate-items/reorder", async (req, res) => {
    try {
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
      const stages = await storage.initializeDefaultStages(req.params.projectId, companyId);
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
  // GANTT CHART API ROUTES
  // ============================================================

  // Get all stages for a project
  app.get("/api/projects/:projectId/gantt/stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const stages = await storage.getGanttStages(req.params.projectId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching gantt stages:", error);
      res.status(500).json({ error: "Failed to fetch gantt stages" });
    }
  });

  // Get a single stage
  app.get("/api/gantt/stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const stage = await storage.getGanttStage(req.params.id);
      if (!stage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Error fetching gantt stage:", error);
      res.status(500).json({ error: "Failed to fetch gantt stage" });
    }
  });

  // Create a new stage
  app.post("/api/projects/:projectId/gantt/stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const projectId = req.params.projectId;
      
      const validationResult = insertGanttStageSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const newStage = await storage.createGanttStage({
        ...validationResult.data,
        projectId,
        companyId,
        createdBy: req.user!.id,
        createdByName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
      });

      res.status(201).json(newStage);
    } catch (error) {
      console.error("Error creating gantt stage:", error);
      res.status(500).json({ error: "Failed to create gantt stage" });
    }
  });

  // Update a stage (project-scoped)
  app.patch("/api/projects/:projectId/gantt/stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify stage belongs to project
      const existingStage = await storage.getGanttStage(req.params.id);
      if (!existingStage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      if (existingStage.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Stage does not belong to this project" });
      }

      const updateSchema = insertGanttStageSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedStage = await storage.updateGanttStage(req.params.id, validationResult.data);
      if (!updatedStage) {
        return res.status(404).json({ error: "Stage not found" });
      }

      res.json(updatedStage);
    } catch (error) {
      console.error("Error updating gantt stage:", error);
      res.status(500).json({ error: "Failed to update gantt stage" });
    }
  });

  // Reorder a stage (project-scoped)
  app.patch("/api/projects/:projectId/gantt/stages/:id/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify stage belongs to project
      const existingStage = await storage.getGanttStage(req.params.id);
      if (!existingStage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      if (existingStage.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Stage does not belong to this project" });
      }

      const { displayOrder } = req.body;
      if (typeof displayOrder !== 'number') {
        return res.status(400).json({ error: "displayOrder must be a number" });
      }

      const updatedStage = await storage.updateGanttStage(req.params.id, { displayOrder });
      if (!updatedStage) {
        return res.status(404).json({ error: "Stage not found" });
      }

      res.json(updatedStage);
    } catch (error) {
      console.error("Error reordering gantt stage:", error);
      res.status(500).json({ error: "Failed to reorder gantt stage" });
    }
  });

  // Toggle stage collapse (project-scoped)
  app.post("/api/projects/:projectId/gantt/stages/:id/toggle-collapse", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify stage belongs to project
      const existingStage = await storage.getGanttStage(req.params.id);
      if (!existingStage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      if (existingStage.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Stage does not belong to this project" });
      }

      const stage = await storage.toggleGanttStageCollapse(req.params.id);
      if (!stage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Error toggling stage collapse:", error);
      res.status(500).json({ error: "Failed to toggle stage collapse" });
    }
  });

  // Delete a stage (project-scoped)
  app.delete("/api/projects/:projectId/gantt/stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify stage belongs to project
      const existingStage = await storage.getGanttStage(req.params.id);
      if (!existingStage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      if (existingStage.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Stage does not belong to this project" });
      }

      const success = await storage.deleteGanttStage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting gantt stage:", error);
      res.status(500).json({ error: "Failed to delete gantt stage" });
    }
  });

  // Update a stage
  app.patch("/api/gantt/stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const updateSchema = insertGanttStageSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedStage = await storage.updateGanttStage(req.params.id, validationResult.data);
      if (!updatedStage) {
        return res.status(404).json({ error: "Stage not found" });
      }

      res.json(updatedStage);
    } catch (error) {
      console.error("Error updating gantt stage:", error);
      res.status(500).json({ error: "Failed to update gantt stage" });
    }
  });

  // Delete a stage
  app.delete("/api/gantt/stages/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteGanttStage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting gantt stage:", error);
      res.status(500).json({ error: "Failed to delete gantt stage" });
    }
  });

  // Reorder stages
  app.post("/api/gantt/stages/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderGanttStages(updates);
      res.status(204).send();
    } catch (error) {
      console.error("Error reordering gantt stages:", error);
      res.status(500).json({ error: "Failed to reorder gantt stages" });
    }
  });

  // Toggle stage collapse
  app.post("/api/gantt/stages/:id/toggle-collapse", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const stage = await storage.toggleGanttStageCollapse(req.params.id);
      if (!stage) {
        return res.status(404).json({ error: "Stage not found" });
      }
      res.json(stage);
    } catch (error) {
      console.error("Error toggling stage collapse:", error);
      res.status(500).json({ error: "Failed to toggle stage collapse" });
    }
  });

  // Get subtasks for a stage
  app.get("/api/gantt/stages/:stageId/subtasks", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const subtasks = await storage.getGanttSubtasks(req.params.stageId);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching gantt subtasks:", error);
      res.status(500).json({ error: "Failed to fetch gantt subtasks" });
    }
  });

  // Get a single subtask
  app.get("/api/gantt/subtasks/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const subtask = await storage.getGanttSubtask(req.params.id);
      if (!subtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }
      res.json(subtask);
    } catch (error) {
      console.error("Error fetching gantt subtask:", error);
      res.status(500).json({ error: "Failed to fetch gantt subtask" });
    }
  });

  // Get subtasks for a stage (project-scoped)
  app.get("/api/projects/:projectId/gantt/stages/:stageId/subtasks", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const subtasks = await storage.getGanttSubtasks(req.params.stageId);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching gantt subtasks:", error);
      res.status(500).json({ error: "Failed to fetch gantt subtasks" });
    }
  });

  // Create a new subtask (project-scoped)
  app.post("/api/projects/:projectId/gantt/stages/:stageId/subtasks", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const stageId = req.params.stageId;
      const projectId = req.params.projectId;
      
      const validationResult = insertGanttSubtaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const newSubtask = await storage.createGanttSubtask({
        ...validationResult.data,
        stageId,
        projectId,
        companyId,
        createdBy: req.user!.id,
        createdByName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
      });

      res.status(201).json(newSubtask);
    } catch (error) {
      console.error("Error creating gantt subtask:", error);
      res.status(500).json({ error: "Failed to create gantt subtask" });
    }
  });

  // Update a subtask (project-scoped)
  app.patch("/api/projects/:projectId/gantt/subtasks/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify subtask belongs to project
      const existingSubtask = await storage.getGanttSubtask(req.params.id);
      if (!existingSubtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }
      if (existingSubtask.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Subtask does not belong to this project" });
      }

      const updateSchema = insertGanttSubtaskSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedSubtask = await storage.updateGanttSubtask(req.params.id, validationResult.data);
      if (!updatedSubtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      res.json(updatedSubtask);
    } catch (error) {
      console.error("Error updating gantt subtask:", error);
      res.status(500).json({ error: "Failed to update gantt subtask" });
    }
  });

  // Delete a subtask (project-scoped)
  app.delete("/api/projects/:projectId/gantt/subtasks/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      // Verify subtask belongs to project
      const existingSubtask = await storage.getGanttSubtask(req.params.id);
      if (!existingSubtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }
      if (existingSubtask.projectId !== req.params.projectId) {
        return res.status(403).json({ error: "Subtask does not belong to this project" });
      }

      const success = await storage.deleteGanttSubtask(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Subtask not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting gantt subtask:", error);
      res.status(500).json({ error: "Failed to delete gantt subtask" });
    }
  });

  // Create a new subtask
  app.post("/api/gantt/stages/:stageId/subtasks", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user!.companyId!;
      const stageId = req.params.stageId;
      
      // Get the stage to retrieve projectId
      const stage = await storage.getGanttStage(stageId);
      if (!stage) {
        return res.status(404).json({ error: "Stage not found" });
      }

      const validationResult = insertGanttSubtaskSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const newSubtask = await storage.createGanttSubtask({
        ...validationResult.data,
        stageId,
        projectId: stage.projectId,
        companyId,
        createdBy: req.user!.id,
        createdByName: `${req.user!.firstName || ''} ${req.user!.lastName || ''}`.trim(),
      });

      res.status(201).json(newSubtask);
    } catch (error) {
      console.error("Error creating gantt subtask:", error);
      res.status(500).json({ error: "Failed to create gantt subtask" });
    }
  });

  // Update a subtask
  app.patch("/api/gantt/subtasks/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const updateSchema = insertGanttSubtaskSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString()
        });
      }

      const updatedSubtask = await storage.updateGanttSubtask(req.params.id, validationResult.data);
      if (!updatedSubtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      res.json(updatedSubtask);
    } catch (error) {
      console.error("Error updating gantt subtask:", error);
      res.status(500).json({ error: "Failed to update gantt subtask" });
    }
  });

  // Delete a subtask
  app.delete("/api/gantt/subtasks/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteGanttSubtask(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Subtask not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting gantt subtask:", error);
      res.status(500).json({ error: "Failed to delete gantt subtask" });
    }
  });

  // Reorder subtasks
  app.post("/api/gantt/subtasks/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({ error: "Updates must be an array" });
      }

      await storage.reorderGanttSubtasks(updates);
      res.status(204).send();
    } catch (error) {
      console.error("Error reordering gantt subtasks:", error);
      res.status(500).json({ error: "Failed to reorder gantt subtasks" });
    }
  });

  // Recalculate critical path for a project
  app.post("/api/projects/:projectId/gantt/calculate-critical-path", requireAuth, requireTeamMember, async (req, res) => {
    try {
      await storage.calculateCriticalPath(req.params.projectId);
      res.status(204).send();
    } catch (error) {
      console.error("Error calculating critical path:", error);
      res.status(500).json({ error: "Failed to calculate critical path" });
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
      
      // Create session
      (req.session as any).userId = user.id;
      
      res.status(201).json({ user: toSafeUser(user) });
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
      
      // Create session
      (req.session as any).userId = user.id;
      
      res.json({ user: toSafeUser(user) });
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
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(toSafeUser(user));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // ============================================================
  // GOOGLE CALENDAR OAUTH ROUTES
  // ============================================================

  // Initialize Google OAuth2 client
  const getRedirectUri = () => {
    if (process.env.REPLIT_DOMAINS) {
      // Use the first domain from REPLIT_DOMAINS
      const domain = process.env.REPLIT_DOMAINS.split(',')[0];
      return `https://${domain}/api/auth/google/callback`;
    }
    return 'http://localhost:5000/api/auth/google/callback';
  };

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );

  // Initiate Google OAuth flow
  app.get('/api/auth/google/initiate', async (req: any, res) => {
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

      const authUrl = oauth2Client.generateAuthUrl({
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

  // Handle Google OAuth callback
  app.get('/api/auth/google/callback', async (req: any, res) => {
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
      const { tokens } = await oauth2Client.getToken(code as string);
      
      // Validate tokens received
      if (!tokens.access_token) {
        console.error("No access token received from Google");
        delete (req.session as any).googleOAuthUserId;
        delete (req.session as any).googleOAuthState;
        return res.redirect('/profile?error=no_token');
      }

      oauth2Client.setCredentials(tokens);

      // Get user's Google account email
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
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

  // Disconnect Google Calendar
  app.post('/api/auth/google/disconnect', async (req: any, res) => {
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
          await oauth2Client.revokeToken(user.googleCalendarAccessToken);
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
  // GOOGLE CALENDAR CONNECTOR ROUTES (Replit Integration)
  // ============================================================
  
  // Get Google Calendar connection status
  app.get('/api/google-calendar/status', async (req: any, res) => {
    try {
      const { getGoogleCalendarConnectionInfo } = await import('./utils/googleCalendar');
      const info = await getGoogleCalendarConnectionInfo();
      res.json(info);
    } catch (error) {
      console.error("Error getting Google Calendar status:", error);
      res.json({ connected: false, email: null, calendars: [] });
    }
  });

  // Connect Google Calendar (triggers Replit connector flow)
  app.post('/api/google-calendar/connect', async (req: any, res) => {
    try {
      // The Replit connector handles the OAuth flow automatically
      // This endpoint just triggers a check to see if the user has connected
      const { isGoogleCalendarConnected } = await import('./utils/googleCalendar');
      const connected = await isGoogleCalendarConnected();
      
      if (connected) {
        res.json({ success: true, connected: true });
      } else {
        res.status(400).json({ 
          success: false, 
          message: "Please connect Google Calendar through the Replit integrations panel first." 
        });
      }
    } catch (error: any) {
      console.error("Error connecting Google Calendar:", error);
      res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to connect Google Calendar" 
      });
    }
  });

  // Disconnect Google Calendar
  app.post('/api/google-calendar/disconnect', async (req: any, res) => {
    try {
      // For Replit connector, disconnection happens through the Replit UI
      // This endpoint just confirms the disconnection
      res.json({ 
        success: true, 
        message: "Please disconnect Google Calendar through the Replit integrations panel." 
      });
    } catch (error) {
      console.error("Error disconnecting Google Calendar:", error);
      res.status(500).json({ message: "Failed to disconnect calendar" });
    }
  });

  // Get Google Calendar events
  app.get('/api/google-calendar/events', async (req: any, res) => {
    try {
      const { getUncachableGoogleCalendarClient, isGoogleCalendarConnected } = await import('./utils/googleCalendar');
      
      const connected = await isGoogleCalendarConnected();
      if (!connected) {
        return res.json([]);
      }

      const calendar = await getUncachableGoogleCalendarClient();
      
      // Get events for the next 3 months and past 1 month
      const timeMin = new Date();
      timeMin.setMonth(timeMin.getMonth() - 1);
      const timeMax = new Date();
      timeMax.setMonth(timeMax.getMonth() + 3);

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });

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
    } catch (error) {
      console.error("Error fetching Google Calendar events:", error);
      res.status(500).json({ message: "Failed to fetch Google Calendar events" });
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
      const { category } = req.query;
      const users = await storage.getUsers(category as any);
      // Use safe user helper to remove passwords
      const safeUsers = users.map(user => toSafeUser(user));
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const user = await storage.getUserWithRole(req.params.id);
      if (!user) {
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
  app.get("/api/invitations", requireTeamMember, requirePermission("admin.suppliers", "view"), async (req, res) => {
    try {
      const { status } = req.query;
      const invitations = await storage.getUserInvitations(status as string);
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });

  app.get("/api/invitations/:id", requireTeamMember, requirePermission("admin.suppliers", "view"), async (req, res) => {
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

  app.post("/api/invitations", requireTeamMember, requirePermission("admin.suppliers", "add"), async (req, res) => {
    try {
      const validationResult = insertUserInvitationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const invitation = await storage.createUserInvitation(validationResult.data);
      // TODO: Send email invitation here
      
      res.status(201).json({
        ...invitation,
        inviteUrl: `${req.get('host')}/accept-invite/${invitation.inviteToken}`
      });
    } catch (error) {
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
      const { username, password, firstName, lastName } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }

      // Validate password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({ 
          error: "Password validation failed", 
          details: passwordValidation.errors 
        });
      }

      const result = await storage.acceptInvitation(req.params.token, {
        username,
        password,
        firstName,
        lastName
      });

      if (!result) {
        return res.status(400).json({ error: "Invalid or expired invitation" });
      }

      // Never return password in API response
      const { password: _, ...safeUser } = result.user;
      res.status(201).json({
        user: safeUser,
        invitation: result.invitation,
        message: "Account created successfully"
      });
    } catch (error: any) {
      if (error.message?.includes("Password validation failed")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to accept invitation" });
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
  app.get("/api/suppliers", async (req, res) => {
    try {
      const { projectId } = req.query;
      const suppliers = await storage.getSuppliers(projectId as string | undefined);
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });

  app.get("/api/suppliers/:id", async (req, res) => {
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

  app.post("/api/suppliers", async (req, res) => {
    try {
      const validationResult = insertSupplierSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const supplier = await storage.createSupplier(validationResult.data);
      res.status(201).json(supplier);
    } catch (error) {
      res.status(500).json({ error: "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", async (req, res) => {
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

  app.delete("/api/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });

  // Contacts API Routes
  app.get("/api/contacts", async (req, res) => {
    try {
      const { contactType } = req.query;
      const contacts = await storage.getContacts(contactType as "team" | "supplier" | "client" | undefined);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", async (req, res) => {
    try {
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", async (req, res) => {
    try {
      const validationResult = insertContactSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const contact = await storage.createContact(validationResult.data);
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      const validationResult = insertContactSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const contact = await storage.updateContact(req.params.id, validationResult.data);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  app.post("/api/contacts/:id/archive", async (req, res) => {
    try {
      const contact = await storage.archiveContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to archive contact" });
    }
  });

  app.post("/api/contacts/:id/restore", async (req, res) => {
    try {
      const contact = await storage.restoreContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: "Failed to restore contact" });
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
      const validationResult = insertCompanySettingsSchema.safeParse(req.body);
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
      const projectId = req.query.projectId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }

      const activities = await storage.getActivities(projectId, limit);
      res.json(activities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/activities", async (req, res) => {
    try {
      const activityData = insertActivitySchema.parse(req.body);
      const activity = await storage.createActivity(activityData);
      res.json(activity);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid activity data", details: error.errors });
      }
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

  // Cost Codes routes (company-specific)
  app.get("/api/cost-codes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const codes = await storage.getCostCodes(req.user!.companyId);
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
        
        // Add group if provided
        if (row.groupName) {
          const groupKey = row.groupName.trim();
          
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

  // Clock-in/out routes
  app.get("/api/timesheets/active", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const activeTimesheet = await storage.getActiveTimesheet(req.user.id);
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
      const { projectId, costCodeId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const timesheet = await storage.clockIn(projectId, req.user.id, costCodeId);
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
      const { timesheetId } = req.body;
      if (!timesheetId) {
        return res.status(400).json({ error: "timesheetId is required" });
      }
      const timesheet = await storage.clockOut(timesheetId, req.user.id);
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

  app.post("/api/schedule-items", async (req, res) => {
    try {
      const validationResult = insertScheduleItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const item = await storage.createScheduleItem(validationResult.data);
      res.status(201).json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create schedule item",
        details: error.message 
      });
    }
  });

  app.patch("/api/schedule-items/:id", async (req, res) => {
    try {
      const validationResult = updateScheduleItemSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const item = await storage.updateScheduleItem(req.params.id, validationResult.data);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to update schedule item",
        details: error.message 
      });
    }
  });

  app.post("/api/schedule-items/bulk", async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Expected items array" });
      }
      
      const updatedItems = await storage.bulkUpdateScheduleItems(items);
      res.json(updatedItems);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to bulk update schedule items",
        details: error.message 
      });
    }
  });

  app.delete("/api/schedule-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to delete schedule item",
        details: error.message 
      });
    }
  });

  // Schedule Templates routes
  app.get("/api/schedule-templates", async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const templates = await storage.getScheduleTemplates(category);
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to fetch schedule templates",
        details: error.message 
      });
    }
  });

  app.get("/api/schedule-templates/:id", async (req, res) => {
    try {
      const template = await storage.getScheduleTemplate(req.params.id);
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

  app.post("/api/schedule-templates", async (req, res) => {
    try {
      const validationResult = insertScheduleTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const template = await storage.createScheduleTemplate(validationResult.data);
      res.status(201).json(template);
    } catch (error: any) {
      res.status(500).json({ 
        error: "Failed to create schedule template",
        details: error.message 
      });
    }
  });

  app.patch("/api/schedule-templates/:id", async (req, res) => {
    try {
      const validationResult = updateScheduleTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const template = await storage.updateScheduleTemplate(req.params.id, validationResult.data);
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

  app.delete("/api/schedule-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleTemplate(req.params.id);
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
      const validationResult = insertTaskTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const companyId = req.user!.companyId!;
      const createdBy = req.user!.id;
      const createdByName = `${req.user!.firstName} ${req.user!.lastName}`;

      const template = await storage.createTaskTemplate({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName,
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create task template" });
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
      const channels = await storage.getChannels(companyId, userId);
      res.json(channels);
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
      const { limit, before } = req.query;
      const messages = await storage.getMessages(
        req.params.channelId,
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

  const httpServer = createServer(app);

  // Setup Socket.io for real-time messaging with session authentication
  setupMessagingSocket(httpServer, sessionMiddleware);

  return httpServer;
}
