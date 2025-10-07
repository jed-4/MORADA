import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  insertNoteSchema,
  insertTaskSchema,
  insertCustomFieldDefSchema,
  insertCustomFieldOptionSchema,
  insertNoteTemplateSchema,
  insertProjectSchema,
  insertTaskViewSchema,
  insertEstimateSchema,
  insertEstimateItemSchema,
  insertEstimateGroupSchema,
  insertCostCodeSchema,
  insertUserSchema,
  insertUserRoleSchema,
  insertPermissionSchema,
  insertRolePermissionSchema,
  insertUserProjectAccessSchema,
  insertUserInvitationSchema,
  insertCompanySettingsSchema,
  insertFieldCategorySchema,
  insertFieldOptionSchema,
  insertSelectionSchema,
  insertSelectionOptionSchema,
  insertOptionAttachmentSchema,
  insertClientSelectionSchema,
  insertSupplierSchema,
  insertBillSchema,
  insertBillLineItemSchema,
  insertBillApprovalSchema,
  insertVariationSchema,
  insertVariationItemSchema,
  insertClientInvoiceSchema,
  insertClientInvoiceItemSchema,
  insertClientInvoicePaymentSchema,
  insertInvoiceEstimateSchema,
  insertInvoiceVariationSchema,
  insertInvoiceBillSchema
} from "@shared/schema";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { PasswordUtils } from "./utils/auth";
import { requireAuth, requireAdmin, requireTeamMember, requirePermission, toSafeUser } from "./middleware/auth";
import multer from "multer";

