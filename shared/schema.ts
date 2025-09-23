import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User roles (Admin, Project Manager, Carpenter, Subcontractor, Client, etc.)
export const userRoles = pgTable("user_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  userCategory: text("user_category").notNull(), // "team" | "supplier" | "client"
  isBuiltIn: boolean("is_built_in").notNull().default(false), // System-defined roles
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Enhanced users table with role system  
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  company: text("company"),
  userCategory: text("user_category").notNull().default("team"), // "team" | "supplier" | "client"
  roleId: varchar("role_id").references(() => userRoles.id),
  roleName: text("role_name"), // Cached for performance
  isActive: boolean("is_active").notNull().default(true),
  isInvitePending: boolean("is_invite_pending").notNull().default(false),
  invitedBy: varchar("invited_by"),
  invitedAt: timestamp("invited_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Available permissions/features in the system
export const permissions = pgTable("permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "projects.view", "estimates.edit"
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // "admin", "projects", "financial", etc.
  actions: json("actions").notNull().default(['view']), // ["view", "add", "edit", "delete"]
  isBuiltIn: boolean("is_built_in").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Role permissions matrix (many-to-many)
export const rolePermissions = pgTable("role_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  roleId: varchar("role_id").notNull().references(() => userRoles.id, { onDelete: "cascade" }),
  permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  allowedActions: json("allowed_actions").notNull().default(['view']), // Which actions are allowed: ["view", "add", "edit", "delete"]
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User project access control
export const userProjectAccess = pgTable("user_project_access", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  accessLevel: text("access_level").notNull().default("view"), // "view" | "edit" | "admin"
  grantedBy: varchar("granted_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// User invitations for suppliers and clients
export const userInvitations = pgTable("user_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  company: text("company"),
  phone: text("phone"),
  userCategory: text("user_category").notNull(), // "supplier" | "client"
  roleId: varchar("role_id").notNull().references(() => userRoles.id),
  projectIds: json("project_ids").default([]), // Array of project IDs they'll have access to
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  inviteToken: text("invite_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdUserId: varchar("created_user_id").references(() => users.id), // Set when invitation is accepted
  status: text("status").notNull().default("pending"), // "pending" | "accepted" | "expired" | "cancelled"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Schema for user creation/updates
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  email: z.string().email().optional(),
  userCategory: z.enum(["team", "supplier", "client"]).default("team"),
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPermissionSchema = createInsertSchema(permissions).omit({
  id: true,
  createdAt: true,
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  createdAt: true,
});

export const insertUserProjectAccessSchema = createInsertSchema(userProjectAccess).omit({
  id: true,
  createdAt: true,
});

export const insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectIds: z.array(z.string()).default([]),
  expiresAt: z.coerce.date(),
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type Permission = typeof permissions.$inferSelect;
export type InsertPermission = z.infer<typeof insertPermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type UserProjectAccess = typeof userProjectAccess.$inferSelect;
export type InsertUserProjectAccess = z.infer<typeof insertUserProjectAccessSchema>;
export type UserInvitation = typeof userInvitations.$inferSelect;
export type InsertUserInvitation = z.infer<typeof insertUserInvitationSchema>;

// Utility types for role-based access
export type UserWithRole = User & {
  role?: UserRole;
  permissions?: Permission[];
};

export type PermissionAction = "view" | "add" | "edit" | "delete";
export type UserCategory = "team" | "supplier" | "client";

export const notes: any = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(), // Legacy plain text content
  contentHtml: text("content_html"), // Rich text HTML content
  contentText: text("content_text"), // Plain text for searching
  category: text("category").notNull().default("General"), // Legacy - will migrate to customFields
  priority: text("priority").notNull().default("medium"), // Legacy - will migrate to customFields
  author: text("author").notNull(), // Legacy author field
  ownerId: varchar("owner_id").references(() => users.id),
  ownerName: text("owner_name"), // Cached for performance
  customFields: json("custom_fields").default({}), // Record<string, any> for custom field values
  projectId: text("project_id"),
  
  // Task-specific fields
  type: text("type").notNull().default("note"), // "note" | "task"
  status: text("status").default("todo"), // "todo" | "in-progress" | "done" for tasks
  assigneeId: varchar("assignee_id").references(() => users.id),
  assigneeName: text("assignee_name"), // Cached for performance
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  tags: json("tags").default([]), // string[] for task tags
  
  // Subtask support
  parentTaskId: varchar("parent_task_id").references(() => notes.id),
  subtaskOrder: integer("subtask_order").default(0),
  
  // Recurring task settings
  isRecurring: boolean("is_recurring").default(false),
  recurringType: text("recurring_type"), // "daily" | "weekly" | "monthly" | "yearly" | "custom"
  recurringInterval: integer("recurring_interval").default(1), // Every N days/weeks/months
  recurringDays: json("recurring_days").default([]), // For weekly: [1,2,3] (Mon,Tue,Wed), for monthly: [15,30] (dates)
  recurringStartDate: timestamp("recurring_start_date"), // When the recurring pattern starts
  recurringEndDate: timestamp("recurring_end_date"),
  lastRecurringDate: timestamp("last_recurring_date"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Make legacy fields optional for backward compatibility during migration
  category: z.string().optional(),
  priority: z.string().optional(),
  // Ensure new fields are properly handled
  contentHtml: z.string().optional(),
  contentText: z.string().optional(),
  customFields: z.record(z.any()).optional(),
  // Task-specific fields
  type: z.enum(["note", "task"]).optional(),
  status: z.enum(["todo", "in-progress", "done"]).optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.coerce.date().optional(), // Coerce strings to dates for JSON compatibility
  completedAt: z.coerce.date().optional(), // Coerce strings to dates for JSON compatibility
  tags: z.array(z.string()).optional(),
  // Subtask fields
  parentTaskId: z.string().optional(),
  subtaskOrder: z.number().optional(),
  // Recurring task fields
  isRecurring: z.boolean().optional(),
  recurringType: z.enum(["daily", "weekly", "monthly", "yearly", "custom"]).optional(),
  recurringInterval: z.number().optional(),
  recurringDays: z.array(z.number()).optional(),
  recurringStartDate: z.coerce.date().optional(),
  recurringEndDate: z.coerce.date().optional(),
  lastRecurringDate: z.coerce.date().optional(),
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

// Task-specific types
export const insertTaskSchema = insertNoteSchema.extend({
  type: z.literal("task"),
  status: z.enum(["todo", "in-progress", "done"]).default("todo"),
  projectId: z.string().min(1, "Project is required for tasks"), // Required for tasks
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = Note & { type: "task" };

// Custom Field Definitions (max 4 per system)
export const customFieldDefs = pgTable("custom_field_defs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // Field key for customFields object
  label: text("label").notNull(), // Display name
  type: text("type").notNull().default("text"), // "text" | "select"
  required: boolean("required").notNull().default(false),
  order: integer("order").notNull().default(0), // Display order
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomFieldDefSchema = createInsertSchema(customFieldDefs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCustomFieldDef = z.infer<typeof insertCustomFieldDefSchema>;
export type CustomFieldDef = typeof customFieldDefs.$inferSelect;

// Custom Field Options (for select-type fields)
export const customFieldOptions = pgTable("custom_field_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fieldDefId: varchar("field_def_id").notNull().references(() => customFieldDefs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  value: text("value").notNull(),
  color: text("color"), // Optional hex color code
  order: integer("order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCustomFieldOptionSchema = createInsertSchema(customFieldOptions).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomFieldOption = z.infer<typeof insertCustomFieldOptionSchema>;
export type CustomFieldOption = typeof customFieldOptions.$inferSelect;

// Note Templates
export const noteTemplates = pgTable("note_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  defaultTitle: text("default_title"),
  contentHtml: text("content_html"), // Template content with rich text
  contentText: text("content_text"), // Plain text version
  defaultCustomFields: json("default_custom_fields").default({}), // Record<string, any>
  ownerId: varchar("owner_id").references(() => users.id),
  ownerName: text("owner_name"), // Cached for performance
  isPublic: boolean("is_public").notNull().default(false), // Can other users see/use this template
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertNoteTemplateSchema = createInsertSchema(noteTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNoteTemplate = z.infer<typeof insertNoteTemplateSchema>;
export type NoteTemplate = typeof noteTemplates.$inferSelect;

// Project Types Constants
export const PROJECT_TYPES = [
  'New Build',
  'Major Renovation', 
  'Extension',
  'Minor Renovation',
  'Repair & Maintenance',
  'Commercial Fit-out',
  'Landscaping',
  'Custom Build'
] as const;

export type ProjectType = typeof PROJECT_TYPES[number];

// Projects (for task organization)
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  jobNumber: text("job_number"), // Optional job/project reference number
  projectType: text("project_type"), // References PROJECT_TYPES
  color: text("color").default("#3b82f6"), // Default blue
  isActive: boolean("is_active").notNull().default(true),
  isBusiness: boolean("is_business").notNull().default(false), // Business project flag
  ownerId: varchar("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Task Views (saved filters and view settings)
export const taskViews = pgTable("task_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  viewType: text("view_type").notNull().default("kanban"), // "kanban" | "list" | "calendar"
  filters: json("filters").default({}), // Filter settings
  columnConfig: json("column_config").default({}), // Column visibility and order for list view
  isDefault: boolean("is_default").notNull().default(false),
  ownerId: varchar("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskViewSchema = createInsertSchema(taskViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTaskView = z.infer<typeof insertTaskViewSchema>;
export type TaskView = typeof taskViews.$inferSelect;

// Estimates
export const estimates = pgTable("estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  projectId: varchar("project_id").notNull().references(() => projects.id),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"), // "draft" | "working" | "locked" | "approved"
  isLocked: boolean("is_locked").notNull().default(false),
  projectMarkupPercent: integer("project_markup_percent").default(0), // Percentage as integer (10 = 10%)
  taxRate: integer("tax_rate").default(10), // GST/Tax percentage (10 = 10%)
  notes: text("notes"),
  ownerId: varchar("owner_id").references(() => users.id),
  ownerName: text("owner_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEstimateSchema = createInsertSchema(estimates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimate = z.infer<typeof insertEstimateSchema>;
export type Estimate = typeof estimates.$inferSelect;

// Estimate Items (Line Items)
export const estimateItems = pgTable("estimate_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("Material"), // "Material" | "Labour" | "Subcontractor" | "Fee"
  groupId: varchar("group_id").references(() => estimateGroups.id), // Reference to estimate groups
  costCode: text("cost_code"), // Reference to cost codes (will be created in settings)
  allowance: text("allowance").notNull().default("None"), // "None" | "Prime Cost" | "Provisional Sum"
  quantity: integer("quantity").notNull().default(1),
  unitType: text("unit_type").notNull().default("each"), // "each" | "m" | "m2" | etc (configurable)
  status: text("status").notNull().default("incomplete"), // "incomplete" | "not relevant" | "done" (configurable)
  priceExTax: integer("price_ex_tax").notNull().default(0), // Price in cents
  taxAmount: integer("tax_amount").notNull().default(0), // Calculated tax amount in cents
  priceIncTax: integer("price_inc_tax").notNull().default(0), // Total price in cents
  description: text("description"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"), // File attachment path/URL
  requestForQuote: boolean("request_for_quote").notNull().default(false),
  isSelection: boolean("is_selection").notNull().default(false), // Can link to Selections section
  visibleInProposal: boolean("visible_in_proposal").notNull().default(true),
  showAsInProposal: text("show_as_in_proposal").notNull().default("price"), // "empty" | "price" | "included" | "excluded"
  order: integer("order").notNull().default(0), // For sorting within groups
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEstimateItemSchema = createInsertSchema(estimateItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  // Convert price fields to numbers for easier handling
  priceExTax: z.number().default(0),
  taxAmount: z.number().default(0), 
  priceIncTax: z.number().default(0),
});

export type InsertEstimateItem = z.infer<typeof insertEstimateItemSchema>;
export type EstimateItem = typeof estimateItems.$inferSelect;

// Estimate Groups (for organizing line items)
export const estimateGroups = pgTable("estimate_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  order: integer("order").notNull().default(0),
  isCollapsed: boolean("is_collapsed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEstimateGroupSchema = createInsertSchema(estimateGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEstimateGroup = z.infer<typeof insertEstimateGroupSchema>;
export type EstimateGroup = typeof estimateGroups.$inferSelect;

// Summary calculation type for API responses
export type EstimateSummary = {
  subtotal: number;
  markupAmount: number;
  taxAmount: number;
  total: number;
  itemCount: number;
};
