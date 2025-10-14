import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, integer, boolean, pgEnum, numeric } from "drizzle-orm/pg-core";
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
  labels: json("labels").default([]), // string[] for task labels from field options
  
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
  labels: z.array(z.string()).optional(),
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

// Project Icons (Lucide React icon names)
export const PROJECT_ICONS = [
  { name: 'Building2', label: 'Building' },
  { name: 'Home', label: 'Home' },
  { name: 'Hammer', label: 'Hammer' },
  { name: 'Wrench', label: 'Wrench' },
  { name: 'HardHat', label: 'Hard Hat' },
  { name: 'Drill', label: 'Drill' },
  { name: 'Paintbrush', label: 'Paint Brush' },
  { name: 'Scissors', label: 'Scissors' },
  { name: 'Ruler', label: 'Ruler' },
  { name: 'PenTool', label: 'Pen Tool' },
  { name: 'Boxes', label: 'Boxes' },
  { name: 'Package', label: 'Package' },
] as const;

// Projects (for task organization)
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  jobNumber: text("job_number"), // Optional job/project reference number
  projectType: text("project_type"), // References PROJECT_TYPES
  color: text("color").default("#3b82f6"), // Default blue
  icon: text("icon").default("Building2"), // Lucide icon name
  isActive: boolean("is_active").notNull().default(true),
  isBusiness: boolean("is_business").notNull().default(false), // Business project flag
  invoicingMethod: text("invoicing_method").notNull().default("progress_payments"), // "progress_payments" | "cost_plus"
  ownerId: varchar("owner_id").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  invoicingMethod: z.enum(["progress_payments", "cost_plus"]).default("progress_payments"),
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
  parentItemId: varchar("parent_item_id").references((): any => estimateItems.id, { onDelete: "cascade" }), // For sub-items (3-level nesting)
  costCode: text("cost_code"), // Reference to cost codes (will be created in settings)
  allowance: text("allowance").notNull().default("None"), // "None" | "Prime Cost" | "Provisional Sum"
  quantity: integer("quantity").notNull().default(1),
  unitType: text("unit_type").notNull().default("each"), // "each" | "m" | "m2" | etc (configurable)
  status: text("status").notNull().default("incomplete"), // "incomplete" | "not relevant" | "done" (configurable)
  unitCostExTax: integer("unit_cost_ex_tax").notNull().default(0), // Unit price in cents (renamed from priceExTax)
  markupPercent: integer("markup_percent"), // Optional item-specific markup percentage (10 = 10%). Falls back to project markup if null
  taxAmount: integer("tax_amount").notNull().default(0), // Calculated tax amount in cents
  priceIncTax: integer("price_inc_tax").notNull().default(0), // Total price in cents
  description: text("description"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"), // File attachment path/URL
  requestForQuote: boolean("request_for_quote").notNull().default(false),
  isSelection: boolean("is_selection").notNull().default(false), // Can link to Selections section
  proposalVisible: boolean("proposal_visible").notNull().default(true), // Show/hide in proposal (renamed from visibleInProposal)
  shownAs: text("shown_as"), // Custom text to display in proposal instead of item name
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
  unitCostExTax: z.number().default(0),
  taxAmount: z.number().default(0), 
  priceIncTax: z.number().default(0),
  markupPercent: z.number().optional().nullable(),
  shownAs: z.string().optional().nullable(),
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
  subtotalWithMarkup: number;
  taxAmount: number;
  total: number;
  itemCount: number;
};

// Company Settings
export const companySettings = pgTable("company_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"), 
  website: text("website"),
  address: text("address"),
  logoUrl: text("logo_url"), // Path to uploaded logo file
  
  // Social Media Links
  facebook: text("facebook"),
  linkedin: text("linkedin"),
  twitter: text("twitter"),
  instagram: text("instagram"),
  googleMyBusiness: text("google_my_business"),
  yelp: text("yelp"),
  
  // System settings
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("10.00"), // Tax rate as percentage (e.g., 10.00 for 10%)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCompanySettings = z.infer<typeof insertCompanySettingsSchema>;
export type CompanySettings = typeof companySettings.$inferSelect;