export async function registerRoutes(app: Express): Promise<Server> {
  // put application routes here
  // prefix all routes with /api

  // Global authentication middleware with exceptions for development
  app.use('/api', (req, res, next) => {
    const path = req.path;
    
    // Always allow auth endpoints
    if (path.startsWith('/auth/')) {
      return next();
    }
    
    // Always allow public invitation endpoints
    if (/^\/invitations\/by-token\/[^/]+$/.test(path) || /^\/invitations\/[^/]+\/accept$/.test(path)) {
      return next();
    }

    // TEMPORARY: Allow field categories operations for development (remove when auth UI is ready)
    if ((path.startsWith('/field-categories') || path.startsWith('/field-options')) && process.env.NODE_ENV === 'development') {
      return next();
    }
    
    // TEMPORARY: Allow company settings for development (needed for Settings page)
    if (path.startsWith('/company-settings') && process.env.NODE_ENV === 'development') {
      return next();
    }
    
    // TEMPORARY: Allow notes operations for development (remove when auth UI is ready)
    if (path.startsWith('/notes')) {
      return next();
    }
    
    // TEMPORARY: Allow projects, tasks, estimates, suppliers, bills, variations, client invoices, and other core operations for development
    if (path.startsWith('/projects') || path.startsWith('/tasks') || path.startsWith('/estimates') || path.startsWith('/estimate-items') || path.startsWith('/estimate-groups') || path.startsWith('/cost-codes') || path.startsWith('/note-templates') || path.startsWith('/custom-field-defs') || path.startsWith('/custom-field-options') || path.startsWith('/suppliers') || path.startsWith('/bills') || path.startsWith('/variations') || path.startsWith('/variation-items') || path.startsWith('/client-invoices') || path.startsWith('/client-invoice-items') || path.startsWith('/client-invoice-payments') || path.startsWith('/invoice-estimates') || path.startsWith('/invoice-variations') || path.startsWith('/invoice-bills')) {
      return next();
    }
    
    // Require authentication for admin routes (users, roles, permissions, invitations)
    return requireAuth(req, res, next);
  });

  // use storage to perform CRUD operations on the storage interface
  // e.g. storage.insertUser(user) or storage.getUserByUsername(username)

  // Notes API Routes
  app.get("/api/notes", async (req, res) => {
    try {
      const { projectId } = req.query;
      const notes = await storage.getNotes(projectId as string | undefined);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.get("/api/notes/:id", async (req, res) => {
    try {
      const note = await storage.getNote(req.params.id);
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

      const note = await storage.createNote(validationResult.data);
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.patch("/api/notes/:id", async (req, res) => {
    try {
      const updateSchema = insertNoteSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
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
      const { projectId, status } = req.query;
      const tasks = await storage.getTasks(
        projectId as string | undefined,
        status as string | undefined
      );
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
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

  app.post("/api/tasks", async (req, res) => {
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

  app.post("/api/field-categories", requireAdmin, async (req, res) => {
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

  app.patch("/api/field-categories/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/field-categories/:id", requireAdmin, async (req, res) => {
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

  app.post("/api/field-options", requireAdmin, async (req, res) => {
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

  app.patch("/api/field-options/:id", requireAdmin, async (req, res) => {
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

  app.delete("/api/field-options/:id", requireAdmin, async (req, res) => {
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
  app.post("/api/field-categories/:id/options/batch", async (req, res) => {
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

  // Projects API Routes
  app.get("/api/projects", async (req, res) => {
    try {
      const { ownerId } = req.query;
      const projects = await storage.getProjects(ownerId as string | undefined);
      res.json(projects);
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
      const validationResult = insertProjectSchema.safeParse(req.body);
      if (!validationResult.success) {
        console.error("Project validation failed:", fromZodError(validationResult.error).toString());
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const project = await storage.createProject(validationResult.data);
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
      const validationResult = insertEstimateItemSchema.safeParse({
        ...req.body,
        estimateId: req.params.id
      });
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

  app.patch("/api/estimate-items/:id", async (req, res) => {
    try {
      const updateSchema = insertEstimateItemSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
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

  // Cost Codes API Routes
  app.get("/api/projects/:projectId/cost-codes", async (req, res) => {
    try {
      const costCodes = await storage.getCostCodes(req.params.projectId);
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

  // ============================================================
  // USER ROLE SYSTEM API ROUTES
  // ============================================================

  // Authentication Routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      const user = await storage.validateUserCredentials(username, password);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      // Regenerate session to prevent fixation attacks
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.status(500).json({ error: "Login failed" });
        }
        
        // Create secure session with new session ID
        req.session.userId = user.id;
        
        // Save session explicitly
        req.session.save(async (err) => {
          if (err) {
            console.error('Session save error:', err);
            return res.status(500).json({ error: "Login failed" });
          }
          
          try {
            // Update last login time
            await storage.updateUser(user.id, { lastLoginAt: new Date() });
            res.json({ user: toSafeUser(user), message: "Login successful" });
          } catch (error) {
            console.error('Login update error:', error);
            res.status(500).json({ error: "Login failed" });
          }
        });
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout error:', err);
          return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie('buildpro.session', { 
          httpOnly: true, 
          sameSite: 'lax', 
          secure: process.env.NODE_ENV === 'production' 
        }); // Clear correct session cookie
        res.json({ message: "Logout successful" });
      });
    } else {
      res.json({ message: "Already logged out" });
    }
  });

  // Current user route
  app.get("/api/auth/me", (req, res) => {
    res.json({ user: toSafeUser(req.user!) });
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

  // User Role Management Routes
  app.get("/api/user-roles", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const { category } = req.query;
      const roles = await storage.getUserRoles(category as any);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });

  app.get("/api/user-roles/:id", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const role = await storage.getUserRole(req.params.id);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user role" });
    }
  });

  app.post("/api/user-roles", requireTeamMember, requirePermission("admin.roles", "add"), async (req, res) => {
    try {
      const validationResult = insertUserRoleSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const role = await storage.createUserRole(validationResult.data);
      res.status(201).json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user role" });
    }
  });

  app.patch("/api/user-roles/:id", requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const updateSchema = insertUserRoleSchema.partial();
      const validationResult = updateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }

      const role = await storage.updateUserRole(req.params.id, validationResult.data);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }
      res.json(role);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.delete("/api/user-roles/:id", requireTeamMember, requirePermission("admin.roles", "delete"), async (req, res) => {
    try {
      const success = await storage.deleteUserRole(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "User role not found or cannot be deleted" });
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
  app.get("/api/user-roles/:roleId/permissions", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const rolePermissions = await storage.getRolePermissions(req.params.roleId);
      res.json(rolePermissions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });

  app.post("/api/user-roles/:roleId/permissions", requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
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
      const activityData = schema.insertActivitySchema.parse(req.body);
      const activity = await storage.createActivity(activityData);
      res.json(activity);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid activity data", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