// Cost Categories (business-wide categories for cost codes)
export const costCategories = pgTable("cost_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull(), // e.g., "001", "002", "5,000"
  title: text("title").notNull(), // e.g., "Preliminaries", "Site Services", "Finishing Trades"
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCostCategorySchema = createInsertSchema(costCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCostCategory = z.infer<typeof insertCostCategorySchema>;
export type CostCategory = typeof costCategories.$inferSelect;

// Cost Codes (business-wide cost codes that can belong to categories)
export const costCodes = pgTable("cost_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull(), // e.g., "FLRT", "100", "5,200"
  title: text("title").notNull(), // e.g., "Flat rate", "Preliminaries", "Interior Trim"
  categoryId: varchar("category_id").references(() => costCategories.id, { onDelete: "set null" }), // Nullable - can exist without category
  availableInTimesheets: boolean("available_in_timesheets").notNull().default(true),
  isSynced: boolean("is_synced").notNull().default(false), // Synced with Xero tracking category
  xeroTrackingCategoryId: text("xero_tracking_category_id"), // For future Xero integration
  isActive: boolean("is_active").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCostCodeSchema = createInsertSchema(costCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCostCode = z.infer<typeof insertCostCodeSchema>;
export type CostCode = typeof costCodes.$inferSelect;

// Field Categories (Buildern-style predefined categories)
export const fieldCategories = pgTable("field_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "task.status", "task.priority"
  label: text("label").notNull(), // Display name
  entity: text("entity").notNull(), // "task" | "note" | "project"
  description: text("description"),
  isBuiltIn: boolean("is_built_in").notNull().default(true), // System-defined categories
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFieldCategorySchema = createInsertSchema(fieldCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFieldCategory = z.infer<typeof insertFieldCategorySchema>;
export type FieldCategory = typeof fieldCategories.$inferSelect;

// Field Options (configurable options for each category)
export const fieldOptions = pgTable("field_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").notNull().references(() => fieldCategories.id, { onDelete: "cascade" }),
  key: text("key").notNull(), // Slug/identifier (e.g., "todo", "in_progress", "done")
  name: text("name").notNull(), // Display name (editable by user)
  color: text("color"), // Hex color code (e.g., "#3b82f6")
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false), // Default selection for this category
  isCompleted: boolean("is_completed").notNull().default(false), // Marks this option as the "completed" status
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertFieldOptionSchema = createInsertSchema(fieldOptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFieldOption = z.infer<typeof insertFieldOptionSchema>;
export type FieldOption = typeof fieldOptions.$inferSelect;

// Combined type for category with its options
export type FieldCategoryWithOptions = FieldCategory & {
  options: FieldOption[];
};

// Selections (categories like "Kitchen Splashback Tiles")
export const selections = pgTable("selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Kitchen Splashback Tiles"
  category: text("category"), // "Tiles"
  room: text("room"), // "Kitchen"
  description: text("description"),
  status: text("status").notNull().default("draft"), // "draft" | "pending" | "approved" | "selected"
  deadline: timestamp("deadline"),
  allowance: integer("allowance"), // Budget allowance in cents
  clientCanChange: boolean("client_can_change").notNull().default(true),
  clientCanSeePrice: boolean("client_can_see_price").notNull().default(false),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSelectionSchema = createInsertSchema(selections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSelection = z.infer<typeof insertSelectionSchema>;
export type Selection = typeof selections.$inferSelect;

// Selection Options (individual products within selections)
export const selectionOptions = pgTable("selection_options", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  selectionId: varchar("selection_id").notNull().references(() => selections.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // "Zellige Lily"
  description: text("description"),
  sku: text("sku"), // Product code/SKU
  brand: text("brand"), // Manufacturer/brand
  category: text("category"), // "Concept Tile & Timber"
  subcategory: text("subcategory"),
  unitCost: integer("unit_cost"), // Cost in cents
  unitTax: integer("unit_tax"), // Tax in cents
  gstInclusive: boolean("gst_inclusive").notNull().default(false), // Whether unit cost includes GST
  markupPercent: integer("markup_percent"), // Markup percentage
  totalCost: integer("total_cost"), // Final cost in cents
  quantity: integer("quantity").notNull().default(1),
  unitType: text("unit_type").notNull().default("ea"), // "m2", "linear_m", "ea", etc.
  url: text("url"), // Product URL
  visibleToClient: boolean("visible_to_client").notNull().default(true),
  isSelectedByClient: boolean("is_selected_by_client").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSelectionOptionSchema = createInsertSchema(selectionOptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSelectionOption = z.infer<typeof insertSelectionOptionSchema>;
export type SelectionOption = typeof selectionOptions.$inferSelect;

// Option Attachments (images, spec sheets, etc.)
export const optionAttachments = pgTable("option_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  optionId: varchar("option_id").notNull().references(() => selectionOptions.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileType: text("file_type").notNull(), // "image", "document", "specification"
  fileSize: integer("file_size"), // File size in bytes
  mimeType: text("mime_type"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOptionAttachmentSchema = createInsertSchema(optionAttachments).omit({
  id: true,
  createdAt: true,
});

export type InsertOptionAttachment = z.infer<typeof insertOptionAttachmentSchema>;
export type OptionAttachment = typeof optionAttachments.$inferSelect;

// Client Selections (track what clients have chosen)
export const clientSelections = pgTable("client_selections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  selectionId: varchar("selection_id").notNull().references(() => selections.id, { onDelete: "cascade" }),
  optionId: varchar("option_id").notNull().references(() => selectionOptions.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => users.id),
  notes: text("notes"), // Client notes about their selection
  selectedAt: timestamp("selected_at").notNull().defaultNow(),
});

export const insertClientSelectionSchema = createInsertSchema(clientSelections).omit({
  id: true,
  selectedAt: true,
});

export type InsertClientSelection = z.infer<typeof insertClientSelectionSchema>;
export type ClientSelection = typeof clientSelections.$inferSelect;

// Combined types for selections with their options
export type SelectionWithOptions = Selection & {
  options: (SelectionOption & { attachments?: OptionAttachment[] })[];
  clientSelection?: ClientSelection;
};

export type SelectionOptionWithAttachments = SelectionOption & {
  attachments: OptionAttachment[];
};

// Bill-related enums
export const billTypeEnum = pgEnum("bill_type", ["bill", "credit"]);
export const billStatusEnum = pgEnum("bill_status", ["draft", "awaiting_approval", "awaiting_payment", "paid"]);
export const billLineTypeEnum = pgEnum("bill_line_type", ["estimate", "item", "custom"]);
export const billApprovalStatusEnum = pgEnum("bill_approval_status", ["approved", "rejected"]);
export const taxTypeEnum = pgEnum("tax_type", ["GST on expenses", "No GST"]);

// Suppliers (for bills)
export const suppliers = pgTable("suppliers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  abn: text("abn"), // Australian Business Number
  address: text("address"),
  xeroContactId: text("xero_contact_id"), // For Xero integration linking
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupplierSchema = createInsertSchema(suppliers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliers.$inferSelect;

// Bills
export const bills = pgTable("bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  billNumber: text("bill_number").notNull().unique(), // Auto-generated unique number
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  supplierId: varchar("supplier_id").notNull().references(() => suppliers.id),
  billType: billTypeEnum("bill_type").notNull().default("bill"),
  status: billStatusEnum("status").notNull().default("draft"),
  billDate: timestamp("bill_date").notNull(),
  dueDate: timestamp("due_date"),
  billReference: text("bill_reference"), // Supplier's invoice/reference number
  notes: text("notes"),
  reminders: text("reminders"),
  subtotal: integer("subtotal").notNull().default(0), // Amount in cents
  tax: integer("tax").notNull().default(0), // Tax amount in cents
  total: integer("total").notNull().default(0), // Total amount in cents
  paidAmount: integer("paid_amount").notNull().default(0), // Paid amount in cents
  sendToXero: boolean("send_to_xero").notNull().default(false), // Checkbox for Xero sync
  xeroInvoiceId: text("xero_invoice_id"), // Xero bill ID
  xeroPaidStatus: text("xero_paid_status"), // Synced from Xero
  attachmentUrls: json("attachment_urls").default([]), // Array of PDF/image URLs
  ocrProcessed: boolean("ocr_processed").notNull().default(false),
  ocrData: json("ocr_data"), // Raw OCR results
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBillSchema = createInsertSchema(bills).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  billType: z.enum(["bill", "credit"]),
  status: z.enum(["draft", "awaiting_approval", "awaiting_payment", "paid"]),
  billDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  total: z.number().default(0),
  paidAmount: z.number().default(0),
  attachmentUrls: z.array(z.string()).optional(),
});

export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof bills.$inferSelect;

// Bill Line Items
export const billLineItems = pgTable("bill_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  lineType: billLineTypeEnum("line_type").notNull().default("custom"),
  description: text("description").notNull(),
  costCodeId: varchar("cost_code_id").references(() => costCodes.id),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull().default(0), // Price in cents
  tax: taxTypeEnum("tax").notNull().default("GST on expenses"),
  account: text("account"), // Xero account code
  total: integer("total").notNull().default(0), // Total in cents
  order: integer("order").notNull().default(0), // For sorting
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBillLineItemSchema = createInsertSchema(billLineItems).omit({
  id: true,
  createdAt: true,
}).extend({
  lineType: z.enum(["estimate", "item", "custom"]),
  tax: z.enum(["GST on expenses", "No GST"]),
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  total: z.number().default(0),
  order: z.number().default(0),
});

export type InsertBillLineItem = z.infer<typeof insertBillLineItemSchema>;
export type BillLineItem = typeof billLineItems.$inferSelect;

// Bill Approvals
export const billApprovals = pgTable("bill_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  approvedById: varchar("approved_by_id").notNull().references(() => users.id),
  status: billApprovalStatusEnum("status").notNull(),
  comments: text("comments"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBillApprovalSchema = createInsertSchema(billApprovals).omit({
  id: true,
  createdAt: true,
}).extend({
  status: z.enum(["approved", "rejected"]),
});

export type InsertBillApproval = z.infer<typeof insertBillApprovalSchema>;
export type BillApproval = typeof billApprovals.$inferSelect;

// Xero Connections
export const xeroConnections = pgTable("xero_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").references(() => projects.id), // Nullable for global connection
  tenantId: text("tenant_id").notNull(), // Xero organization ID
  tenantName: text("tenant_name").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  trackingCategory1Name: text("tracking_category_1_name"), // For job/project
  trackingCategory2Name: text("tracking_category_2_name"), // For cost code
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertXeroConnectionSchema = createInsertSchema(xeroConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  tokenExpiresAt: z.coerce.date(),
});

export type InsertXeroConnection = z.infer<typeof insertXeroConnectionSchema>;
export type XeroConnection = typeof xeroConnections.$inferSelect;

// Variations (change orders/variations to projects)
export const variations = pgTable("variations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  variationNumber: text("variation_number").notNull(), // Auto-generated format like "4501-VO-017"
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  introductionText: text("introduction_text"),
  closingText: text("closing_text"),
  approvalDeadline: timestamp("approval_deadline"),
  daysChanged: integer("days_changed"),
  subtotal: integer("subtotal").notNull().default(0), // Amount in cents
  gstAmount: integer("gst_amount").notNull().default(0), // GST amount in cents
  totalAmount: integer("total_amount").notNull().default(0), // Total amount in cents
  paidAmount: integer("paid_amount").notNull().default(0), // Paid amount in cents
  balanceAmount: integer("balance_amount").notNull().default(0), // Balance amount in cents
  status: text("status").notNull().default("draft"), // "draft" | "action" | "pending" | "approved" | "rejected"
  relatedTo: text("related_to"), // Reference to related item
  approvedBy: varchar("approved_by").references(() => users.id),
  approvedDate: timestamp("approved_date"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVariationSchema = createInsertSchema(variations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(["draft", "action", "pending", "approved", "rejected"]).default("draft"),
  approvalDeadline: z.coerce.date().optional(),
  approvedDate: z.coerce.date().optional(),
  subtotal: z.number().default(0),
  gstAmount: z.number().default(0),
  totalAmount: z.number().default(0),
  paidAmount: z.number().default(0),
  balanceAmount: z.number().default(0),
});

export type InsertVariation = z.infer<typeof insertVariationSchema>;
export type Variation = typeof variations.$inferSelect;

// Variation Items (line items for variations)
export const variationItems = pgTable("variation_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  variationId: varchar("variation_id").notNull().references(() => variations.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull().default(0), // Price in cents
  totalPrice: integer("total_price").notNull().default(0), // Total price in cents
  taxable: boolean("taxable").notNull().default(true), // For GST calculation
  sortOrder: integer("sort_order").notNull().default(0), // For ordering
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVariationItemSchema = createInsertSchema(variationItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  totalPrice: z.number().default(0),
  sortOrder: z.number().default(0),
});

export type InsertVariationItem = z.infer<typeof insertVariationItemSchema>;
export type VariationItem = typeof variationItems.$inferSelect;

// Client Invoices
export const clientInvoices = pgTable("client_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  name: text("name").notNull(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => users.id),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  invoicingMethod: text("invoicing_method").notNull().default("progress_payments"),
  markupPercent: integer("markup_percent"),
  introductionText: text("introduction_text"),
  closingText: text("closing_text"),
  termsAndConditions: text("terms_and_conditions"),
  subtotal: integer("subtotal").notNull().default(0),
  markupAmount: integer("markup_amount").notNull().default(0),
  gstAmount: integer("gst_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull().default(0),
  paidAmount: integer("paid_amount").notNull().default(0),
  balanceAmount: integer("balance_amount").notNull().default(0),
  status: text("status").notNull().default("draft"),
  sentDate: timestamp("sent_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientInvoiceSchema = createInsertSchema(clientInvoices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Name is required"),
  invoicingMethod: z.enum(["progress_payments", "cost_plus"]).default("progress_payments"),
  status: z.enum(["draft", "sent", "partial", "paid", "overdue"]).default("draft"),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date().optional(),
  sentDate: z.coerce.date().optional(),
  subtotal: z.number().default(0),
  markupAmount: z.number().default(0),
  gstAmount: z.number().default(0),
  totalAmount: z.number().default(0),
  paidAmount: z.number().default(0),
  balanceAmount: z.number().default(0),
});

export type InsertClientInvoice = z.infer<typeof insertClientInvoiceSchema>;
export type ClientInvoice = typeof clientInvoices.$inferSelect;

// Client Invoice Items (custom line items)
export const clientInvoiceItems = pgTable("client_invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull().default(0),
  totalPrice: integer("total_price").notNull().default(0),
  taxable: boolean("taxable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientInvoiceItemSchema = createInsertSchema(clientInvoiceItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  quantity: z.number().default(1),
  unitPrice: z.number().default(0),
  totalPrice: z.number().default(0),
  sortOrder: z.number().default(0),
});

export type InsertClientInvoiceItem = z.infer<typeof insertClientInvoiceItemSchema>;
export type ClientInvoiceItem = typeof clientInvoiceItems.$inferSelect;

// Client Invoice Payments (payment history)
export const clientInvoicePayments = pgTable("client_invoice_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  notes: text("notes"),
  recordedBy: varchar("recorded_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertClientInvoicePaymentSchema = createInsertSchema(clientInvoicePayments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  amount: z.number(),
  paymentDate: z.coerce.date(),
});

export type InsertClientInvoicePayment = z.infer<typeof insertClientInvoicePaymentSchema>;
export type ClientInvoicePayment = typeof clientInvoicePayments.$inferSelect;

// Junction table: Invoice to Estimates (for Progress Payments mode)
export const invoiceEstimates = pgTable("invoice_estimates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
  progressPercent: integer("progress_percent"), // Progress percentage 0-100
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceEstimateSchema = createInsertSchema(invoiceEstimates).omit({
  id: true,
  createdAt: true,
}).extend({
  progressPercent: z.number().int().min(0).max(100).optional(),
});

export type InsertInvoiceEstimate = z.infer<typeof insertInvoiceEstimateSchema>;
export type InvoiceEstimate = typeof invoiceEstimates.$inferSelect;

// Junction table: Invoice to Variations (for Progress Payments mode)
export const invoiceVariations = pgTable("invoice_variations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  variationId: varchar("variation_id").notNull().references(() => variations.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceVariationSchema = createInsertSchema(invoiceVariations).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceVariation = z.infer<typeof insertInvoiceVariationSchema>;
export type InvoiceVariation = typeof invoiceVariations.$inferSelect;

// Junction table: Invoice to Allowances (for future use - Progress Payments mode)
export const invoiceAllowances = pgTable("invoice_allowances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  allowanceId: varchar("allowance_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceAllowanceSchema = createInsertSchema(invoiceAllowances).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceAllowance = z.infer<typeof insertInvoiceAllowanceSchema>;
export type InvoiceAllowance = typeof invoiceAllowances.$inferSelect;

// Junction table: Invoice to Bills (for Cost Plus mode)
export const invoiceBills = pgTable("invoice_bills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceBillSchema = createInsertSchema(invoiceBills).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceBill = z.infer<typeof insertInvoiceBillSchema>;
export type InvoiceBill = typeof invoiceBills.$inferSelect;

// Junction table: Invoice to Timesheets (for future use - Cost Plus mode)
export const invoiceTimesheets = pgTable("invoice_timesheets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
  timesheetId: varchar("timesheet_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInvoiceTimesheetSchema = createInsertSchema(invoiceTimesheets).omit({
  id: true,
  createdAt: true,
});

export type InsertInvoiceTimesheet = z.infer<typeof insertInvoiceTimesheetSchema>;
export type InvoiceTimesheet = typeof invoiceTimesheets.$inferSelect;

// Activity feed table
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  userId: varchar("user_id").references(() => users.id),
  userName: text("user_name"),
  activityType: text("activity_type").notNull(), // "task", "estimate", "bill", "variation", "invoice", etc.
  action: text("action").notNull(), // "created", "updated", "deleted", "status_changed", "approved", etc.
  description: text("description").notNull(),
  entityId: varchar("entity_id"), // ID of the related entity (task, estimate, etc.)
  entityName: text("entity_name"), // Name/title of the entity
  metadata: json("metadata"), // Additional data about the activity (e.g., old/new values)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
}).extend({
  activityType: z.enum(["task", "estimate", "bill", "variation", "invoice", "project", "site_diary", "other"]),
  action: z.enum(["created", "updated", "completed", "deleted", "status_changed", "approved", "rejected", "submitted", "paid"]),
});

export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type Activity = typeof activities.$inferSelect;

// Site Diary Templates (company-wide, reusable across projects)
export const siteDiaryTemplates = pgTable("site_diary_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  fields: json("fields").notNull().default([]), // Array of field definitions: [{id, title, type, required, options, order}]
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Field definition type for template fields
export type TemplateFieldDefinition = {
  id: string;
  title: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox" | "file" | "photo-gallery";
  required?: boolean;
  options?: { label: string; value: string }[]; // For select type
  order: number;
  maxPhotos?: number; // For photo-gallery type (default 3)
};

export const insertSiteDiaryTemplateSchema = createInsertSchema(siteDiaryTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  fields: z.array(z.object({
    id: z.string(),
    title: z.string(),
    type: z.enum(["text", "textarea", "number", "date", "select", "checkbox", "file", "photo-gallery"]),
    required: z.boolean().optional(),
    options: z.array(z.object({
      label: z.string(),
      value: z.string(),
    })).optional(),
    order: z.number(),
    maxPhotos: z.number().optional(),
  })),
});

export type InsertSiteDiaryTemplate = z.infer<typeof insertSiteDiaryTemplateSchema>;
export type SiteDiaryTemplate = typeof siteDiaryTemplates.$inferSelect;

// Site Diary Entries (project-specific diary entries based on templates)
export const siteDiaryEntries = pgTable("site_diary_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => siteDiaryTemplates.id),
  templateName: text("template_name"), // Cached for display
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  entryDateTime: timestamp("entry_date_time").notNull(),
  groupId: varchar("group_id"), // Optional grouping/category
  notifyUserIds: json("notify_user_ids").default([]), // Array of user IDs to notify
  fieldValues: json("field_values").notNull().default({}), // Object keyed by fieldId with values
  attachments: json("attachments").default([]), // Array of attachment URLs for field items
  overallPhotos: json("overall_photos").default([]), // Unlimited photos at bottom
  weather: json("weather"), // Weather data: {temp, condition, humidity, wind, etc}
  labels: json("labels").default([]), // Array of label strings
  createdBy: varchar("created_by").references(() => users.id),
  createdByName: text("created_by_name"),
  shareWithClient: boolean("share_with_client").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSiteDiaryEntrySchema = createInsertSchema(siteDiaryEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  entryDateTime: z.coerce.date(),
  notifyUserIds: z.array(z.string()).optional(),
  fieldValues: z.record(z.any()),
  attachments: z.array(z.any()).optional(),
  overallPhotos: z.array(z.string()).optional(),
  weather: z.object({
    temp: z.number().optional(),
    condition: z.string().optional(),
    humidity: z.number().optional(),
    wind: z.number().optional(),
    precipitation: z.number().optional(),
    icon: z.string().optional(),
  }).optional(),
  labels: z.array(z.string()).optional(),
});

export type InsertSiteDiaryEntry = z.infer<typeof insertSiteDiaryEntrySchema>;
export type SiteDiaryEntry = typeof siteDiaryEntries.$inferSelect;
