var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/utils/auth.ts
import bcrypt2 from "bcrypt";
import { randomBytes } from "crypto";
var SALT_ROUNDS, PasswordUtils;
var init_auth = __esm({
  "server/utils/auth.ts"() {
    "use strict";
    SALT_ROUNDS = 12;
    PasswordUtils = class {
      /**
       * Hash a plain text password using bcrypt
       */
      static async hashPassword(plainPassword) {
        return await bcrypt2.hash(plainPassword, SALT_ROUNDS);
      }
      /**
       * Verify a plain text password against a hashed password
       */
      static async verifyPassword(plainPassword, hashedPassword) {
        try {
          return await bcrypt2.compare(plainPassword, hashedPassword);
        } catch (error) {
          return false;
        }
      }
      /**
       * Generate a cryptographically secure random token for invitations
       * SECURITY FIX: Now uses crypto.randomBytes instead of Math.random
       */
      static generateSecureToken(byteLength = 32) {
        return randomBytes(byteLength).toString("base64url");
      }
      /**
       * Validate password strength
       */
      static validatePasswordStrength(password) {
        const errors = [];
        if (password.length < 12) {
          errors.push("Password must be at least 12 characters long");
        }
        if (!/[A-Z]/.test(password)) {
          errors.push("Password must contain at least one uppercase letter");
        }
        if (!/[a-z]/.test(password)) {
          errors.push("Password must contain at least one lowercase letter");
        }
        if (!/[0-9]/.test(password)) {
          errors.push("Password must contain at least one number");
        }
        if (!/[^A-Za-z0-9]/.test(password)) {
          errors.push("Password must contain at least one special character");
        }
        return {
          isValid: errors.length === 0,
          errors
        };
      }
      /**
       * Generate invitation expiry date (7 days from now)
       */
      static generateInviteExpiry() {
        const expiry = /* @__PURE__ */ new Date();
        expiry.setDate(expiry.getDate() + 7);
        return expiry;
      }
    };
  }
});

// server/utils/recurringTasks.ts
import { addDays, format, addWeeks } from "date-fns";
function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes2] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes2 + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
}
function generateRecurringTaskInstances(template, existingTaskDates = /* @__PURE__ */ new Set()) {
  const instances = [];
  if (!template.recurringDays || template.recurringDays.length === 0) {
    return instances;
  }
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = addWeeks(today, 4);
  for (let currentDate = new Date(today); currentDate <= endDate; currentDate = addDays(currentDate, 1)) {
    const dayOfWeek = currentDate.getDay();
    if (template.recurringDays.includes(dayOfWeek)) {
      const dateKey = `${template.id}:${format(currentDate, "yyyy-MM-dd")}`;
      if (!existingTaskDates.has(dateKey)) {
        const instance = {
          templateId: template.id,
          title: template.title,
          content: template.content,
          priority: template.priority,
          assigneeId: template.defaultAssigneeId,
          tagIds: template.tagIds,
          category: template.category,
          dueDate: new Date(currentDate)
        };
        if (template.checklist && template.checklist.length > 0) {
          instance.checklist = template.checklist.map((item) => ({
            text: item.text,
            completed: false
          }));
        }
        const scheduleForDay = template.recurringSchedule?.find((s) => Number(s.dayOfWeek) === dayOfWeek);
        if (scheduleForDay) {
          instance.startTime = scheduleForDay.startTime;
          if (scheduleForDay.duration > 0) {
            instance.endTime = calculateEndTime(scheduleForDay.startTime, scheduleForDay.duration);
          }
        } else if (template.recurringStartTime) {
          instance.startTime = template.recurringStartTime;
          if (template.recurringDuration && template.recurringDuration > 0) {
            instance.endTime = calculateEndTime(template.recurringStartTime, template.recurringDuration);
          }
        }
        instances.push(instance);
      }
    }
  }
  return instances;
}
function getRecurringTaskKey(templateId, dueDate) {
  const dateStr = typeof dueDate === "string" ? format(new Date(dueDate), "yyyy-MM-dd") : format(dueDate, "yyyy-MM-dd");
  return `${templateId}:${dateStr}`;
}
var init_recurringTasks = __esm({
  "server/utils/recurringTasks.ts"() {
    "use strict";
  }
});

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  PROJECT_ICONS: () => PROJECT_ICONS,
  PROJECT_TYPES: () => PROJECT_TYPES,
  activities: () => activities,
  activityNotes: () => activityNotes,
  allowanceItems: () => allowanceItems,
  billApprovalStatusEnum: () => billApprovalStatusEnum,
  billApprovals: () => billApprovals,
  billLineItemAllowances: () => billLineItemAllowances,
  billLineItems: () => billLineItems,
  billLineTypeEnum: () => billLineTypeEnum,
  billStatusEnum: () => billStatusEnum,
  billTypeEnum: () => billTypeEnum,
  bills: () => bills,
  budgetLineItems: () => budgetLineItems,
  budgets: () => budgets,
  calendarViews: () => calendarViews,
  channelMembers: () => channelMembers,
  channels: () => channels,
  checklistTemplateGroups: () => checklistTemplateGroups,
  checklistTemplateItems: () => checklistTemplateItems,
  checklistTemplates: () => checklistTemplates,
  clientInvoiceItems: () => clientInvoiceItems,
  clientInvoicePayments: () => clientInvoicePayments,
  clientInvoices: () => clientInvoices,
  clientSelections: () => clientSelections,
  clients: () => clients,
  companies: () => companies,
  companySettings: () => companySettings,
  contactTypeEnum: () => contactTypeEnum,
  contacts: () => contacts,
  costCategories: () => costCategories,
  costCodes: () => costCodes,
  customFieldDefs: () => customFieldDefs,
  customFieldOptions: () => customFieldOptions,
  defects: () => defects,
  estimateGroups: () => estimateGroups,
  estimateItems: () => estimateItems,
  estimates: () => estimates,
  fieldCategories: () => fieldCategories,
  fieldOptions: () => fieldOptions,
  insertActivityNoteSchema: () => insertActivityNoteSchema,
  insertActivitySchema: () => insertActivitySchema,
  insertAllowanceItemSchema: () => insertAllowanceItemSchema,
  insertBillApprovalSchema: () => insertBillApprovalSchema,
  insertBillLineItemAllowanceSchema: () => insertBillLineItemAllowanceSchema,
  insertBillLineItemSchema: () => insertBillLineItemSchema,
  insertBillSchema: () => insertBillSchema,
  insertBudgetLineItemSchema: () => insertBudgetLineItemSchema,
  insertBudgetSchema: () => insertBudgetSchema,
  insertCalendarViewSchema: () => insertCalendarViewSchema,
  insertChannelMemberSchema: () => insertChannelMemberSchema,
  insertChannelSchema: () => insertChannelSchema,
  insertChecklistTemplateGroupSchema: () => insertChecklistTemplateGroupSchema,
  insertChecklistTemplateItemSchema: () => insertChecklistTemplateItemSchema,
  insertChecklistTemplateSchema: () => insertChecklistTemplateSchema,
  insertClientInvoiceItemSchema: () => insertClientInvoiceItemSchema,
  insertClientInvoicePaymentSchema: () => insertClientInvoicePaymentSchema,
  insertClientInvoiceSchema: () => insertClientInvoiceSchema,
  insertClientSchema: () => insertClientSchema,
  insertClientSelectionSchema: () => insertClientSelectionSchema,
  insertCompanySchema: () => insertCompanySchema,
  insertCompanySettingsSchema: () => insertCompanySettingsSchema,
  insertContactSchema: () => insertContactSchema,
  insertCostCategorySchema: () => insertCostCategorySchema,
  insertCostCodeSchema: () => insertCostCodeSchema,
  insertCustomFieldDefSchema: () => insertCustomFieldDefSchema,
  insertCustomFieldOptionSchema: () => insertCustomFieldOptionSchema,
  insertDefectSchema: () => insertDefectSchema,
  insertEstimateGroupSchema: () => insertEstimateGroupSchema,
  insertEstimateItemSchema: () => insertEstimateItemSchema,
  insertEstimateSchema: () => insertEstimateSchema,
  insertFieldCategorySchema: () => insertFieldCategorySchema,
  insertFieldOptionSchema: () => insertFieldOptionSchema,
  insertInvoiceAllowanceSchema: () => insertInvoiceAllowanceSchema,
  insertInvoiceBillSchema: () => insertInvoiceBillSchema,
  insertInvoiceEstimateSchema: () => insertInvoiceEstimateSchema,
  insertInvoiceTimesheetSchema: () => insertInvoiceTimesheetSchema,
  insertInvoiceVariationSchema: () => insertInvoiceVariationSchema,
  insertLabourHoursBudgetSchema: () => insertLabourHoursBudgetSchema,
  insertMessageSchema: () => insertMessageSchema,
  insertMinuteSchema: () => insertMinuteSchema,
  insertNoteSchema: () => insertNoteSchema,
  insertNoteTemplateSchema: () => insertNoteTemplateSchema,
  insertOptionAttachmentSchema: () => insertOptionAttachmentSchema,
  insertPermissionSchema: () => insertPermissionSchema,
  insertProjectSchema: () => insertProjectSchema,
  insertProjectWorkflowSchema: () => insertProjectWorkflowSchema,
  insertProposalAcceptanceSchema: () => insertProposalAcceptanceSchema,
  insertProposalItemSchema: () => insertProposalItemSchema,
  insertProposalSchema: () => insertProposalSchema,
  insertProposalSectionSchema: () => insertProposalSectionSchema,
  insertRfqFollowUpSchema: () => insertRfqFollowUpSchema,
  insertRfqItemSchema: () => insertRfqItemSchema,
  insertRfqQuoteSchema: () => insertRfqQuoteSchema,
  insertRfqSchema: () => insertRfqSchema,
  insertRolePermissionSchema: () => insertRolePermissionSchema,
  insertScheduleItemSchema: () => insertScheduleItemSchema,
  insertScheduleSchema: () => insertScheduleSchema,
  insertScheduleTemplateSchema: () => insertScheduleTemplateSchema,
  insertScopeGearPhotoSchema: () => insertScopeGearPhotoSchema,
  insertScopeItemSchema: () => insertScopeItemSchema,
  insertScopeStageSchema: () => insertScopeStageSchema,
  insertScopeTemplateSchema: () => insertScopeTemplateSchema,
  insertSelectionOptionSchema: () => insertSelectionOptionSchema,
  insertSelectionSchema: () => insertSelectionSchema,
  insertSiteDiaryEntrySchema: () => insertSiteDiaryEntrySchema,
  insertSiteDiaryTemplateSchema: () => insertSiteDiaryTemplateSchema,
  insertSupplierSchema: () => insertSupplierSchema,
  insertSystemConfigurationSchema: () => insertSystemConfigurationSchema,
  insertSystemDocumentSchema: () => insertSystemDocumentSchema,
  insertSystemFolderSchema: () => insertSystemFolderSchema,
  insertTaskSchema: () => insertTaskSchema,
  insertTaskTagSchema: () => insertTaskTagSchema,
  insertTaskTemplateAttachmentSchema: () => insertTaskTemplateAttachmentSchema,
  insertTaskTemplateSchema: () => insertTaskTemplateSchema,
  insertTaskTemplateStatusSchema: () => insertTaskTemplateStatusSchema,
  insertTaskViewSchema: () => insertTaskViewSchema,
  insertTimesheetAllowanceSchema: () => insertTimesheetAllowanceSchema,
  insertTimesheetCostCodeSchema: () => insertTimesheetCostCodeSchema,
  insertTimesheetSchema: () => insertTimesheetSchema,
  insertUserColumnPreferencesSchema: () => insertUserColumnPreferencesSchema,
  insertUserInvitationSchema: () => insertUserInvitationSchema,
  insertUserProjectAccessSchema: () => insertUserProjectAccessSchema,
  insertUserRoleSchema: () => insertUserRoleSchema,
  insertUserSchema: () => insertUserSchema,
  insertVariationItemSchema: () => insertVariationItemSchema,
  insertVariationSchema: () => insertVariationSchema,
  insertWorkflowTemplateSchema: () => insertWorkflowTemplateSchema,
  insertXeroConnectionSchema: () => insertXeroConnectionSchema,
  invoiceAllowances: () => invoiceAllowances,
  invoiceBills: () => invoiceBills,
  invoiceEstimates: () => invoiceEstimates,
  invoiceTimesheets: () => invoiceTimesheets,
  invoiceVariations: () => invoiceVariations,
  labourHoursBudget: () => labourHoursBudget,
  messages: () => messages,
  minutes: () => minutes,
  noteTemplates: () => noteTemplates,
  notes: () => notes,
  optionAttachments: () => optionAttachments,
  permissions: () => permissions,
  primaryContactEnum: () => primaryContactEnum,
  projectWorkflows: () => projectWorkflows,
  projects: () => projects,
  proposalAcceptances: () => proposalAcceptances,
  proposalItems: () => proposalItems,
  proposalSections: () => proposalSections,
  proposals: () => proposals,
  rfqFollowUpTypeEnum: () => rfqFollowUpTypeEnum,
  rfqFollowUps: () => rfqFollowUps,
  rfqItems: () => rfqItems,
  rfqQuotes: () => rfqQuotes,
  rfqStatusEnum: () => rfqStatusEnum,
  rfqs: () => rfqs,
  rolePermissions: () => rolePermissions,
  scheduleItems: () => scheduleItems,
  scheduleTemplates: () => scheduleTemplates,
  schedules: () => schedules,
  scopeGearPhotos: () => scopeGearPhotos,
  scopeItems: () => scopeItems,
  scopeStages: () => scopeStages,
  scopeTemplates: () => scopeTemplates,
  selectionOptions: () => selectionOptions,
  selections: () => selections,
  sessions: () => sessions,
  siteDiaryEntries: () => siteDiaryEntries,
  siteDiaryTemplates: () => siteDiaryTemplates,
  suppliers: () => suppliers,
  systemConfiguration: () => systemConfiguration,
  systemDocuments: () => systemDocuments,
  systemFolders: () => systemFolders,
  taskTags: () => taskTags,
  taskTemplateAttachments: () => taskTemplateAttachments,
  taskTemplateStatuses: () => taskTemplateStatuses,
  taskTemplates: () => taskTemplates,
  taskViews: () => taskViews,
  taxTypeEnum: () => taxTypeEnum,
  timesheetAllowances: () => timesheetAllowances,
  timesheetCostCodes: () => timesheetCostCodes,
  timesheetStatusEnum: () => timesheetStatusEnum,
  timesheets: () => timesheets,
  updateBudgetLineItemSchema: () => updateBudgetLineItemSchema,
  updateBudgetSchema: () => updateBudgetSchema,
  updateScheduleItemSchema: () => updateScheduleItemSchema,
  updateScheduleSchema: () => updateScheduleSchema,
  updateScheduleTemplateSchema: () => updateScheduleTemplateSchema,
  updateScopeItemSchema: () => updateScopeItemSchema,
  updateScopeStageSchema: () => updateScopeStageSchema,
  updateScopeTemplateSchema: () => updateScopeTemplateSchema,
  upsertUserSchema: () => upsertUserSchema,
  userColumnPreferences: () => userColumnPreferences,
  userInvitations: () => userInvitations,
  userProjectAccess: () => userProjectAccess,
  userRoles: () => userRoles,
  users: () => users,
  variationItems: () => variationItems,
  variations: () => variations,
  workflowTemplates: () => workflowTemplates,
  xeroConnections: () => xeroConnections
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, jsonb, integer, boolean, pgEnum, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var sessions, companies, clients, insertClientSchema, userRoles, users, permissions, rolePermissions, userProjectAccess, userInvitations, userColumnPreferences, insertCompanySchema, upsertUserSchema, insertUserSchema, insertUserRoleSchema, insertPermissionSchema, insertRolePermissionSchema, insertUserProjectAccessSchema, insertUserInvitationSchema, insertUserColumnPreferencesSchema, notes, insertNoteSchema, insertTaskSchema, customFieldDefs, insertCustomFieldDefSchema, customFieldOptions, insertCustomFieldOptionSchema, noteTemplates, insertNoteTemplateSchema, PROJECT_TYPES, PROJECT_ICONS, projects, insertProjectSchema, taskViews, insertTaskViewSchema, estimates, insertEstimateSchema, estimateItems, insertEstimateItemSchema, estimateGroups, insertEstimateGroupSchema, companySettings, insertCompanySettingsSchema, systemConfiguration, insertSystemConfigurationSchema, costCategories, insertCostCategorySchema, costCodes, insertCostCodeSchema, fieldCategories, insertFieldCategorySchema, fieldOptions, insertFieldOptionSchema, selections, insertSelectionSchema, selectionOptions, insertSelectionOptionSchema, optionAttachments, insertOptionAttachmentSchema, clientSelections, insertClientSelectionSchema, billTypeEnum, billStatusEnum, billLineTypeEnum, billApprovalStatusEnum, taxTypeEnum, suppliers, insertSupplierSchema, contactTypeEnum, primaryContactEnum, contacts, insertContactSchema, bills, insertBillSchema, billLineItems, insertBillLineItemSchema, billApprovals, insertBillApprovalSchema, billLineItemAllowances, insertBillLineItemAllowanceSchema, timesheetAllowances, insertTimesheetAllowanceSchema, allowanceItems, insertAllowanceItemSchema, xeroConnections, insertXeroConnectionSchema, variations, insertVariationSchema, variationItems, insertVariationItemSchema, clientInvoices, insertClientInvoiceSchema, clientInvoiceItems, insertClientInvoiceItemSchema, clientInvoicePayments, insertClientInvoicePaymentSchema, invoiceEstimates, insertInvoiceEstimateSchema, invoiceVariations, insertInvoiceVariationSchema, invoiceAllowances, insertInvoiceAllowanceSchema, invoiceBills, insertInvoiceBillSchema, invoiceTimesheets, insertInvoiceTimesheetSchema, proposals, insertProposalSchema, proposalSections, insertProposalSectionSchema, proposalItems, insertProposalItemSchema, proposalAcceptances, insertProposalAcceptanceSchema, activities, insertActivitySchema, siteDiaryTemplates, insertSiteDiaryTemplateSchema, siteDiaryEntries, insertSiteDiaryEntrySchema, checklistTemplates, insertChecklistTemplateSchema, checklistTemplateGroups, insertChecklistTemplateGroupSchema, checklistTemplateItems, insertChecklistTemplateItemSchema, budgets, insertBudgetSchema, updateBudgetSchema, budgetLineItems, insertBudgetLineItemSchema, updateBudgetLineItemSchema, labourHoursBudget, insertLabourHoursBudgetSchema, timesheetStatusEnum, timesheets, timesheetCostCodes, insertTimesheetSchema, insertTimesheetCostCodeSchema, schedules, insertScheduleSchema, scheduleItems, insertScheduleItemSchema, activityNotes, insertActivityNoteSchema, scheduleTemplates, insertScheduleTemplateSchema, updateScheduleSchema, scopeStages, insertScopeStageSchema, updateScopeStageSchema, scopeItems, insertScopeItemSchema, scopeTemplates, insertScopeTemplateSchema, scopeGearPhotos, insertScopeGearPhotoSchema, updateScopeItemSchema, updateScopeTemplateSchema, calendarViews, insertCalendarViewSchema, updateScheduleItemSchema, updateScheduleTemplateSchema, defects, insertDefectSchema, minutes, insertMinuteSchema, systemFolders, insertSystemFolderSchema, systemDocuments, insertSystemDocumentSchema, taskTemplates, insertTaskTemplateSchema, taskTemplateAttachments, insertTaskTemplateAttachmentSchema, taskTags, insertTaskTagSchema, taskTemplateStatuses, insertTaskTemplateStatusSchema, workflowTemplates, insertWorkflowTemplateSchema, projectWorkflows, insertProjectWorkflowSchema, channels, insertChannelSchema, channelMembers, insertChannelMemberSchema, messages, insertMessageSchema, rfqStatusEnum, rfqFollowUpTypeEnum, rfqs, insertRfqSchema, rfqItems, insertRfqItemSchema, rfqQuotes, insertRfqQuoteSchema, rfqFollowUps, insertRfqFollowUpSchema;
var init_schema = __esm({
  "shared/schema.ts"() {
    "use strict";
    sessions = pgTable(
      "sessions",
      {
        sid: varchar("sid").primaryKey(),
        sess: jsonb("sess").notNull(),
        expire: timestamp("expire").notNull()
      },
      (table) => [index("IDX_session_expire").on(table.expire)]
    );
    companies = pgTable("companies", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      abn: text("abn"),
      address: text("address"),
      phone: text("phone"),
      email: text("email"),
      website: text("website"),
      logo: text("logo"),
      ownerId: varchar("owner_id"),
      // User who created/owns the company
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    clients = pgTable("clients", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      email: text("email"),
      phone: text("phone"),
      company: text("company"),
      address: text("address"),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertClientSchema = createInsertSchema(clients).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    userRoles = pgTable("user_roles", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      name: text("name").notNull(),
      description: text("description"),
      userCategory: text("user_category").notNull(),
      // "team" | "supplier" | "client"
      isBuiltIn: boolean("is_built_in").notNull().default(false),
      // System-defined roles
      isActive: boolean("is_active").notNull().default(true),
      displayOrder: integer("display_order").notNull().default(0),
      // Custom sort order
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      // Composite unique constraint: role names must be unique per company
      uniqueNamePerCompany: uniqueIndex("user_roles_company_name_unique").on(table.companyId, table.name)
    }));
    users = pgTable("users", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      email: varchar("email").unique(),
      // Nullable since some Replit login methods don't provide email
      firstName: varchar("first_name"),
      lastName: varchar("last_name"),
      profileImageUrl: varchar("profile_image_url"),
      // From Replit Auth
      // Application fields
      phone: text("phone"),
      companyId: varchar("company_id").references(() => companies.id),
      userCategory: text("user_category").notNull().default("team"),
      // "team" | "supplier" | "client"
      roleId: varchar("role_id").references(() => userRoles.id),
      roleName: text("role_name"),
      // Cached for performance
      isActive: boolean("is_active").notNull().default(true),
      isInvitePending: boolean("is_invite_pending").notNull().default(false),
      invitedBy: varchar("invited_by"),
      invitedAt: timestamp("invited_at"),
      lastLoginAt: timestamp("last_login_at"),
      // Google Calendar integration fields
      googleCalendarEmail: text("google_calendar_email"),
      googleCalendarAccessToken: text("google_calendar_access_token"),
      googleCalendarRefreshToken: text("google_calendar_refresh_token"),
      googleCalendarTokenExpiry: timestamp("google_calendar_token_expiry"),
      googleCalendarConnectedAt: timestamp("google_calendar_connected_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    permissions = pgTable("permissions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: text("key").notNull().unique(),
      // e.g., "projects.view", "estimates.edit"
      name: text("name").notNull(),
      description: text("description"),
      category: text("category").notNull(),
      // "admin", "projects", "financial", etc.
      actions: json("actions").notNull().default(["view"]),
      // ["view", "add", "edit", "delete"]
      isBuiltIn: boolean("is_built_in").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    rolePermissions = pgTable("role_permissions", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      roleId: varchar("role_id").notNull().references(() => userRoles.id, { onDelete: "cascade" }),
      permissionId: varchar("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
      allowedActions: json("allowed_actions").notNull().default(["view"]),
      // Which actions are allowed: ["view", "add", "edit", "delete"]
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    userProjectAccess = pgTable("user_project_access", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      accessLevel: text("access_level").notNull().default("view"),
      // "view" | "edit" | "admin"
      grantedBy: varchar("granted_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    userInvitations = pgTable("user_invitations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      email: text("email").notNull(),
      firstName: text("first_name"),
      lastName: text("last_name"),
      company: text("company"),
      phone: text("phone"),
      userCategory: text("user_category").notNull(),
      // "team" | "supplier" | "client"
      roleId: varchar("role_id").notNull().references(() => userRoles.id),
      projectIds: json("project_ids").default([]),
      // Array of project IDs they'll have access to
      invitedBy: varchar("invited_by").notNull().references(() => users.id),
      inviteToken: text("invite_token").notNull().unique(),
      expiresAt: timestamp("expires_at").notNull(),
      acceptedAt: timestamp("accepted_at"),
      createdUserId: varchar("created_user_id").references(() => users.id),
      // Set when invitation is accepted
      status: text("status").notNull().default("pending"),
      // "pending" | "accepted" | "expired" | "cancelled"
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    userColumnPreferences = pgTable("user_column_preferences", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      pageKey: text("page_key").notNull(),
      // e.g., "estimate_detail", "tasks_list"
      columnConfig: jsonb("column_config").notNull(),
      // Array of { id, label, visible, widthPx }
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCompanySchema = createInsertSchema(companies).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    upsertUserSchema = z.object({
      id: z.string(),
      email: z.string().nullable(),
      firstName: z.string().nullable(),
      lastName: z.string().nullable(),
      profileImageUrl: z.string().nullable()
    });
    insertUserSchema = createInsertSchema(users).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      email: z.string().email().nullable().optional(),
      userCategory: z.enum(["team", "supplier", "client"]).default("team")
    });
    insertUserRoleSchema = createInsertSchema(userRoles).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    insertPermissionSchema = createInsertSchema(permissions).omit({
      id: true,
      createdAt: true
    });
    insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
      id: true,
      createdAt: true
    });
    insertUserProjectAccessSchema = createInsertSchema(userProjectAccess).omit({
      id: true,
      createdAt: true
    });
    insertUserInvitationSchema = createInsertSchema(userInvitations).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      projectIds: z.array(z.string()).default([]),
      expiresAt: z.coerce.date()
    });
    insertUserColumnPreferencesSchema = createInsertSchema(userColumnPreferences).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    notes = pgTable("notes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull(),
      title: text("title").notNull(),
      content: text("content").notNull(),
      // Legacy plain text content
      contentHtml: text("content_html"),
      // Rich text HTML content
      contentText: text("content_text"),
      // Plain text for searching
      category: text("category").notNull().default("General"),
      // Legacy - will migrate to customFields
      priority: text("priority").notNull().default("medium"),
      // Legacy - will migrate to customFields
      author: text("author").notNull(),
      // Legacy author field
      ownerId: varchar("owner_id").references(() => users.id),
      ownerName: text("owner_name"),
      // Cached for performance
      visibility: text("visibility").notNull().default("team_only"),
      // "team_only" | "everyone" | "project_team" | "private"
      pinned: boolean("pinned").default(false),
      // Whether note is pinned to top
      customFields: json("custom_fields").default({}),
      // Record<string, any> for custom field values
      projectId: text("project_id"),
      // Task-specific fields
      type: text("type").notNull().default("note"),
      // "note" | "task"
      status: text("status").default("todo"),
      // "todo" | "in-progress" | "done" for tasks
      assigneeId: varchar("assignee_id").references(() => users.id),
      assigneeName: text("assignee_name"),
      // Cached for performance
      dueDate: timestamp("due_date"),
      startTime: text("start_time"),
      // Optional time in HH:MM format for timed events
      endTime: text("end_time"),
      // Optional time in HH:MM format for timed events
      completedAt: timestamp("completed_at"),
      tags: json("tags").default([]),
      // string[] for task tags
      labels: json("labels").default([]),
      // string[] for task labels from field options
      // Subtask support
      parentTaskId: varchar("parent_task_id").references(() => notes.id),
      subtaskOrder: integer("subtask_order").default(0),
      // Recurring task settings
      isRecurring: boolean("is_recurring").default(false),
      recurringType: text("recurring_type"),
      // "daily" | "weekly" | "monthly" | "yearly" | "custom"
      recurringInterval: integer("recurring_interval").default(1),
      // Every N days/weeks/months
      recurringDays: json("recurring_days").default([]),
      // For weekly: [1,2,3] (Mon,Tue,Wed), for monthly: [15,30] (dates)
      recurringStartDate: timestamp("recurring_start_date"),
      // When the recurring pattern starts
      recurringEndDate: timestamp("recurring_end_date"),
      lastRecurringDate: timestamp("last_recurring_date"),
      templateId: varchar("template_id"),
      // Link to task template for recurring tasks
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertNoteSchema = createInsertSchema(notes).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      // Make legacy fields optional for backward compatibility during migration
      category: z.string().optional(),
      priority: z.string().optional(),
      // Ensure new fields are properly handled
      contentHtml: z.string().optional(),
      contentText: z.string().optional(),
      visibility: z.enum(["team_only", "everyone", "project_team", "private"]).optional(),
      pinned: z.boolean().optional(),
      customFields: z.record(z.any()).optional(),
      // Task-specific fields
      type: z.enum(["note", "task"]).optional(),
      status: z.enum(["todo", "in-progress", "done"]).optional(),
      assigneeId: z.string().optional(),
      assigneeName: z.string().optional(),
      dueDate: z.coerce.date().optional(),
      // Coerce strings to dates for JSON compatibility
      startTime: z.string().optional(),
      // HH:MM format
      endTime: z.string().optional(),
      // HH:MM format
      completedAt: z.coerce.date().optional(),
      // Coerce strings to dates for JSON compatibility
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
      templateId: z.string().optional(),
      lastRecurringDate: z.coerce.date().optional()
    });
    insertTaskSchema = insertNoteSchema.extend({
      type: z.literal("task"),
      status: z.enum(["todo", "in-progress", "done"]).default("todo"),
      projectId: z.string().optional().nullable()
      // Optional - null for business/company-wide tasks
    });
    customFieldDefs = pgTable("custom_field_defs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: text("key").notNull().unique(),
      // Field key for customFields object
      label: text("label").notNull(),
      // Display name
      type: text("type").notNull().default("text"),
      // "text" | "select"
      required: boolean("required").notNull().default(false),
      order: integer("order").notNull().default(0),
      // Display order
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCustomFieldDefSchema = createInsertSchema(customFieldDefs).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    customFieldOptions = pgTable("custom_field_options", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      fieldDefId: varchar("field_def_id").notNull().references(() => customFieldDefs.id, { onDelete: "cascade" }),
      label: text("label").notNull(),
      value: text("value").notNull(),
      color: text("color"),
      // Optional hex color code
      order: integer("order").notNull().default(0),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertCustomFieldOptionSchema = createInsertSchema(customFieldOptions).omit({
      id: true,
      createdAt: true
    });
    noteTemplates = pgTable("note_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      defaultTitle: text("default_title"),
      contentHtml: text("content_html"),
      // Template content with rich text
      contentText: text("content_text"),
      // Plain text version
      defaultCustomFields: json("default_custom_fields").default({}),
      // Record<string, any>
      ownerId: varchar("owner_id").references(() => users.id),
      ownerName: text("owner_name"),
      // Cached for performance
      isPublic: boolean("is_public").notNull().default(false),
      // Can other users see/use this template
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertNoteTemplateSchema = createInsertSchema(noteTemplates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    PROJECT_TYPES = [
      "New Build",
      "Major Renovation",
      "Extension",
      "Minor Renovation",
      "Repair & Maintenance",
      "Commercial Fit-out",
      "Landscaping",
      "Custom Build"
    ];
    PROJECT_ICONS = [
      { name: "Building2", label: "Building" },
      { name: "Home", label: "Home" },
      { name: "Hammer", label: "Hammer" },
      { name: "Wrench", label: "Wrench" },
      { name: "HardHat", label: "Hard Hat" },
      { name: "Drill", label: "Drill" },
      { name: "Paintbrush", label: "Paint Brush" },
      { name: "Scissors", label: "Scissors" },
      { name: "Ruler", label: "Ruler" },
      { name: "PenTool", label: "Pen Tool" },
      { name: "Boxes", label: "Boxes" },
      { name: "Package", label: "Package" }
    ];
    projects = pgTable("projects", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      jobNumber: text("job_number"),
      // Project reference number (displayed as "Project Number")
      projectType: text("project_type"),
      // References PROJECT_TYPES
      color: text("color").default("#3b82f6"),
      // Default blue
      icon: text("icon").default("Building2"),
      // Lucide icon name
      location: text("location"),
      // Project address/location (displayed as "Address")
      status: text("status").notNull().default("active"),
      // Legacy field - kept for backwards compatibility
      // New hierarchical status fields
      projectStatus: text("project_status"),
      // High-level status: Lead, Pre-Construction, Construction, Post Construction
      projectSubStatus: text("project_sub_status"),
      // Low-level status tied to projectStatus
      // Client and financial fields
      clientId: varchar("client_id").references(() => clients.id),
      clientBudget: integer("client_budget"),
      // Client's budget in cents
      contractCost: integer("contract_cost"),
      // Agreed contract cost in cents
      selectedEstimateId: varchar("selected_estimate_id"),
      // Reference to the estimate used for costing
      // Date fields
      startDate: text("start_date"),
      // ISO date string (legacy)
      endDate: text("end_date"),
      // ISO date string (legacy)
      proposedStartDate: text("proposed_start_date"),
      // ISO date string
      proposedEndDate: text("proposed_end_date"),
      // ISO date string
      budget: integer("budget"),
      // Internal budget in cents (legacy)
      isActive: boolean("is_active").notNull().default(true),
      isArchived: boolean("is_archived").notNull().default(false),
      // Archived projects are hidden from main lists
      isBusiness: boolean("is_business").notNull().default(false),
      // Business-level project (vs construction project)
      invoicingMethod: text("invoicing_method").notNull().default("progress_payments"),
      // "progress_payments" | "cost_plus"
      companyId: varchar("company_id").references(() => companies.id),
      // Multi-tenant isolation
      ownerId: varchar("owner_id").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertProjectSchema = createInsertSchema(projects).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      invoicingMethod: z.enum(["progress_payments", "cost_plus"]).default("progress_payments"),
      status: z.enum(["active", "on_hold", "completed"]).default("active"),
      color: z.string().default("#3b82f6"),
      icon: z.string().default("Building2")
    });
    taskViews = pgTable("task_views", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      viewType: text("view_type").notNull().default("kanban"),
      // "kanban" | "list" | "calendar"
      filters: json("filters").default({}),
      // Filter settings
      columnConfig: json("column_config").default({}),
      // Column visibility and order for list view
      isDefault: boolean("is_default").notNull().default(false),
      ownerId: varchar("owner_id").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertTaskViewSchema = createInsertSchema(taskViews).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    estimates = pgTable("estimates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      projectId: varchar("project_id").notNull().references(() => projects.id),
      version: integer("version").notNull().default(1),
      status: text("status").notNull().default("draft"),
      // "draft" | "working" | "locked" | "approved"
      isLocked: boolean("is_locked").notNull().default(false),
      projectMarkupPercent: integer("project_markup_percent").default(0),
      // Percentage as integer (10 = 10%)
      taxRate: integer("tax_rate").default(10),
      // GST/Tax percentage (10 = 10%)
      notes: text("notes"),
      ownerId: varchar("owner_id").references(() => users.id),
      ownerName: text("owner_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertEstimateSchema = createInsertSchema(estimates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    estimateItems = pgTable("estimate_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      type: text("type").notNull().default("Material"),
      // "Material" | "Labour" | "Subcontractor" | "Fee"
      groupId: varchar("group_id").references(() => estimateGroups.id),
      // Reference to estimate groups
      parentItemId: varchar("parent_item_id").references(() => estimateItems.id, { onDelete: "cascade" }),
      // For sub-items (3-level nesting)
      costCode: text("cost_code"),
      // Reference to cost codes (will be created in settings)
      allowance: text("allowance").notNull().default("None"),
      // "None" | "Prime Cost" | "Provisional Sum"
      allowanceStatus: text("allowance_status").notNull().default("pending"),
      // "pending" | "in_progress" | "finalized"
      pcMarkupPercent: integer("pc_markup_percent"),
      // Markup % for PC items (separate from estimate markup)
      quantity: integer("quantity").notNull().default(1),
      unitType: text("unit_type").notNull().default("each"),
      // "each" | "m" | "m2" | etc (configurable)
      status: text("status").notNull().default("incomplete"),
      // "incomplete" | "not relevant" | "done" (configurable)
      unitCostExTax: integer("unit_cost_ex_tax").notNull().default(0),
      // Unit price in cents (renamed from priceExTax)
      markupPercent: integer("markup_percent"),
      // Optional item-specific markup percentage (10 = 10%). Falls back to project markup if null
      taxAmount: integer("tax_amount").notNull().default(0),
      // Calculated tax amount in cents
      priceIncTax: integer("price_inc_tax").notNull().default(0),
      // Total price in cents
      description: text("description"),
      notes: text("notes"),
      attachmentUrl: text("attachment_url"),
      // File attachment path/URL
      requestForQuote: boolean("request_for_quote").notNull().default(false),
      isSelection: boolean("is_selection").notNull().default(false),
      // Can link to Selections section
      proposalVisible: boolean("proposal_visible").notNull().default(true),
      // Show/hide in proposal (renamed from visibleInProposal)
      shownAs: text("shown_as"),
      // Custom text to display in proposal instead of item name
      trackLabourHours: boolean("track_labour_hours").notNull().default(false),
      // Include in labour hours budget tracking
      order: integer("order").notNull().default(0),
      // For sorting within groups
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertEstimateItemSchema = createInsertSchema(estimateItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      // Convert price fields to numbers for easier handling
      unitCostExTax: z.number().default(0),
      taxAmount: z.number().default(0),
      priceIncTax: z.number().default(0),
      markupPercent: z.number().optional().nullable(),
      shownAs: z.string().optional().nullable()
    });
    estimateGroups = pgTable("estimate_groups", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
      parentGroupId: varchar("parent_group_id").references(() => estimateGroups.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      description: text("description"),
      defaultCostCode: varchar("default_cost_code").references(() => costCodes.id, { onDelete: "set null" }),
      order: integer("order").notNull().default(0),
      isCollapsed: boolean("is_collapsed").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertEstimateGroupSchema = createInsertSchema(estimateGroups).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    companySettings = pgTable("company_settings", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyName: text("company_name"),
      email: text("email"),
      phone: text("phone"),
      website: text("website"),
      address: text("address"),
      logoUrl: text("logo_url"),
      // Path to uploaded logo file
      // Social Media Links
      facebook: text("facebook"),
      linkedin: text("linkedin"),
      twitter: text("twitter"),
      instagram: text("instagram"),
      googleMyBusiness: text("google_my_business"),
      yelp: text("yelp"),
      // System settings
      taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
      // Tax rate as percentage (e.g., 10.00 for 10%)
      // Timesheet defaults
      standardWorkStart: text("standard_work_start").default("07:00"),
      // Default work start time (e.g., "07:00")
      standardWorkEnd: text("standard_work_end").default("15:30"),
      // Default work end time (e.g., "15:30")
      // Proposal branding
      proposalPrimaryColor: text("proposal_primary_color").default("#3B82F6"),
      // Primary brand color for proposals
      proposalSecondaryColor: text("proposal_secondary_color").default("#10B981"),
      // Secondary color
      proposalFontFamily: text("proposal_font_family").default("Inter"),
      // Font family for proposals
      proposalHeaderText: text("proposal_header_text"),
      // Default header text for proposals
      proposalFooterText: text("proposal_footer_text"),
      // Default footer text for proposals
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCompanySettingsSchema = createInsertSchema(companySettings).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    systemConfiguration = pgTable("system_configuration", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      // Regional Settings
      language: text("language").notNull().default("en-AU"),
      // English (Australia)
      measurementSystem: text("measurement_system").notNull().default("metric"),
      // metric | imperial
      currency: text("currency").notNull().default("AUD"),
      // Australian Dollar
      currencySymbol: text("currency_symbol").notNull().default("$"),
      timezone: text("timezone").notNull().default("Australia/Sydney"),
      // Formatting
      temperatureFormat: text("temperature_format").notNull().default("celsius"),
      // celsius | fahrenheit
      dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
      // DD/MM/YYYY | MM/DD/YYYY | YYYY-MM-DD
      timeFormat: text("time_format").notNull().default("12h"),
      // 12h | 24h
      // Document Numbering Prefixes
      estimatePrefix: text("estimate_prefix").notNull().default("EST-"),
      variationPrefix: text("variation_prefix").notNull().default("VAR-"),
      clientInvoicePrefix: text("client_invoice_prefix").notNull().default("INV-"),
      billPrefix: text("bill_prefix").notNull().default("BILL-"),
      purchaseOrderPrefix: text("purchase_order_prefix").notNull().default("PO-"),
      rfqPrefix: text("rfq_prefix").notNull().default("RFQ-"),
      rfiPrefix: text("rfi_prefix").notNull().default("RFI-"),
      proposalPrefix: text("proposal_prefix").notNull().default("PROP-"),
      // Document Starting Numbers
      estimateStartNumber: integer("estimate_start_number").notNull().default(1e3),
      variationStartNumber: integer("variation_start_number").notNull().default(1e3),
      clientInvoiceStartNumber: integer("client_invoice_start_number").notNull().default(1e3),
      billStartNumber: integer("bill_start_number").notNull().default(1e3),
      purchaseOrderStartNumber: integer("purchase_order_start_number").notNull().default(1e3),
      rfqStartNumber: integer("rfq_start_number").notNull().default(1e3),
      rfiStartNumber: integer("rfi_start_number").notNull().default(1e3),
      proposalStartNumber: integer("proposal_start_number").notNull().default(1e3),
      // Business Settings
      gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("10.00"),
      // GST rate as percentage
      fiscalYearStart: text("fiscal_year_start").notNull().default("07-01"),
      // MM-DD format (July 1 for Australia)
      defaultPaymentTerms: text("default_payment_terms").notNull().default("Net 30"),
      // Net 30, Net 14, COD, etc.
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSystemConfigurationSchema = createInsertSchema(systemConfiguration).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    costCategories = pgTable("cost_categories", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      code: text("code").notNull(),
      // e.g., "001", "002", "5,000"
      title: text("title").notNull(),
      // e.g., "Preliminaries", "Site Services", "Finishing Trades"
      isActive: boolean("is_active").notNull().default(true),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCostCategorySchema = createInsertSchema(costCategories).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    costCodes = pgTable("cost_codes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      code: text("code").notNull(),
      // e.g., "FLRT", "100", "5,200"
      title: text("title").notNull(),
      // e.g., "Flat rate", "Preliminaries", "Interior Trim"
      categoryId: varchar("category_id").references(() => costCategories.id, { onDelete: "set null" }),
      // Nullable - can exist without category
      availableInTimesheets: boolean("available_in_timesheets").notNull().default(true),
      isSynced: boolean("is_synced").notNull().default(false),
      // Synced with Xero tracking category
      xeroTrackingCategoryId: text("xero_tracking_category_id"),
      // For future Xero integration
      isActive: boolean("is_active").notNull().default(true),
      isArchived: boolean("is_archived").notNull().default(false),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCostCodeSchema = createInsertSchema(costCodes).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    fieldCategories = pgTable("field_categories", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      key: text("key").notNull().unique(),
      // e.g., "task.status", "task.priority"
      label: text("label").notNull(),
      // Display name
      entity: text("entity").notNull(),
      // "task" | "note" | "project"
      description: text("description"),
      isBuiltIn: boolean("is_built_in").notNull().default(true),
      // System-defined categories
      isActive: boolean("is_active").notNull().default(true),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertFieldCategorySchema = createInsertSchema(fieldCategories).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    fieldOptions = pgTable("field_options", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      categoryId: varchar("category_id").notNull().references(() => fieldCategories.id, { onDelete: "cascade" }),
      parentId: varchar("parent_id").references(() => fieldOptions.id, { onDelete: "cascade" }),
      // For hierarchical options (e.g., project sub-statuses)
      key: text("key").notNull(),
      // Slug/identifier (e.g., "todo", "in_progress", "done")
      name: text("name").notNull(),
      // Display name (editable by user)
      color: text("color"),
      // Hex color code (e.g., "#3b82f6")
      isActive: boolean("is_active").notNull().default(true),
      isDefault: boolean("is_default").notNull().default(false),
      // Default selection for this category
      isCompleted: boolean("is_completed").notNull().default(false),
      // Marks this option as the "completed" status
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertFieldOptionSchema = createInsertSchema(fieldOptions).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    selections = pgTable("selections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // "Kitchen Splashback Tiles"
      category: text("category"),
      // "Tiles"
      room: text("room"),
      // "Kitchen"
      description: text("description"),
      status: text("status").notNull().default("draft"),
      // "draft" | "pending" | "approved" | "selected"
      deadline: timestamp("deadline"),
      allowance: integer("allowance"),
      // Budget allowance in cents
      clientCanChange: boolean("client_can_change").notNull().default(true),
      clientCanSeePrice: boolean("client_can_see_price").notNull().default(false),
      createdBy: varchar("created_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSelectionSchema = createInsertSchema(selections).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    selectionOptions = pgTable("selection_options", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      selectionId: varchar("selection_id").notNull().references(() => selections.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // "Zellige Lily"
      description: text("description"),
      sku: text("sku"),
      // Product code/SKU
      brand: text("brand"),
      // Manufacturer/brand
      category: text("category"),
      // "Concept Tile & Timber"
      subcategory: text("subcategory"),
      unitCost: integer("unit_cost"),
      // Cost in cents
      unitTax: integer("unit_tax"),
      // Tax in cents
      gstInclusive: boolean("gst_inclusive").notNull().default(false),
      // Whether unit cost includes GST
      markupPercent: integer("markup_percent"),
      // Markup percentage
      totalCost: integer("total_cost"),
      // Final cost in cents
      quantity: integer("quantity").notNull().default(1),
      unitType: text("unit_type").notNull().default("ea"),
      // "m2", "linear_m", "ea", etc.
      url: text("url"),
      // Product URL
      visibleToClient: boolean("visible_to_client").notNull().default(true),
      isSelectedByClient: boolean("is_selected_by_client").notNull().default(false),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSelectionOptionSchema = createInsertSchema(selectionOptions).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    optionAttachments = pgTable("option_attachments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      optionId: varchar("option_id").notNull().references(() => selectionOptions.id, { onDelete: "cascade" }),
      fileName: text("file_name").notNull(),
      filePath: text("file_path").notNull(),
      fileType: text("file_type").notNull(),
      // "image", "document", "specification"
      fileSize: integer("file_size"),
      // File size in bytes
      mimeType: text("mime_type"),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertOptionAttachmentSchema = createInsertSchema(optionAttachments).omit({
      id: true,
      createdAt: true
    });
    clientSelections = pgTable("client_selections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      selectionId: varchar("selection_id").notNull().references(() => selections.id, { onDelete: "cascade" }),
      optionId: varchar("option_id").notNull().references(() => selectionOptions.id, { onDelete: "cascade" }),
      clientId: varchar("client_id").references(() => users.id),
      notes: text("notes"),
      // Client notes about their selection
      selectedAt: timestamp("selected_at").notNull().defaultNow()
    });
    insertClientSelectionSchema = createInsertSchema(clientSelections).omit({
      id: true,
      selectedAt: true
    });
    billTypeEnum = pgEnum("bill_type", ["bill", "credit"]);
    billStatusEnum = pgEnum("bill_status", ["draft", "awaiting_approval", "awaiting_payment", "paid"]);
    billLineTypeEnum = pgEnum("bill_line_type", ["estimate", "item", "custom"]);
    billApprovalStatusEnum = pgEnum("bill_approval_status", ["approved", "rejected"]);
    taxTypeEnum = pgEnum("tax_type", ["GST on expenses", "No GST"]);
    suppliers = pgTable("suppliers", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      email: text("email"),
      phone: text("phone"),
      abn: text("abn"),
      // Australian Business Number
      address: text("address"),
      xeroContactId: text("xero_contact_id"),
      // For Xero integration linking
      color: text("color").default("#bba7db"),
      // Gantt bar color, default lilac
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSupplierSchema = createInsertSchema(suppliers).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    contactTypeEnum = pgEnum("contact_type", ["team", "supplier", "client"]);
    primaryContactEnum = pgEnum("primary_contact", ["self", "spouse"]);
    contacts = pgTable("contacts", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      // Full name (computed from firstName + lastName for display)
      firstName: text("first_name"),
      lastName: text("last_name"),
      email: text("email"),
      phone: text("phone"),
      mobile: text("mobile"),
      company: text("company"),
      position: text("position"),
      contactType: contactTypeEnum("contact_type").notNull(),
      // Client-specific spouse fields
      spouseName: text("spouse_name"),
      spousePhone: text("spouse_phone"),
      spouseEmail: text("spouse_email"),
      primaryContact: primaryContactEnum("primary_contact"),
      // Business fields (for suppliers)
      abn: text("abn"),
      // Australian Business Number
      businessNumber: text("business_number"),
      // ACN or other business registration
      address: text("address"),
      // Legacy field - kept for backward compatibility
      // Structured address fields (for Google Maps integration)
      addressStreet: text("address_street"),
      addressCity: text("address_city"),
      addressState: text("address_state"),
      addressPostcode: text("address_postcode"),
      addressCountry: text("address_country").default("Australia"),
      addressLat: numeric("address_lat", { precision: 10, scale: 7 }),
      // Latitude for mapping
      addressLng: numeric("address_lng", { precision: 10, scale: 7 }),
      // Longitude for mapping
      addressFormatted: text("address_formatted"),
      // Full formatted address from Google
      paymentTerms: text("payment_terms"),
      // e.g., "Net 30", "COD", "EOM"
      defaultCostCodeId: varchar("default_cost_code_id").references(() => costCodes.id),
      // Employment fields (for team)
      role: text("role"),
      // Job title/role
      hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
      // Cost to company per hour
      hourlyPrice: numeric("hourly_price", { precision: 10, scale: 2 }),
      // Billable rate per hour
      // General fields
      notes: text("notes"),
      labels: json("labels").default([]),
      // Array of string tags
      projectIds: json("project_ids").default([]),
      // Array of associated project IDs
      avatarColor: text("avatar_color"),
      // Hex color for avatar background
      scheduleColor: text("schedule_color"),
      // Hex color for trade/supplier color-coding in schedules
      // Portal access (for clients - future feature)
      portalEnabled: boolean("portal_enabled").notNull().default(false),
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertContactSchema = createInsertSchema(contacts).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      contactType: z.enum(["team", "supplier", "client"]),
      email: z.string().email().optional().or(z.literal("")),
      spouseEmail: z.string().email().optional().or(z.literal("")),
      hourlyRate: z.string().optional().or(z.literal("")),
      hourlyPrice: z.string().optional().or(z.literal("")),
      labels: z.array(z.string()).optional(),
      projectIds: z.array(z.string()).optional(),
      primaryContact: z.enum(["self", "spouse"]).optional()
    });
    bills = pgTable("bills", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billNumber: text("bill_number").notNull().unique(),
      // Auto-generated unique number
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      supplierId: varchar("supplier_id").notNull().references(() => suppliers.id),
      billType: billTypeEnum("bill_type").notNull().default("bill"),
      status: billStatusEnum("status").notNull().default("draft"),
      billDate: timestamp("bill_date").notNull(),
      dueDate: timestamp("due_date"),
      billReference: text("bill_reference"),
      // Supplier's invoice/reference number
      notes: text("notes"),
      reminders: text("reminders"),
      subtotal: integer("subtotal").notNull().default(0),
      // Amount in cents
      tax: integer("tax").notNull().default(0),
      // Tax amount in cents
      total: integer("total").notNull().default(0),
      // Total amount in cents
      paidAmount: integer("paid_amount").notNull().default(0),
      // Paid amount in cents
      sendToXero: boolean("send_to_xero").notNull().default(false),
      // Checkbox for Xero sync
      xeroInvoiceId: text("xero_invoice_id"),
      // Xero bill ID
      xeroPaidStatus: text("xero_paid_status"),
      // Synced from Xero
      attachmentUrls: json("attachment_urls").default([]),
      // Array of PDF/image URLs
      ocrProcessed: boolean("ocr_processed").notNull().default(false),
      ocrData: json("ocr_data"),
      // Raw OCR results
      createdById: varchar("created_by_id").notNull().references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertBillSchema = createInsertSchema(bills).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      billType: z.enum(["bill", "credit"]),
      status: z.enum(["draft", "awaiting_approval", "awaiting_payment", "paid"]),
      billDate: z.coerce.date(),
      dueDate: z.coerce.date().optional(),
      subtotal: z.number().default(0),
      tax: z.number().default(0),
      total: z.number().default(0),
      paidAmount: z.number().default(0),
      attachmentUrls: z.array(z.string()).optional()
    });
    billLineItems = pgTable("bill_line_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      lineType: billLineTypeEnum("line_type").notNull().default("custom"),
      description: text("description").notNull(),
      costCodeId: varchar("cost_code_id").references(() => costCodes.id),
      quantity: integer("quantity").notNull().default(1),
      unitPrice: integer("unit_price").notNull().default(0),
      // Price in cents
      tax: taxTypeEnum("tax").notNull().default("GST on expenses"),
      account: text("account"),
      // Xero account code
      total: integer("total").notNull().default(0),
      // Total in cents
      order: integer("order").notNull().default(0),
      // For sorting
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertBillLineItemSchema = createInsertSchema(billLineItems).omit({
      id: true,
      createdAt: true
    }).extend({
      lineType: z.enum(["estimate", "item", "custom"]),
      tax: z.enum(["GST on expenses", "No GST"]),
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      total: z.number().default(0),
      order: z.number().default(0)
    });
    billApprovals = pgTable("bill_approvals", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      approvedById: varchar("approved_by_id").notNull().references(() => users.id),
      status: billApprovalStatusEnum("status").notNull(),
      comments: text("comments"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertBillApprovalSchema = createInsertSchema(billApprovals).omit({
      id: true,
      createdAt: true
    }).extend({
      status: z.enum(["approved", "rejected"])
    });
    billLineItemAllowances = pgTable("bill_line_item_allowances", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      billLineItemId: varchar("bill_line_item_id").notNull().references(() => billLineItems.id, { onDelete: "cascade" }),
      estimateItemId: varchar("estimate_item_id").notNull().references(() => estimateItems.id, { onDelete: "cascade" }),
      // The allowance (PC/PS item)
      amount: integer("amount").notNull().default(0),
      // Amount allocated to this allowance in cents
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertBillLineItemAllowanceSchema = createInsertSchema(billLineItemAllowances).omit({
      id: true,
      createdAt: true
    }).extend({
      amount: z.number().default(0)
    });
    timesheetAllowances = pgTable("timesheet_allowances", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      timesheetId: varchar("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
      estimateItemId: varchar("estimate_item_id").notNull().references(() => estimateItems.id, { onDelete: "cascade" }),
      // The PS allowance
      hours: numeric("hours", { precision: 10, scale: 2 }).notNull().default("0"),
      // Hours allocated to this PS allowance
      amount: integer("amount").notNull().default(0),
      // Amount allocated (hours * rate) in cents
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertTimesheetAllowanceSchema = createInsertSchema(timesheetAllowances).omit({
      id: true,
      createdAt: true
    }).extend({
      hours: z.string().default("0"),
      amount: z.number().default(0)
    });
    allowanceItems = pgTable("allowance_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      estimateItemId: varchar("estimate_item_id").notNull().references(() => estimateItems.id, { onDelete: "cascade" }),
      // The PS allowance
      description: text("description").notNull(),
      quantity: integer("quantity").notNull().default(1),
      unitPrice: integer("unit_price").notNull().default(0),
      // Price in cents
      totalPrice: integer("total_price").notNull().default(0),
      // Total price in cents
      sortOrder: integer("sort_order").notNull().default(0),
      // For ordering
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertAllowanceItemSchema = createInsertSchema(allowanceItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      totalPrice: z.number().default(0),
      sortOrder: z.number().default(0)
    });
    xeroConnections = pgTable("xero_connections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").references(() => projects.id),
      // Nullable for global connection
      tenantId: text("tenant_id").notNull(),
      // Xero organization ID
      tenantName: text("tenant_name").notNull(),
      accessToken: text("access_token").notNull(),
      refreshToken: text("refresh_token").notNull(),
      tokenExpiresAt: timestamp("token_expires_at").notNull(),
      trackingCategory1Name: text("tracking_category_1_name"),
      // For job/project
      trackingCategory2Name: text("tracking_category_2_name"),
      // For cost code
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertXeroConnectionSchema = createInsertSchema(xeroConnections).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      tokenExpiresAt: z.coerce.date()
    });
    variations = pgTable("variations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      variationNumber: text("variation_number").notNull(),
      // Auto-generated format like "4501-VO-017"
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      introductionText: text("introduction_text"),
      closingText: text("closing_text"),
      approvalDeadline: timestamp("approval_deadline"),
      daysChanged: integer("days_changed"),
      subtotal: integer("subtotal").notNull().default(0),
      // Amount in cents
      gstAmount: integer("gst_amount").notNull().default(0),
      // GST amount in cents
      totalAmount: integer("total_amount").notNull().default(0),
      // Total amount in cents
      paidAmount: integer("paid_amount").notNull().default(0),
      // Paid amount in cents
      balanceAmount: integer("balance_amount").notNull().default(0),
      // Balance amount in cents
      status: text("status").notNull().default("draft"),
      // "draft" | "action" | "pending" | "approved" | "rejected"
      relatedTo: text("related_to"),
      // Reference to related item
      approvedBy: varchar("approved_by").references(() => users.id),
      approvedDate: timestamp("approved_date"),
      rejectionReason: text("rejection_reason"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertVariationSchema = createInsertSchema(variations).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      status: z.enum(["draft", "action", "pending", "approved", "rejected"]).default("draft"),
      approvalDeadline: z.coerce.date().optional(),
      approvedDate: z.coerce.date().optional(),
      subtotal: z.number().default(0),
      gstAmount: z.number().default(0),
      totalAmount: z.number().default(0),
      paidAmount: z.number().default(0),
      balanceAmount: z.number().default(0)
    });
    variationItems = pgTable("variation_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      variationId: varchar("variation_id").notNull().references(() => variations.id, { onDelete: "cascade" }),
      description: text("description").notNull(),
      quantity: integer("quantity").notNull().default(1),
      unitPrice: integer("unit_price").notNull().default(0),
      // Price in cents
      totalPrice: integer("total_price").notNull().default(0),
      // Total price in cents
      taxable: boolean("taxable").notNull().default(true),
      // For GST calculation
      sortOrder: integer("sort_order").notNull().default(0),
      // For ordering
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertVariationItemSchema = createInsertSchema(variationItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      totalPrice: z.number().default(0),
      sortOrder: z.number().default(0)
    });
    clientInvoices = pgTable("client_invoices", {
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
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertClientInvoiceSchema = createInsertSchema(clientInvoices).omit({
      id: true,
      createdAt: true,
      updatedAt: true
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
      balanceAmount: z.number().default(0)
    });
    clientInvoiceItems = pgTable("client_invoice_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      description: text("description").notNull(),
      quantity: integer("quantity").notNull().default(1),
      unitPrice: integer("unit_price").notNull().default(0),
      totalPrice: integer("total_price").notNull().default(0),
      taxable: boolean("taxable").notNull().default(true),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertClientInvoiceItemSchema = createInsertSchema(clientInvoiceItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      totalPrice: z.number().default(0),
      sortOrder: z.number().default(0)
    });
    clientInvoicePayments = pgTable("client_invoice_payments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      amount: integer("amount").notNull(),
      paymentDate: timestamp("payment_date").notNull(),
      paymentMethod: text("payment_method"),
      reference: text("reference"),
      notes: text("notes"),
      recordedBy: varchar("recorded_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertClientInvoicePaymentSchema = createInsertSchema(clientInvoicePayments).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      amount: z.number(),
      paymentDate: z.coerce.date()
    });
    invoiceEstimates = pgTable("invoice_estimates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      estimateId: varchar("estimate_id").notNull().references(() => estimates.id, { onDelete: "cascade" }),
      progressPercent: integer("progress_percent"),
      // Progress percentage 0-100
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInvoiceEstimateSchema = createInsertSchema(invoiceEstimates).omit({
      id: true,
      createdAt: true
    }).extend({
      progressPercent: z.number().int().min(0).max(100).optional()
    });
    invoiceVariations = pgTable("invoice_variations", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      variationId: varchar("variation_id").notNull().references(() => variations.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInvoiceVariationSchema = createInsertSchema(invoiceVariations).omit({
      id: true,
      createdAt: true
    });
    invoiceAllowances = pgTable("invoice_allowances", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      allowanceId: varchar("allowance_id").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInvoiceAllowanceSchema = createInsertSchema(invoiceAllowances).omit({
      id: true,
      createdAt: true
    });
    invoiceBills = pgTable("invoice_bills", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      billId: varchar("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInvoiceBillSchema = createInsertSchema(invoiceBills).omit({
      id: true,
      createdAt: true
    });
    invoiceTimesheets = pgTable("invoice_timesheets", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      invoiceId: varchar("invoice_id").notNull().references(() => clientInvoices.id, { onDelete: "cascade" }),
      timesheetId: varchar("timesheet_id").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertInvoiceTimesheetSchema = createInsertSchema(invoiceTimesheets).omit({
      id: true,
      createdAt: true
    });
    proposals = pgTable("proposals", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      proposalNumber: text("proposal_number").notNull().unique(),
      name: text("name").notNull(),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      estimateId: varchar("estimate_id").references(() => estimates.id),
      // Source estimate
      clientId: varchar("client_id").references(() => users.id),
      // Content and presentation
      introductionText: text("introduction_text"),
      closingText: text("closing_text"),
      termsAndConditions: text("terms_and_conditions"),
      // Pricing
      subtotal: integer("subtotal").notNull().default(0),
      gstAmount: integer("gst_amount").notNull().default(0),
      totalAmount: integer("total_amount").notNull().default(0),
      // Status and workflow
      status: text("status").notNull().default("draft"),
      // "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired"
      expiryDate: timestamp("expiry_date"),
      sentDate: timestamp("sent_date"),
      viewedDate: timestamp("viewed_date"),
      // When client first viewed it
      // Acceptance tracking
      acceptedDate: timestamp("accepted_date"),
      acceptedBy: varchar("accepted_by").references(() => users.id),
      acceptedByName: text("accepted_by_name"),
      acceptedByEmail: text("accepted_by_email"),
      signature: text("signature"),
      // Base64 encoded signature image or signature text
      // Rejection tracking
      rejectedDate: timestamp("rejected_date"),
      rejectionReason: text("rejection_reason"),
      // Conversion tracking
      convertedToInvoiceId: varchar("converted_to_invoice_id").references(() => clientInvoices.id),
      convertedDate: timestamp("converted_date"),
      // Display options
      showPricing: boolean("show_pricing").notNull().default(true),
      // Show/hide prices to client
      allowClientOptions: boolean("allow_client_options").notNull().default(false),
      // Allow client to select from alternatives
      // Audit
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      notes: text("notes"),
      // Internal notes, not visible to client
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertProposalSchema = createInsertSchema(proposals).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      status: z.enum(["draft", "sent", "viewed", "accepted", "rejected", "expired"]).default("draft"),
      subtotal: z.number().default(0),
      gstAmount: z.number().default(0),
      totalAmount: z.number().default(0),
      expiryDate: z.coerce.date().optional(),
      sentDate: z.coerce.date().optional(),
      viewedDate: z.coerce.date().optional(),
      acceptedDate: z.coerce.date().optional(),
      rejectedDate: z.coerce.date().optional(),
      convertedDate: z.coerce.date().optional()
    });
    proposalSections = pgTable("proposal_sections", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      description: text("description"),
      descriptionHtml: text("description_html"),
      // Rich text description
      order: integer("order").notNull().default(0),
      isCollapsed: boolean("is_collapsed").notNull().default(false),
      isEnabled: boolean("is_enabled").notNull().default(true),
      // PDF Builder fields
      sectionType: text("section_type").notNull().default("custom"),
      // 'cover_page', 'cover_letter', 'estimate', 'summary', 'allowances', 'closing_letter', 'attachments', 'terms_conditions', 'signature', 'custom'
      templateId: varchar("template_id"),
      // Reference to section template
      content: jsonb("content"),
      // Flexible JSON content for section data
      // Section-level pricing visibility
      showPricing: boolean("show_pricing").notNull().default(true),
      showSubtotal: boolean("show_subtotal").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertProposalSectionSchema = createInsertSchema(proposalSections).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    proposalItems = pgTable("proposal_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
      sectionId: varchar("section_id").references(() => proposalSections.id, { onDelete: "set null" }),
      estimateItemId: varchar("estimate_item_id").references(() => estimateItems.id),
      // Source estimate item if imported
      // Item details
      name: text("name").notNull(),
      description: text("description"),
      descriptionHtml: text("description_html"),
      // Rich text description
      quantity: integer("quantity").notNull().default(1),
      unitType: text("unit_type").notNull().default("each"),
      unitPrice: integer("unit_price").notNull().default(0),
      // Price in cents
      totalPrice: integer("total_price").notNull().default(0),
      // Total in cents
      taxable: boolean("taxable").notNull().default(true),
      // Display options
      showInProposal: boolean("show_in_proposal").notNull().default(true),
      showPricing: boolean("show_pricing").notNull().default(true),
      // Override section/proposal setting
      // Client options (for alternative selections)
      isOptional: boolean("is_optional").notNull().default(false),
      // Client can choose to include/exclude
      isAlternative: boolean("is_alternative").notNull().default(false),
      // Part of an alternative group
      alternativeGroupId: varchar("alternative_group_id"),
      // Group ID for alternatives
      isClientSelected: boolean("is_client_selected"),
      // True if client selected this option
      // Attachments and images
      attachments: json("attachments").default([]),
      // Array of attachment objects
      imageUrl: text("image_url"),
      // Optional product/item image
      order: integer("order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertProposalItemSchema = createInsertSchema(proposalItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      quantity: z.number().default(1),
      unitPrice: z.number().default(0),
      totalPrice: z.number().default(0),
      attachments: z.array(z.object({
        url: z.string(),
        name: z.string(),
        type: z.string().optional(),
        size: z.number().optional()
      })).optional()
    });
    proposalAcceptances = pgTable("proposal_acceptances", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      proposalId: varchar("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
      // Signer information
      signedBy: varchar("signed_by").references(() => users.id),
      signedByName: text("signed_by_name").notNull(),
      signedByEmail: text("signed_by_email").notNull(),
      signedByRole: text("signed_by_role"),
      // "client" | "contractor" | "project_manager" etc.
      // Acceptance/Rejection
      status: text("status").notNull(),
      // "accepted" | "rejected"
      signature: text("signature"),
      // Base64 encoded signature image or typed name
      signatureMethod: text("signature_method"),
      // "drawn" | "typed" | "uploaded"
      ipAddress: text("ip_address"),
      // IP address of signer for legal purposes
      userAgent: text("user_agent"),
      // Browser/device info
      // Selected options (for proposals with client choices)
      selectedItemIds: json("selected_item_ids").default([]),
      // Array of proposal_item IDs client selected
      // Rejection details
      rejectionReason: text("rejection_reason"),
      comments: text("comments"),
      // Timestamps
      signedAt: timestamp("signed_at").notNull().defaultNow(),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertProposalAcceptanceSchema = createInsertSchema(proposalAcceptances).omit({
      id: true,
      createdAt: true
    }).extend({
      status: z.enum(["accepted", "rejected"]),
      signatureMethod: z.enum(["drawn", "typed", "uploaded"]).optional(),
      selectedItemIds: z.array(z.string()).optional(),
      signedAt: z.coerce.date().optional()
    });
    activities = pgTable("activities", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      userId: varchar("user_id").references(() => users.id),
      userName: text("user_name"),
      activityType: text("activity_type").notNull(),
      // "task", "estimate", "bill", "variation", "invoice", "proposal", etc.
      action: text("action").notNull(),
      // "created", "updated", "deleted", "status_changed", "approved", "accepted", etc.
      description: text("description").notNull(),
      entityId: varchar("entity_id"),
      // ID of the related entity (task, estimate, etc.)
      entityName: text("entity_name"),
      // Name/title of the entity
      metadata: json("metadata"),
      // Additional data about the activity (e.g., old/new values)
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertActivitySchema = createInsertSchema(activities).omit({
      id: true,
      createdAt: true
    }).extend({
      activityType: z.enum(["task", "estimate", "bill", "variation", "invoice", "proposal", "project", "site_diary", "other"]),
      action: z.enum(["created", "updated", "completed", "deleted", "status_changed", "approved", "rejected", "accepted", "submitted", "paid"])
    });
    siteDiaryTemplates = pgTable("site_diary_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      fields: json("fields").notNull().default([]),
      // Array of field definitions: [{id, title, type, required, options, order}]
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSiteDiaryTemplateSchema = createInsertSchema(siteDiaryTemplates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      fields: z.array(z.object({
        id: z.string(),
        title: z.string(),
        type: z.enum(["text", "textarea", "number", "date", "select", "checkbox", "file", "photo-gallery"]),
        required: z.boolean().optional(),
        options: z.array(z.object({
          label: z.string(),
          value: z.string()
        })).optional(),
        order: z.number(),
        maxPhotos: z.number().optional()
      }))
    });
    siteDiaryEntries = pgTable("site_diary_entries", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      templateId: varchar("template_id").notNull().references(() => siteDiaryTemplates.id),
      templateName: text("template_name"),
      // Cached for display
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      entryDateTime: timestamp("entry_date_time").notNull(),
      groupId: varchar("group_id"),
      // Optional grouping/category
      notifyUserIds: json("notify_user_ids").default([]),
      // Array of user IDs to notify
      fieldValues: json("field_values").notNull().default({}),
      // Object keyed by fieldId with values
      attachments: json("attachments").default([]),
      // Array of attachment URLs for field items
      overallPhotos: json("overall_photos").default([]),
      // Unlimited photos at bottom
      weather: json("weather"),
      // Weather data: {temp, condition, humidity, wind, etc}
      labels: json("labels").default([]),
      // Array of label strings
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      shareWithClient: boolean("share_with_client").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSiteDiaryEntrySchema = createInsertSchema(siteDiaryEntries).omit({
      id: true,
      createdAt: true,
      updatedAt: true
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
        icon: z.string().optional()
      }).optional(),
      labels: z.array(z.string()).optional()
    });
    checklistTemplates = pgTable("checklist_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      type: text("type").notNull(),
      // "Task" | "Job" | "Estimation" | "Lead"
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertChecklistTemplateSchema = createInsertSchema(checklistTemplates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      type: z.enum(["Task", "Job", "Estimation", "Lead"])
    });
    checklistTemplateGroups = pgTable("checklist_template_groups", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      templateId: varchar("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      order: integer("order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertChecklistTemplateGroupSchema = createInsertSchema(checklistTemplateGroups).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    checklistTemplateItems = pgTable("checklist_template_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      groupId: varchar("group_id").notNull().references(() => checklistTemplateGroups.id, { onDelete: "cascade" }),
      description: text("description").notNull(),
      // The main task description
      tooltip: text("tooltip"),
      // Additional description/notes shown underneath
      order: integer("order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertChecklistTemplateItemSchema = createInsertSchema(checklistTemplateItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    budgets = pgTable("budgets", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
      // One budget per project
      name: text("name").notNull().default("Project Budget"),
      baselineAmount: integer("baseline_amount").notNull().default(0),
      // Original budget in cents (from estimates)
      revisedAmount: integer("revised_amount").notNull().default(0),
      // Current budget after variations in cents
      actualAmount: integer("actual_amount").notNull().default(0),
      // Actual spent in cents (from bills)
      forecastAmount: integer("forecast_amount").notNull().default(0),
      // Projected final cost in cents
      varianceAmount: integer("variance_amount").notNull().default(0),
      // Difference between revised and forecast in cents
      profitAmount: integer("profit_amount").notNull().default(0),
      // Estimated profit in cents
      profitPercent: integer("profit_percent").notNull().default(0),
      // Profit percentage (10 = 10%)
      status: text("status").notNull().default("active"),
      // "active" | "completed" | "on_hold"
      notes: text("notes"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertBudgetSchema = createInsertSchema(budgets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      baselineAmount: z.number().default(0),
      revisedAmount: z.number().default(0),
      actualAmount: z.number().default(0),
      forecastAmount: z.number().default(0),
      varianceAmount: z.number().default(0),
      profitAmount: z.number().default(0),
      profitPercent: z.number().default(0),
      status: z.enum(["active", "completed", "on_hold"]).default("active")
    });
    updateBudgetSchema = insertBudgetSchema.partial();
    budgetLineItems = pgTable("budget_line_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      budgetId: varchar("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
      costCodeId: varchar("cost_code_id").references(() => costCodes.id, { onDelete: "set null" }),
      // Nullable - can be uncategorized
      costCodeTitle: text("cost_code_title"),
      // Cached for performance
      categoryTitle: text("category_title"),
      // Cached category name for grouping
      budgetedAmount: integer("budgeted_amount").notNull().default(0),
      // Budgeted amount in cents (from estimates)
      actualAmount: integer("actual_amount").notNull().default(0),
      // Actual spent in cents (from bills)
      variationAmount: integer("variation_amount").notNull().default(0),
      // Variation adjustments in cents
      forecastAmount: integer("forecast_amount").notNull().default(0),
      // Projected final cost in cents
      variance: integer("variance").notNull().default(0),
      // Difference between budgeted and forecast in cents
      variancePercent: integer("variance_percent").notNull().default(0),
      // Variance as percentage (10 = 10%)
      profitAmount: integer("profit_amount").notNull().default(0),
      // Profit on this cost code in cents
      notes: text("notes"),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertBudgetLineItemSchema = createInsertSchema(budgetLineItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      budgetedAmount: z.number().default(0),
      actualAmount: z.number().default(0),
      variationAmount: z.number().default(0),
      forecastAmount: z.number().default(0),
      variance: z.number().default(0),
      variancePercent: z.number().default(0),
      profitAmount: z.number().default(0),
      sortOrder: z.number().default(0)
    });
    updateBudgetLineItemSchema = insertBudgetLineItemSchema.partial();
    labourHoursBudget = pgTable("labour_hours_budget", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      costCodeId: varchar("cost_code_id").references(() => costCodes.id, { onDelete: "set null" }),
      costCodeTitle: text("cost_code_title"),
      // Cached for performance
      categoryTitle: text("category_title"),
      // Cached category name
      budgetedHours: numeric("budgeted_hours", { precision: 10, scale: 2 }).notNull().default("0"),
      // From flagged estimate items (rounded to 0.25)
      pendingHours: numeric("pending_hours", { precision: 10, scale: 2 }).notNull().default("0"),
      // From unapproved timesheets
      approvedHours: numeric("approved_hours", { precision: 10, scale: 2 }).notNull().default("0"),
      // From approved timesheets
      notes: text("notes"),
      sortOrder: integer("sort_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertLabourHoursBudgetSchema = createInsertSchema(labourHoursBudget).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      budgetedHours: z.number().default(0),
      pendingHours: z.number().default(0),
      approvedHours: z.number().default(0),
      sortOrder: z.number().default(0)
    });
    timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "submitted", "approved", "rejected"]);
    timesheets = pgTable("timesheets", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      date: timestamp("date").notNull(),
      startTime: text("start_time"),
      // HH:mm format, nullable
      endTime: text("end_time"),
      // HH:mm format, nullable
      duration: numeric("duration", { precision: 10, scale: 2 }).notNull().default("0"),
      // In hours (e.g., 8.5)
      breakDuration: numeric("break_duration", { precision: 10, scale: 2 }).notNull().default("0"),
      // In hours
      description: text("description"),
      status: timesheetStatusEnum("status").notNull().default("draft"),
      hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0"),
      total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
      // duration × hourlyRate
      invoiced: boolean("invoiced").notNull().default(false),
      workItemId: varchar("work_item_id").references(() => estimateItems.id, { onDelete: "set null" }),
      // Optional link to labour estimate item
      isActive: boolean("is_active").notNull().default(false),
      // True when timer is running
      clockInTime: timestamp("clock_in_time"),
      // Actual timestamp when clocked in (for real-time calculation)
      costCodeId: varchar("cost_code_id").references(() => costCodes.id, { onDelete: "set null" }),
      // Cost code for clock-in widget
      attachments: json("attachments").default([]),
      // Array of attachment URLs
      labels: json("labels").default([]),
      // Array of label strings
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    timesheetCostCodes = pgTable("timesheet_cost_codes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      timesheetId: varchar("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
      costCodeId: varchar("cost_code_id").notNull().references(() => costCodes.id, { onDelete: "cascade" }),
      duration: numeric("duration", { precision: 10, scale: 2 }).notNull(),
      // Hours allocated to this cost code
      hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }).notNull().default("0"),
      total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
      // duration × hourlyRate
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertTimesheetSchema = createInsertSchema(timesheets).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      duration: z.number().min(0),
      breakDuration: z.number().min(0).default(0),
      hourlyRate: z.number().min(0).default(0),
      total: z.number().min(0).default(0),
      status: z.enum(["draft", "submitted", "approved", "rejected"]).default("draft"),
      invoiced: z.boolean().default(false)
    });
    insertTimesheetCostCodeSchema = createInsertSchema(timesheetCostCodes).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      duration: z.number().min(0),
      hourlyRate: z.number().min(0).default(0),
      total: z.number().min(0).default(0)
    });
    schedules = pgTable("schedules", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }).unique(),
      // One schedule per project
      name: text("name").notNull().default("Project Schedule"),
      status: text("status").notNull().default("offline"),
      // "offline" | "online" | "locked"
      description: text("description"),
      startDate: timestamp("start_date"),
      endDate: timestamp("end_date"),
      notes: text("notes"),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      lockedBy: varchar("locked_by").references(() => users.id),
      // Who locked it
      lockedByName: text("locked_by_name"),
      // Name of who locked it
      lockedAt: timestamp("locked_at"),
      // When it was locked
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScheduleSchema = createInsertSchema(schedules).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      status: z.enum(["offline", "online", "locked"]).default("offline"),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      lockedAt: z.coerce.date().optional()
    });
    scheduleItems = pgTable("schedule_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      scheduleId: varchar("schedule_id").notNull().references(() => schedules.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      description: text("description"),
      type: text("type").notNull().default("task"),
      // "task" | "milestone" | "inspection" | "delivery" | "meeting"
      status: text("status").notNull().default("not_started"),
      // "not_started" | "in_progress" | "completed" | "on_hold" | "cancelled"
      priority: text("priority").default("medium"),
      // "low" | "medium" | "high" | "urgent"
      // Date and duration
      startDate: timestamp("start_date").notNull(),
      endDate: timestamp("end_date").notNull(),
      startTime: text("start_time"),
      // Optional time in HH:MM format (e.g., "09:00", "14:30")
      endTime: text("end_time"),
      // Optional time in HH:MM format
      duration: integer("duration").notNull().default(1),
      // Duration in days
      actualStartDate: timestamp("actual_start_date"),
      actualEndDate: timestamp("actual_end_date"),
      // Assignment and responsibility
      assignedToId: varchar("assigned_to_id").references(() => contacts.id),
      // Contact/supplier assigned
      assignedToName: text("assigned_to_name"),
      // Cached for performance
      assignedToColor: text("assigned_to_color"),
      // Color from contact's scheduleColor
      // Organization
      groupId: varchar("group_id"),
      // For grouping items (phases, stages)
      groupName: text("group_name"),
      costCodeId: varchar("cost_code_id").references(() => costCodes.id),
      // Link to cost code
      costCodeTitle: text("cost_code_title"),
      // Cached for performance
      // Dependencies - array of objects: [{id: string, type: "FS" | "SS" | "FF" | "SF"}]
      // FS = Finish-to-Start (default), SS = Start-to-Start, FF = Finish-to-Finish, SF = Start-to-Finish
      dependencies: json("dependencies").default([]),
      // Array of dependency objects
      predecessorIds: json("predecessor_ids").default([]),
      // Legacy: Array of schedule item IDs that must complete first
      // Progress and completion
      progressPercent: integer("progress_percent").notNull().default(0),
      // 0-100
      completedAt: timestamp("completed_at"),
      // Rich content
      notes: text("notes"),
      notesHtml: text("notes_html"),
      // Rich text notes
      checklistIds: json("checklist_ids").default([]),
      // Array of checklist template IDs linked
      taskIds: json("task_ids").default([]),
      // Array of task IDs linked
      attachments: json("attachments").default([]),
      // Array of attachment objects [{url, name, type}]
      // Site diary integration
      siteDiaryEntryIds: json("site_diary_entry_ids").default([]),
      // Linked site diary entries
      // Hierarchy (for nesting items as stages/subtasks in Gantt view)
      parentItemId: varchar("parent_item_id").references(() => scheduleItems.id, { onDelete: "cascade" }),
      // Baseline tracking (for Gantt timeline comparison)
      baselineStartDate: timestamp("baseline_start_date"),
      baselineEndDate: timestamp("baseline_end_date"),
      // Display
      color: text("color"),
      // Custom color override
      sortOrder: integer("sort_order").notNull().default(0),
      isCollapsed: boolean("is_collapsed").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScheduleItemSchema = createInsertSchema(scheduleItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      type: z.enum(["task", "milestone", "inspection", "delivery", "meeting"]).default("task"),
      status: z.enum(["not_started", "in_progress", "completed", "on_hold", "cancelled"]).default("not_started"),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      actualStartDate: z.coerce.date().optional(),
      actualEndDate: z.coerce.date().optional(),
      completedAt: z.coerce.date().optional(),
      duration: z.number().default(1),
      progressPercent: z.number().int().min(0).max(100).default(0),
      dependencies: z.array(z.object({
        id: z.string(),
        // ID of the predecessor item
        type: z.enum(["FS", "SS", "FF", "SF"]).default("FS")
        // Dependency type
      })).optional(),
      predecessorIds: z.array(z.string()).optional(),
      checklistIds: z.array(z.string()).optional(),
      taskIds: z.array(z.string()).optional(),
      attachments: z.array(z.object({
        url: z.string(),
        name: z.string(),
        type: z.string().optional(),
        size: z.number().optional()
      })).optional(),
      siteDiaryEntryIds: z.array(z.string()).optional(),
      sortOrder: z.number().default(0)
    });
    activityNotes = pgTable("activity_notes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      scheduleItemId: varchar("schedule_item_id").notNull().references(() => scheduleItems.id, { onDelete: "cascade" }),
      // User info (null for system-generated notes)
      userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
      userName: text("user_name"),
      // Cached for performance
      // Note type and content
      type: text("type").notNull().default("user"),
      // "user" | "system"
      content: text("content").notNull(),
      // System activity metadata
      activityType: text("activity_type"),
      // "status_change" | "date_change" | "dependency_change" | "assignment_change" etc.
      metadata: json("metadata"),
      // Store old/new values for system activities: {oldValue, newValue, field}
      // @Mentions support
      mentionedUserIds: json("mentioned_user_ids").default([]),
      // Array of user IDs mentioned in the note
      // Edit tracking
      editedAt: timestamp("edited_at"),
      isEdited: boolean("is_edited").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow()
    }, (table) => [
      index("activity_notes_schedule_item_idx").on(table.scheduleItemId),
      index("activity_notes_created_at_idx").on(table.createdAt),
      index("activity_notes_user_idx").on(table.userId)
    ]);
    insertActivityNoteSchema = createInsertSchema(activityNotes).omit({
      id: true,
      createdAt: true
    }).extend({
      type: z.enum(["user", "system"]).default("user"),
      activityType: z.enum(["status_change", "date_change", "dependency_change", "assignment_change", "priority_change", "progress_change"]).optional(),
      metadata: z.object({
        field: z.string().optional(),
        oldValue: z.any().optional(),
        newValue: z.any().optional()
      }).optional(),
      mentionedUserIds: z.array(z.string()).optional(),
      editedAt: z.coerce.date().optional()
    });
    scheduleTemplates = pgTable("schedule_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      description: text("description"),
      category: text("category"),
      // "Residential" | "Commercial" | "Renovation" | etc
      templateData: json("template_data").notNull(),
      // Array of template schedule items (structure similar to scheduleItems)
      isPublic: boolean("is_public").notNull().default(false),
      // Can other users use this template
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScheduleTemplateSchema = createInsertSchema(scheduleTemplates).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      templateData: z.array(z.any())
      // Will contain schedule item objects without IDs
    });
    updateScheduleSchema = insertScheduleSchema.partial();
    scopeStages = pgTable("scope_stages", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      // "Prelim", "Frame", "Custom Stage", etc.
      displayOrder: integer("display_order").notNull().default(0),
      // Sort order
      parentId: varchar("parent_id"),
      // For nested stages (optional)
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScopeStageSchema = createInsertSchema(scopeStages).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      name: z.string().min(1, "Stage name is required")
    });
    updateScopeStageSchema = insertScopeStageSchema.partial();
    scopeItems = pgTable("scope_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      // Hierarchy and organization
      parentId: varchar("parent_id"),
      // For nesting items
      stage: text("stage").notNull(),
      // "Prelim", "Frame", "Lockup", "Fixing", "Completion"
      displayOrder: integer("display_order").notNull().default(0),
      // Order within stage/parent
      // Content (Tiptap rich text)
      title: text("title").notNull(),
      description: text("description"),
      // Rich text content from Tiptap
      contentType: text("content_type").notNull().default("text"),
      // "text" | "bullet" | "table" | "image"
      itemType: text("item_type").notNull().default("scope"),
      // "e-note" | "scope" | "note" | "tool" | "material"
      // Integration flags
      costCodeId: varchar("cost_code_id").references(() => costCodes.id),
      costCodeTitle: text("cost_code_title"),
      // Cached for performance
      needsRfi: boolean("needs_rfi").notNull().default(false),
      needsRfq: boolean("needs_rfq").notNull().default(false),
      // Links to other entities
      estimateItemId: varchar("estimate_item_id"),
      // Link to pushed estimate item
      rfqId: varchar("rfq_id"),
      // Link to created RFQ
      poId: varchar("po_id"),
      // Link to created PO
      scheduleItemId: varchar("schedule_item_id"),
      // Link to synced schedule item
      // Gear checklist
      gearList: jsonb("gear_list").default([]),
      // Array of gear items: [{name: string, checked: boolean, photoUrl: string}]
      // Metadata
      isTemplate: boolean("is_template").notNull().default(false),
      // Is this a template item
      templateCategory: text("template_category"),
      // "Standard 4-Bed", "Slab Pour", etc.
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScopeItemSchema = createInsertSchema(scopeItems).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      contentType: z.enum(["text", "bullet", "table", "image"]).default("text"),
      itemType: z.enum(["e-note", "scope", "note", "tool", "material"]).default("scope"),
      stage: z.string().min(1, "Stage is required"),
      title: z.string().min(1, "Title is required"),
      gearList: z.array(z.object({
        name: z.string(),
        checked: z.boolean().default(false),
        photoUrl: z.string().optional()
      })).default([])
    });
    scopeTemplates = pgTable("scope_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      // "Standard 4-Bed", "Slab Pour", "Frame Package"
      description: text("description"),
      category: text("category"),
      // "Residential" | "Commercial" | "Stage-Specific"
      templateData: jsonb("template_data").notNull(),
      // Array of scope item objects
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      isPublic: boolean("is_public").notNull().default(false),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertScopeTemplateSchema = createInsertSchema(scopeTemplates).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      templateData: z.array(z.any())
      // Array of scope item objects
    });
    scopeGearPhotos = pgTable("scope_gear_photos", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      scopeItemId: varchar("scope_item_id").notNull().references(() => scopeItems.id, { onDelete: "cascade" }),
      gearItemName: text("gear_item_name").notNull(),
      // Name of the gear from gearList
      photoUrl: text("photo_url").notNull(),
      // Path to uploaded photo
      uploadedBy: varchar("uploaded_by").references(() => users.id),
      uploadedByName: text("uploaded_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertScopeGearPhotoSchema = createInsertSchema(scopeGearPhotos).omit({
      id: true,
      companyId: true,
      createdAt: true
    });
    updateScopeItemSchema = insertScopeItemSchema.partial();
    updateScopeTemplateSchema = insertScopeTemplateSchema.partial();
    calendarViews = pgTable("calendar_views", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      // Multi-tenant isolation
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      // Owner of the view
      name: text("name").notNull(),
      // e.g., "My Tasks", "Team Schedule", "Project X Only"
      calendarType: text("calendar_type").notNull(),
      // "personal" | "business"
      calendarMode: text("calendar_mode").notNull().default("month"),
      // "month" | "week" | "day"
      // Filters stored as JSON
      filters: jsonb("filters").notNull().default({
        projectIds: [],
        statuses: [],
        eventTypes: [],
        assigneeIds: [],
        dateRange: null
      }),
      // { projectIds: string[], statuses: string[], eventTypes: string[], assigneeIds: string[], dateRange: {start: Date, end: Date} | null }
      // Sharing
      sharedWith: json("shared_with").default([]),
      // Array of user IDs or role IDs who can access this view
      isDefault: boolean("is_default").notNull().default(false),
      // Is this the default view for the user
      // Metadata
      sortOrder: integer("sort_order").notNull().default(0),
      // For ordering tabs
      isArchived: boolean("is_archived").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertCalendarViewSchema = createInsertSchema(calendarViews).omit({
      id: true,
      userId: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      calendarType: z.enum(["personal", "business"]),
      calendarMode: z.enum(["month", "week", "day"]).default("month"),
      filters: z.object({
        projectIds: z.array(z.string()).optional(),
        statuses: z.array(z.string()).optional(),
        eventTypes: z.array(z.string()).optional(),
        assigneeIds: z.array(z.string()).optional(),
        dateRange: z.object({
          start: z.coerce.date(),
          end: z.coerce.date()
        }).optional().nullable()
      }).optional(),
      sharedWith: z.array(z.string()).optional(),
      isDefault: z.boolean().default(false),
      sortOrder: z.number().default(0)
    });
    updateScheduleItemSchema = insertScheduleItemSchema.partial();
    updateScheduleTemplateSchema = insertScheduleTemplateSchema.partial();
    defects = pgTable("defects", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      // Core defect information
      title: text("title").notNull(),
      description: text("description"),
      location: text("location"),
      // Room/area where defect is located
      // Categorization using field settings
      type: text("type").notNull().default("builder"),
      // "builder" | "subcontractor" | "client" | "warranty" - from field settings
      priority: text("priority").notNull().default("medium"),
      // "critical" | "high" | "medium" | "low" - from field settings
      status: text("status").notNull().default("open"),
      // "open" | "in_progress" | "resolved" | "closed" - from field settings
      trade: text("trade"),
      // Trade/category from field settings (e.g., "Carpentry", "Plumbing", etc.)
      // Assignment and responsibility
      assignedContactId: varchar("assigned_contact_id").references(() => contacts.id),
      assignedContactName: text("assigned_contact_name"),
      // Cached for performance
      // Dates
      dateIdentified: timestamp("date_identified").notNull().defaultNow(),
      dueDate: timestamp("due_date"),
      dateResolved: timestamp("date_resolved"),
      // Additional information
      notes: text("notes"),
      costImpact: integer("cost_impact"),
      // Cost to fix in cents (optional)
      costCodeId: varchar("cost_code_id").references(() => costCodes.id),
      // Link to cost code if repair has budget impact
      // Photos/attachments (future feature)
      attachments: json("attachments").default([]),
      // Array of attachment objects [{url, name, type}]
      // Audit
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      resolvedBy: varchar("resolved_by").references(() => users.id),
      resolvedByName: text("resolved_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertDefectSchema = createInsertSchema(defects).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      type: z.enum(["builder", "subcontractor", "client", "warranty"]).default("builder"),
      priority: z.enum(["critical", "high", "medium", "low"]).default("medium"),
      status: z.enum(["open", "in_progress", "resolved", "closed"]).default("open"),
      dateIdentified: z.coerce.date().optional(),
      dueDate: z.coerce.date().optional(),
      dateResolved: z.coerce.date().optional(),
      costImpact: z.number().optional(),
      attachments: z.array(z.object({
        url: z.string(),
        name: z.string(),
        type: z.string().optional(),
        size: z.number().optional()
      })).optional()
    });
    minutes = pgTable("minutes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      title: text("title").notNull(),
      meetingDate: timestamp("meeting_date").notNull(),
      location: text("location"),
      // Meeting location (physical or virtual link)
      attendees: json("attendees").default([]),
      // Array of attendee names or {name, contactId} objects
      contentHtml: text("content_html"),
      // Rich text HTML content
      contentText: text("content_text"),
      // Plain text for searching
      aiSummary: text("ai_summary"),
      // AI-generated summary
      actionItems: json("action_items").default([]),
      // Array of action items [{description, assignee, dueDate, completed}]
      recordingUrl: text("recording_url"),
      // External recording link (Zoom, Teams, etc.)
      recordingFileName: text("recording_file_name"),
      // Uploaded file name
      recordingFileUrl: text("recording_file_url"),
      // Path to uploaded recording
      transcription: text("transcription"),
      // AI transcription of recording
      transcriptionStatus: text("transcription_status"),
      // pending, processing, completed, failed
      projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }),
      ownerId: varchar("owner_id").references(() => users.id),
      ownerName: text("owner_name"),
      // Cached for performance
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertMinuteSchema = createInsertSchema(minutes).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      meetingDate: z.coerce.date(),
      contentHtml: z.string().optional(),
      contentText: z.string().optional(),
      aiSummary: z.string().optional(),
      attendees: z.array(z.union([
        z.string(),
        // Manual entry
        z.object({ name: z.string(), contactId: z.string() })
        // From contacts
      ])).optional(),
      actionItems: z.array(z.object({
        description: z.string(),
        assignee: z.string().optional(),
        dueDate: z.coerce.date().optional(),
        completed: z.boolean().default(false)
      })).optional(),
      recordingUrl: z.string().optional(),
      recordingFileName: z.string().optional(),
      recordingFileUrl: z.string().optional(),
      transcription: z.string().optional(),
      transcriptionStatus: z.enum(["pending", "processing", "completed", "failed"]).optional()
    });
    systemFolders = pgTable("system_folders", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      description: text("description"),
      parentId: varchar("parent_id").references(() => systemFolders.id),
      // Self-reference for hierarchy
      icon: text("icon").default("folder"),
      // Lucide icon name
      color: text("color"),
      // Optional color coding
      // Role-based access control
      roleIds: json("role_ids").default([]),
      // Array of role IDs that can access this folder
      isPublic: boolean("is_public").default(true),
      // If true, all roles can view
      // Display ordering
      displayOrder: integer("display_order").default(0),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSystemFolderSchema = createInsertSchema(systemFolders).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      roleIds: z.array(z.string()).optional(),
      isPublic: z.boolean().optional(),
      displayOrder: z.number().optional()
    });
    systemDocuments = pgTable("system_documents", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      folderId: varchar("folder_id").references(() => systemFolders.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      description: text("description"),
      type: text("type").notNull().default("document"),
      // "document" | "policy" | "procedure" | "template" | "reference"
      // File storage
      fileUrl: text("file_url"),
      // External URL or path to file
      fileName: text("file_name"),
      fileSize: integer("file_size"),
      // Size in bytes
      fileType: text("file_type"),
      // MIME type
      // Version control
      version: text("version").default("1.0"),
      // Metadata
      tags: json("tags").default([]),
      // Array of tags for searching
      role: text("role"),
      // Role responsible for this document
      status: text("status"),
      // Status from field settings
      // Task Template Link
      taskTemplateId: varchar("task_template_id").references(() => taskTemplates.id, { onDelete: "set null" }),
      taskTemplateName: text("task_template_name"),
      // Cached for performance
      // Display ordering
      displayOrder: integer("display_order").default(0),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      updatedBy: varchar("updated_by").references(() => users.id),
      updatedByName: text("updated_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertSystemDocumentSchema = createInsertSchema(systemDocuments).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
      taskTemplateName: true
      // Server will populate this
    }).extend({
      type: z.enum(["document", "policy", "procedure", "template", "reference"]).default("document"),
      tags: z.array(z.string()).optional(),
      fileSize: z.number().optional(),
      role: z.string().optional(),
      status: z.string().optional(),
      taskTemplateId: z.string().optional()
    });
    taskTemplates = pgTable("task_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      title: text("title").notNull(),
      goal: text("goal"),
      // Brief, to-the-point goal
      description: text("description"),
      // Detailed description
      // Role assignment
      defaultRoleId: varchar("default_role_id").references(() => userRoles.id),
      // Default role to assign
      defaultRoleName: text("default_role_name"),
      // Cached for performance
      // Scheduling
      frequency: text("frequency"),
      // "daily" | "weekly" | "monthly" | "yearly" | "once"
      frequencyInterval: integer("frequency_interval").default(1),
      // Every N days/weeks/months
      dueDayOfWeek: json("due_day_of_week"),
      // For weekly: array of 0-6 (Sun-Sat)
      dueDayOfMonth: integer("due_day_of_month"),
      // For monthly: 1-31
      dueTime: text("due_time"),
      // HH:MM format
      dueOffsetDays: integer("due_offset_days").default(0),
      // Days relative to trigger
      // Recurring schedule (for "perfect week" templates)
      isRecurringTemplate: boolean("is_recurring_template").default(false),
      // Whether this template auto-generates recurring tasks
      recurringDays: json("recurring_days").default([]),
      // Days of week: array of 0-6 (Sun-Sat) when tasks should be created
      recurringSchedule: json("recurring_schedule").default([]),
      // Array of {dayOfWeek: number, startTime: string, duration: number} for day-specific times
      recurringStartTime: text("recurring_start_time"),
      // DEPRECATED: Use recurringSchedule instead
      recurringDuration: integer("recurring_duration"),
      // DEPRECATED: Use recurringSchedule instead
      recurringAssigneeId: varchar("recurring_assignee_id").references(() => users.id),
      // DEPRECATED: Use defaultRoleId for role-based assignment
      recurringAssigneeName: text("recurring_assignee_name"),
      // DEPRECATED: Cached for performance
      // Checklist
      checklist: json("checklist").default([]),
      // Array of checklist items [{text, completed}]
      // Attachments and links
      externalLinks: json("external_links").default([]),
      // Array of URLs
      // Status - now references task_template_statuses table
      statusId: varchar("status_id").references(() => taskTemplateStatuses.id),
      // Reference to task template status
      statusName: text("status_name"),
      // Cached status name for performance (e.g., "Active", "Draft", "Archived")
      isActive: boolean("is_active").default(true),
      // Metadata
      category: text("category"),
      // Custom categorization
      tagIds: json("tag_ids").default([]),
      // Array of task tag IDs from task_tags table
      estimatedDuration: integer("estimated_duration"),
      // Estimated minutes to complete
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertTaskTemplateSchema = createInsertSchema(taskTemplates).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
      statusName: true,
      // Server will populate this
      defaultRoleName: true,
      // Server will populate this
      recurringAssigneeName: true
      // Server will populate this
    }).extend({
      goal: z.string().optional(),
      frequency: z.enum(["daily", "weekly", "monthly", "yearly", "once"]).optional(),
      frequencyInterval: z.number().optional(),
      dueDayOfWeek: z.array(z.number().min(0).max(6)).optional(),
      // Array of 0-6 for Sun-Sat
      dueDayOfMonth: z.number().min(1).max(31).optional(),
      dueTime: z.string().optional(),
      // HH:MM format
      dueOffsetDays: z.number().optional(),
      // Recurring schedule fields
      isRecurringTemplate: z.boolean().optional(),
      recurringDays: z.array(z.number().min(0).max(6)).optional(),
      // Array of 0-6 for Sun-Sat
      recurringSchedule: z.array(z.object({
        dayOfWeek: z.number().min(0).max(6),
        // 0=Sunday, 6=Saturday
        startTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
        // HH:MM format
        duration: z.number().min(1)
        // Duration in minutes
      })).optional(),
      recurringStartTime: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/).optional(),
      // DEPRECATED
      recurringDuration: z.number().min(1).optional(),
      // DEPRECATED
      recurringAssigneeId: z.string().optional(),
      // DEPRECATED
      checklist: z.array(z.object({
        text: z.string(),
        completed: z.boolean().default(false)
      })).optional(),
      externalLinks: z.array(z.string().url()).optional(),
      // Array of valid URLs
      tagIds: z.array(z.string()).optional(),
      statusId: z.string().optional(),
      estimatedDuration: z.number().optional(),
      isActive: z.boolean().optional()
    });
    taskTemplateAttachments = pgTable("task_template_attachments", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      taskTemplateId: varchar("task_template_id").notNull().references(() => taskTemplates.id, { onDelete: "cascade" }),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      originalName: text("original_name").notNull(),
      storageKey: text("storage_key").notNull(),
      // Path in object storage
      mimeType: text("mime_type"),
      byteSize: integer("byte_size"),
      uploadedBy: varchar("uploaded_by").references(() => users.id),
      uploadedByName: text("uploaded_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertTaskTemplateAttachmentSchema = createInsertSchema(taskTemplateAttachments).omit({
      id: true,
      taskTemplateId: true,
      companyId: true,
      createdAt: true
    });
    taskTags = pgTable("task_tags", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      color: text("color").notNull(),
      // Hex color code (e.g., "#3b82f6")
      displayOrder: integer("display_order").notNull().default(0),
      isActive: boolean("is_active").notNull().default(true),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      uniqueNamePerCompany: uniqueIndex("task_tags_company_name_unique").on(table.companyId, table.name)
    }));
    insertTaskTagSchema = createInsertSchema(taskTags).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color code"),
      displayOrder: z.number().optional(),
      isActive: z.boolean().optional()
    });
    taskTemplateStatuses = pgTable("task_template_statuses", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      color: text("color").notNull(),
      // Hex color code (e.g., "#10b981")
      displayOrder: integer("display_order").notNull().default(0),
      isDefault: boolean("is_default").notNull().default(false),
      // One status should be marked as default
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      uniqueNamePerCompany: uniqueIndex("task_template_statuses_company_name_unique").on(table.companyId, table.name)
    }));
    insertTaskTemplateStatusSchema = createInsertSchema(taskTemplateStatuses).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color code"),
      displayOrder: z.number().optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional()
    });
    workflowTemplates = pgTable("workflow_templates", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      name: text("name").notNull(),
      description: text("description"),
      // Trigger configuration
      triggerType: text("trigger_type").notNull().default("stage_change"),
      // "stage_change" | "status_change" | "manual" | "date"
      triggerStage: text("trigger_stage"),
      // Project stage that triggers this workflow
      triggerStatus: text("trigger_status"),
      // Project status that triggers this workflow
      // Task templates to create
      taskTemplateIds: json("task_template_ids").default([]),
      // Array of task template IDs to create
      taskConfigs: json("task_configs").default([]),
      // Array of {templateId, offsetDays, assigneeRoleId} for customization
      // Status
      isActive: boolean("is_active").default(true),
      createdBy: varchar("created_by").references(() => users.id),
      createdByName: text("created_by_name"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates).omit({
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      triggerType: z.enum(["stage_change", "status_change", "manual", "date"]).default("stage_change"),
      taskTemplateIds: z.array(z.string()).optional(),
      taskConfigs: z.array(z.object({
        templateId: z.string(),
        offsetDays: z.number().optional(),
        assigneeRoleId: z.string().optional()
      })).optional(),
      isActive: z.boolean().optional()
    });
    projectWorkflows = pgTable("project_workflows", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
      workflowTemplateId: varchar("workflow_template_id").notNull().references(() => workflowTemplates.id),
      status: text("status").notNull().default("pending"),
      // "pending" | "in_progress" | "completed" | "cancelled"
      // Track created tasks
      createdTaskIds: json("created_task_ids").default([]),
      // Array of task IDs created by this workflow
      // Execution details
      triggeredAt: timestamp("triggered_at").notNull().defaultNow(),
      completedAt: timestamp("completed_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertProjectWorkflowSchema = createInsertSchema(projectWorkflows).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).default("pending"),
      createdTaskIds: z.array(z.string()).optional(),
      triggeredAt: z.coerce.date().optional(),
      completedAt: z.coerce.date().optional()
    });
    channels = pgTable("channels", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      name: text("name").notNull(),
      // e.g., "general", "26-ocean", "dm-jed-smith"
      type: text("type").notNull().default("channel"),
      // "channel" | "dm"
      // Project association (null for general/company-wide channels)
      projectId: varchar("project_id").references(() => projects.id, { onDelete: "cascade" }),
      // DM participants (for DMs only, stores user IDs as JSON array)
      dmParticipants: json("dm_participants"),
      // ["user_id_1", "user_id_2"]
      // Channel settings
      description: text("description"),
      isArchived: boolean("is_archived").notNull().default(false),
      isClientFacing: boolean("is_client_facing").notNull().default(false),
      // Multi-tenant isolation
      companyId: varchar("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
      createdById: varchar("created_by_id").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertChannelSchema = createInsertSchema(channels).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      type: z.enum(["channel", "dm"]).default("channel"),
      dmParticipants: z.array(z.string()).optional()
    });
    channelMembers = pgTable("channel_members", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
      // Member settings
      role: text("role").notNull().default("member"),
      // "owner" | "admin" | "member"
      isNotificationsMuted: boolean("is_notifications_muted").notNull().default(false),
      lastReadAt: timestamp("last_read_at"),
      // For unread badges
      joinedAt: timestamp("joined_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      // Ensure user can't join same channel twice
      uniqueChannelUser: uniqueIndex("channel_members_channel_user_unique").on(table.channelId, table.userId)
    }));
    insertChannelMemberSchema = createInsertSchema(channelMembers).omit({
      id: true,
      joinedAt: true,
      updatedAt: true
    }).extend({
      role: z.enum(["owner", "admin", "member"]).default("member")
    });
    messages = pgTable("messages", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      channelId: varchar("channel_id").notNull().references(() => channels.id, { onDelete: "cascade" }),
      userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "set null" }),
      // Message content
      content: text("content").notNull(),
      // Threading support (for future feature)
      threadParentId: varchar("thread_parent_id").references(() => messages.id, { onDelete: "cascade" }),
      threadCount: integer("thread_count").notNull().default(0),
      // Mentions and bot commands
      mentions: json("mentions").default([]),
      // Array of user IDs mentioned
      hasCommand: boolean("has_command").notNull().default(false),
      // True if message starts with /
      commandType: text("command_type"),
      // "task", "remind", etc.
      // Message metadata
      isEdited: boolean("is_edited").notNull().default(false),
      isDeleted: boolean("is_deleted").notNull().default(false),
      // Cached user info for performance
      userFirstName: text("user_first_name"),
      userLastName: text("user_last_name"),
      userEmail: text("user_email"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    }, (table) => ({
      // Index for fast channel message queries
      channelIdIndex: index("messages_channel_id_idx").on(table.channelId),
      // Index for threading queries
      threadParentIdIndex: index("messages_thread_parent_id_idx").on(table.threadParentId)
    }));
    insertMessageSchema = createInsertSchema(messages).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      mentions: z.array(z.string()).optional()
    });
    rfqStatusEnum = pgEnum("rfq_status", ["draft", "sent", "confirmed", "quoted", "accepted", "declined", "expired"]);
    rfqFollowUpTypeEnum = pgEnum("rfq_follow_up_type", ["initial", "reminder_3d", "reminder_7d", "reminder_14d"]);
    rfqs = pgTable("rfqs", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      rfqNumber: text("rfq_number").notNull(),
      // e.g., "4504-RFQ-001"
      projectId: varchar("project_id").notNull().references(() => projects.id),
      companyId: varchar("company_id").notNull().references(() => companies.id),
      title: text("title").notNull(),
      // e.g., "Concrete Pour - Slab"
      description: text("description"),
      // Brief description
      scope: text("scope"),
      // Wunderbuild-style rich-text scope of work (6-line auto-grow)
      dueDate: timestamp("due_date"),
      // Multi-supplier support (send to multiple suppliers at once)
      supplierIds: text("supplier_ids").array().notNull().default(sql`'{}'`),
      // Array of supplier IDs
      supplierNames: text("supplier_names").array().notNull().default(sql`'{}'`),
      // Array of supplier names
      status: rfqStatusEnum("status").notNull().default("draft"),
      sentAt: timestamp("sent_at"),
      // File attachments (plans, specs)
      attachmentUrls: text("attachment_urls").array().notNull().default(sql`'{}'`),
      // Array of file URLs
      // PDF generation
      pdfUrl: text("pdf_url"),
      // Generated PDF URL
      createdBy: varchar("created_by").notNull(),
      createdByName: text("created_by_name").notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertRfqSchema = createInsertSchema(rfqs).omit({
      id: true,
      createdAt: true,
      updatedAt: true,
      companyId: true,
      createdBy: true,
      createdByName: true,
      rfqNumber: true,
      status: true
    }).extend({
      title: z.string().min(1, "Title is required"),
      description: z.string().optional(),
      scope: z.string().min(10, "Scope must be at least 10 characters"),
      supplierIds: z.array(z.string()).min(1, "At least one supplier is required"),
      supplierNames: z.array(z.string()).min(1),
      attachmentUrls: z.array(z.string()).optional()
    });
    rfqItems = pgTable("rfq_items", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
      estimateItemId: varchar("estimate_item_id").references(() => estimateItems.id, { onDelete: "set null" }),
      description: text("description").notNull(),
      quantity: numeric("quantity", { precision: 10, scale: 2 }),
      unit: text("unit"),
      notes: text("notes"),
      displayOrder: integer("display_order").notNull().default(0),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertRfqItemSchema = createInsertSchema(rfqItems).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    });
    rfqQuotes = pgTable("rfq_quotes", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
      supplierId: varchar("supplier_id").references(() => suppliers.id),
      supplierName: text("supplier_name"),
      totalAmount: integer("total_amount").notNull(),
      // In cents
      notes: text("notes"),
      attachments: json("attachments").default([]),
      // Array of {name, url, size}
      status: text("status").notNull().default("pending"),
      // "pending" | "accepted" | "declined"
      acceptedAt: timestamp("accepted_at"),
      declinedAt: timestamp("declined_at"),
      uploadedBy: varchar("uploaded_by").references(() => users.id),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow()
    });
    insertRfqQuoteSchema = createInsertSchema(rfqQuotes).omit({
      id: true,
      createdAt: true,
      updatedAt: true
    }).extend({
      attachments: z.array(z.object({
        name: z.string(),
        url: z.string(),
        size: z.number().optional()
      })).optional()
    });
    rfqFollowUps = pgTable("rfq_follow_ups", {
      id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
      rfqId: varchar("rfq_id").notNull().references(() => rfqs.id, { onDelete: "cascade" }),
      followUpType: rfqFollowUpTypeEnum("follow_up_type").notNull(),
      // "initial" | "reminder_3d" | "reminder_7d" | "reminder_14d"
      scheduledFor: timestamp("scheduled_for").notNull(),
      sentAt: timestamp("sent_at"),
      emailSubject: text("email_subject"),
      emailBody: text("email_body"),
      status: text("status").notNull().default("scheduled"),
      // "scheduled" | "sent" | "failed" | "cancelled"
      createdAt: timestamp("created_at").notNull().defaultNow()
    });
    insertRfqFollowUpSchema = createInsertSchema(rfqFollowUps).omit({
      id: true,
      createdAt: true
    });
  }
});

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
var pool, db;
var init_db = __esm({
  "server/db.ts"() {
    "use strict";
    init_schema();
    neonConfig.webSocketConstructor = ws;
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?"
      );
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle({ client: pool, schema: schema_exports });
  }
});

// server/storage.ts
import { randomUUID } from "crypto";
import { eq as eq2, or, and, desc, asc, gte, lte, sql as sql2, inArray, isNull, gt } from "drizzle-orm";
var DbStorage, dbStorage, storage;
var init_storage = __esm({
  "server/storage.ts"() {
    "use strict";
    init_auth();
    init_recurringTasks();
    init_db();
    init_schema();
    DbStorage = class {
      initialized = false;
      // Public initialization method that can be awaited
      async initialize() {
        if (this.initialized) return;
        try {
          await this.initializeDefaultData();
          this.initialized = true;
        } catch (error) {
          console.error("Failed to initialize DbStorage:", error);
          throw error;
        }
      }
      // Initialize default data - ensure all required defaults exist
      async initializeDefaultData() {
        await this.ensureRequiredCategoriesExist();
        await this.ensureAllRequiredOptionsExist();
        await this.ensureRequiredCustomFieldsExist();
      }
      // Ensure all required categories exist (upsert by key)
      async ensureRequiredCategoriesExist() {
        const now = /* @__PURE__ */ new Date();
        const requiredCategories = [
          {
            id: "cat-task-status",
            key: "task.status",
            label: "Task Statuses",
            entity: "task",
            description: "Status options for tasks",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 1
          },
          {
            id: "cat-task-priority",
            key: "task.priority",
            label: "Task Priorities",
            entity: "task",
            description: "Priority levels for tasks",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 2
          },
          {
            id: "cat-task-labels",
            key: "task.labels",
            label: "Task Labels",
            entity: "task",
            description: "Customizable labels for tasks",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 3
          },
          {
            id: "cat-trade-types",
            key: "task.trade",
            label: "Trade Categories",
            entity: "task",
            description: "Construction trade categories",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 4
          },
          {
            id: "cat-selection-categories",
            key: "selection.category",
            label: "Selection Categories",
            entity: "selection",
            description: "Categories for selections",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 5
          },
          {
            id: "cat-location-rooms",
            key: "selection.room",
            label: "Locations/Rooms",
            entity: "selection",
            description: "Room/location options for selections",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 6
          },
          {
            id: "cat-estimate-item-status",
            key: "estimate_item.status",
            label: "Estimate Item Statuses",
            entity: "estimate_item",
            description: "Status options for estimate items",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 7
          },
          {
            id: "cat-estimate-item-unit",
            key: "estimate_item.unit",
            label: "Estimate Units",
            entity: "estimate_item",
            description: "Unit of measurement options for estimate items",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 8
          },
          {
            id: "cat-estimate-status",
            key: "estimate.status",
            label: "Estimate Statuses",
            entity: "estimate",
            description: "Status options for estimates",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 8
          },
          {
            id: "cat-defect-status",
            key: "defect.status",
            label: "Defect Statuses",
            entity: "defect",
            description: "Status options for defects",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 9
          },
          {
            id: "cat-defect-priority",
            key: "defect.priority",
            label: "Defect Priorities",
            entity: "defect",
            description: "Priority levels for defects",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 10
          },
          {
            id: "cat-defect-type",
            key: "defect.type",
            label: "Defect Types",
            entity: "defect",
            description: "Type/source of defects",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 11
          },
          {
            id: "cat-defect-trade",
            key: "defect.trade",
            label: "Defect Trades",
            entity: "defect",
            description: "Trade categories for defects",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 12
          },
          {
            id: "cat-schedule-item-status",
            key: "schedule_item.status",
            label: "Schedule Item Statuses",
            entity: "schedule_item",
            description: "Status options for schedule items",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 13
          }
        ];
        for (const categoryData of requiredCategories) {
          const existing = await db.select().from(fieldCategories).where(eq2(fieldCategories.key, categoryData.key)).limit(1);
          if (existing.length === 0) {
            await db.insert(fieldCategories).values({
              ...categoryData,
              createdAt: now,
              updatedAt: now
            });
          }
        }
      }
      // Ensure all required field options exist for all categories (upsert missing ones)
      async ensureAllRequiredOptionsExist() {
        const allCategories = await db.select().from(fieldCategories);
        const now = /* @__PURE__ */ new Date();
        for (const category of allCategories) {
          await this.ensureOptionsForCategory(category, now);
        }
      }
      async ensureOptionsForCategory(category, now) {
        const requiredOptions = this.getRequiredOptionsForCategory(category.key, category.id);
        for (const optionData of requiredOptions) {
          const existing = await db.select().from(fieldOptions).where(and(
            eq2(fieldOptions.categoryId, category.id),
            eq2(fieldOptions.key, optionData.key)
          )).limit(1);
          if (existing.length === 0) {
            await db.insert(fieldOptions).values({
              ...optionData,
              isActive: true,
              createdAt: now,
              updatedAt: now
            });
          }
        }
      }
      getRequiredOptionsForCategory(categoryKey, categoryId) {
        switch (categoryKey) {
          case "task.status":
            return [
              { id: "opt-status-todo", categoryId, key: "todo", name: "Not Started", color: "#6B7280", isDefault: true, sortOrder: 0 },
              { id: "opt-status-progress", categoryId, key: "in-progress", name: "In Progress", color: "#F59E0B", isDefault: false, sortOrder: 1 },
              { id: "opt-status-done", categoryId, key: "done", name: "Complete", color: "#10B981", isDefault: false, sortOrder: 2 },
              { id: "opt-status-hold", categoryId, key: "on-hold", name: "On Hold", color: "#EF4444", isDefault: false, sortOrder: 3 }
            ];
          case "task.priority":
            return [
              { id: "opt-priority-low", categoryId, key: "low", name: "Low", color: "#10B981", isDefault: false, sortOrder: 0 },
              { id: "opt-priority-medium", categoryId, key: "medium", name: "Medium", color: "#F59E0B", isDefault: true, sortOrder: 1 },
              { id: "opt-priority-high", categoryId, key: "high", name: "High", color: "#EF4444", isDefault: false, sortOrder: 2 }
            ];
          case "task.labels":
            return [
              { id: "opt-label-bug", categoryId, key: "bug", name: "Bug", color: "#EF4444", isDefault: false, sortOrder: 0 },
              { id: "opt-label-feature", categoryId, key: "feature", name: "Feature", color: "#3B82F6", isDefault: false, sortOrder: 1 },
              { id: "opt-label-urgent", categoryId, key: "urgent", name: "Urgent", color: "#DC2626", isDefault: false, sortOrder: 2 },
              { id: "opt-label-review", categoryId, key: "review", name: "Review", color: "#F59E0B", isDefault: false, sortOrder: 3 },
              { id: "opt-label-documentation", categoryId, key: "documentation", name: "Documentation", color: "#8B5CF6", isDefault: false, sortOrder: 4 },
              { id: "opt-label-client-request", categoryId, key: "client-request", name: "Client Request", color: "#10B981", isDefault: false, sortOrder: 5 }
            ];
          case "task.trade":
            return [
              { id: "opt-trade-electrical", categoryId, key: "electrical", name: "Electrical", color: "#3B82F6", isDefault: true, sortOrder: 0 },
              { id: "opt-trade-plumbing", categoryId, key: "plumbing", name: "Plumbing", color: "#06B6D4", isDefault: false, sortOrder: 1 },
              { id: "opt-trade-carpentry", categoryId, key: "carpentry", name: "Carpentry", color: "#D97706", isDefault: false, sortOrder: 2 },
              { id: "opt-trade-painting", categoryId, key: "painting", name: "Painting & Decorating", color: "#7C3AED", isDefault: false, sortOrder: 3 },
              { id: "opt-trade-flooring", categoryId, key: "flooring", name: "Flooring", color: "#059669", isDefault: false, sortOrder: 4 }
            ];
          case "selection.category":
            return [
              { id: "opt-sel-fixtures", categoryId, key: "fixtures", name: "Fixtures & Fittings", color: "#8B5CF6", isDefault: true, sortOrder: 0 },
              { id: "opt-sel-finishes", categoryId, key: "finishes", name: "Finishes", color: "#EC4899", isDefault: false, sortOrder: 1 },
              { id: "opt-sel-appliances", categoryId, key: "appliances", name: "Appliances", color: "#F59E0B", isDefault: false, sortOrder: 2 }
            ];
          case "selection.room":
            return [
              { id: "opt-room-kitchen", categoryId, key: "kitchen", name: "Kitchen", color: "#059669", isDefault: true, sortOrder: 0 },
              { id: "opt-room-living", categoryId, key: "living", name: "Living Room", color: "#DC2626", isDefault: false, sortOrder: 1 },
              { id: "opt-room-master", categoryId, key: "master-bedroom", name: "Master Bedroom", color: "#7C3AED", isDefault: false, sortOrder: 2 },
              { id: "opt-room-bathroom", categoryId, key: "main-bathroom", name: "Main Bathroom", color: "#06B6D4", isDefault: false, sortOrder: 3 },
              { id: "opt-room-ensuite", categoryId, key: "ensuite", name: "Ensuite", color: "#0891B2", isDefault: false, sortOrder: 4 },
              { id: "opt-room-laundry", categoryId, key: "laundry", name: "Laundry", color: "#65A30D", isDefault: false, sortOrder: 5 }
            ];
          case "estimate_item.status":
            return [
              { id: "opt-estimate-item-status-pending", categoryId, key: "pending", name: "Pending", color: "#6B7280", isDefault: true, isCompleted: false, sortOrder: 0 },
              { id: "opt-estimate-item-status-quoted", categoryId, key: "quoted", name: "Quoted", color: "#F59E0B", isDefault: false, isCompleted: false, sortOrder: 1 },
              { id: "opt-estimate-item-status-confirmed", categoryId, key: "confirmed", name: "Confirmed", color: "#10B981", isDefault: false, isCompleted: true, sortOrder: 2 },
              { id: "opt-estimate-item-status-ordered", categoryId, key: "ordered", name: "Ordered", color: "#3B82F6", isDefault: false, isCompleted: false, sortOrder: 3 },
              { id: "opt-estimate-item-status-cancelled", categoryId, key: "cancelled", name: "Cancelled", color: "#EF4444", isDefault: false, isCompleted: false, sortOrder: 4 }
            ];
          case "estimate_item.unit":
            return [
              { id: "opt-estimate-item-unit-ea", categoryId, key: "ea", name: "ea", color: "#6B7280", isDefault: true, isCompleted: false, sortOrder: 0 },
              { id: "opt-estimate-item-unit-m", categoryId, key: "m", name: "m", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 1 },
              { id: "opt-estimate-item-unit-m2", categoryId, key: "m\xB2", name: "m\xB2", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 2 },
              { id: "opt-estimate-item-unit-m3", categoryId, key: "m\xB3", name: "m\xB3", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 3 },
              { id: "opt-estimate-item-unit-item", categoryId, key: "item", name: "item", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 4 },
              { id: "opt-estimate-item-unit-hr", categoryId, key: "hr", name: "hr", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 5 },
              { id: "opt-estimate-item-unit-day", categoryId, key: "day", name: "day", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 6 },
              { id: "opt-estimate-item-unit-load", categoryId, key: "load", name: "load", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 7 },
              { id: "opt-estimate-item-unit-tonne", categoryId, key: "tonne", name: "tonne", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 8 },
              { id: "opt-estimate-item-unit-kg", categoryId, key: "kg", name: "kg", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 9 },
              { id: "opt-estimate-item-unit-set", categoryId, key: "set", name: "set", color: "#6B7280", isDefault: false, isCompleted: false, sortOrder: 10 }
            ];
          case "estimate.status":
            return [
              { id: "opt-estimate-status-draft", categoryId, key: "draft", name: "Draft", color: "#6B7280", isDefault: true, isCompleted: false, sortOrder: 0 },
              { id: "opt-estimate-status-working", categoryId, key: "working", name: "Working", color: "#F59E0B", isDefault: false, isCompleted: false, sortOrder: 1 },
              { id: "opt-estimate-status-locked", categoryId, key: "locked", name: "Locked", color: "#3B82F6", isDefault: false, isCompleted: false, sortOrder: 2 },
              { id: "opt-estimate-status-approved", categoryId, key: "approved", name: "Approved", color: "#10B981", isDefault: false, isCompleted: true, sortOrder: 3 }
            ];
          case "defect.status":
            return [
              { id: "opt-defect-status-open", categoryId, key: "open", name: "Open", color: "#EF4444", isDefault: true, isCompleted: false, sortOrder: 0 },
              { id: "opt-defect-status-progress", categoryId, key: "in_progress", name: "In Progress", color: "#F59E0B", isDefault: false, isCompleted: false, sortOrder: 1 },
              { id: "opt-defect-status-resolved", categoryId, key: "resolved", name: "Resolved", color: "#10B981", isDefault: false, isCompleted: true, sortOrder: 2 },
              { id: "opt-defect-status-closed", categoryId, key: "closed", name: "Closed", color: "#6B7280", isDefault: false, isCompleted: true, sortOrder: 3 }
            ];
          case "defect.priority":
            return [
              { id: "opt-defect-priority-critical", categoryId, key: "critical", name: "Critical", color: "#DC2626", isDefault: false, sortOrder: 0 },
              { id: "opt-defect-priority-high", categoryId, key: "high", name: "High", color: "#EF4444", isDefault: false, sortOrder: 1 },
              { id: "opt-defect-priority-medium", categoryId, key: "medium", name: "Medium", color: "#F59E0B", isDefault: true, sortOrder: 2 },
              { id: "opt-defect-priority-low", categoryId, key: "low", name: "Low", color: "#10B981", isDefault: false, sortOrder: 3 }
            ];
          case "defect.type":
            return [
              { id: "opt-defect-type-builder", categoryId, key: "builder", name: "Builder Defect", color: "#3B82F6", isDefault: true, sortOrder: 0 },
              { id: "opt-defect-type-subcontractor", categoryId, key: "subcontractor", name: "Subcontractor", color: "#F59E0B", isDefault: false, sortOrder: 1 },
              { id: "opt-defect-type-client", categoryId, key: "client", name: "Client Reported", color: "#8B5CF6", isDefault: false, sortOrder: 2 },
              { id: "opt-defect-type-warranty", categoryId, key: "warranty", name: "Warranty", color: "#EF4444", isDefault: false, sortOrder: 3 }
            ];
          case "defect.trade":
            return [
              { id: "opt-defect-trade-general", categoryId, key: "general", name: "General", color: "#6B7280", isDefault: true, sortOrder: 0 },
              { id: "opt-defect-trade-carpentry", categoryId, key: "carpentry", name: "Carpentry", color: "#D97706", isDefault: false, sortOrder: 1 },
              { id: "opt-defect-trade-plumbing", categoryId, key: "plumbing", name: "Plumbing", color: "#06B6D4", isDefault: false, sortOrder: 2 },
              { id: "opt-defect-trade-electrical", categoryId, key: "electrical", name: "Electrical", color: "#3B82F6", isDefault: false, sortOrder: 3 },
              { id: "opt-defect-trade-painting", categoryId, key: "painting", name: "Painting", color: "#7C3AED", isDefault: false, sortOrder: 4 },
              { id: "opt-defect-trade-flooring", categoryId, key: "flooring", name: "Flooring", color: "#059669", isDefault: false, sortOrder: 5 },
              { id: "opt-defect-trade-tiling", categoryId, key: "tiling", name: "Tiling", color: "#0891B2", isDefault: false, sortOrder: 6 }
            ];
          case "schedule_item.status":
            return [
              { id: "opt-schedule-item-status-not-started", categoryId, key: "not_started", name: "Not Started", color: "#6B7280", isDefault: true, isCompleted: false, sortOrder: 0 },
              { id: "opt-schedule-item-status-in-progress", categoryId, key: "in_progress", name: "In Progress", color: "#F59E0B", isDefault: false, isCompleted: false, sortOrder: 1 },
              { id: "opt-schedule-item-status-completed", categoryId, key: "completed", name: "Completed", color: "#10B981", isDefault: false, isCompleted: true, sortOrder: 2 },
              { id: "opt-schedule-item-status-on-hold", categoryId, key: "on_hold", name: "On Hold", color: "#EF4444", isDefault: false, isCompleted: false, sortOrder: 3 },
              { id: "opt-schedule-item-status-cancelled", categoryId, key: "cancelled", name: "Cancelled", color: "#94A3B8", isDefault: false, isCompleted: false, sortOrder: 4 }
            ];
          default:
            return [];
        }
      }
      // Ensure required custom fields exist
      async ensureRequiredCustomFieldsExist() {
        const now = /* @__PURE__ */ new Date();
        const existing = await db.select().from(customFieldDefs).where(eq2(customFieldDefs.key, "task_custom_field_1")).limit(1);
        if (existing.length === 0) {
          await db.insert(customFieldDefs).values({
            id: "cfd-task-custom-1",
            key: "task_custom_field_1",
            label: "Task Custom Field 1",
            type: "text",
            required: false,
            order: 1,
            isActive: true,
            createdAt: now,
            updatedAt: now
          });
        }
      }
      async seedOptionsForCategory(category, now) {
        let optionsToInsert = [];
        switch (category.key) {
          case "task.status":
            optionsToInsert = [
              { id: "opt-status-todo", categoryId: category.id, key: "todo", name: "Not Started", color: "#6B7280", isDefault: true, sortOrder: 0 },
              { id: "opt-status-progress", categoryId: category.id, key: "in-progress", name: "In Progress", color: "#F59E0B", isDefault: false, sortOrder: 1 },
              { id: "opt-status-done", categoryId: category.id, key: "done", name: "Complete", color: "#10B981", isDefault: false, sortOrder: 2 },
              { id: "opt-status-hold", categoryId: category.id, key: "on-hold", name: "On Hold", color: "#EF4444", isDefault: false, sortOrder: 3 }
            ];
            break;
          case "task.priority":
            optionsToInsert = [
              { id: "opt-priority-low", categoryId: category.id, key: "low", name: "Low", color: "#10B981", isDefault: false, sortOrder: 0 },
              { id: "opt-priority-medium", categoryId: category.id, key: "medium", name: "Medium", color: "#F59E0B", isDefault: true, sortOrder: 1 },
              { id: "opt-priority-high", categoryId: category.id, key: "high", name: "High", color: "#EF4444", isDefault: false, sortOrder: 2 }
            ];
            break;
          case "task.trade":
            optionsToInsert = [
              { id: "opt-trade-electrical", categoryId: category.id, key: "electrical", name: "Electrical", color: "#3B82F6", isDefault: true, sortOrder: 0 },
              { id: "opt-trade-plumbing", categoryId: category.id, key: "plumbing", name: "Plumbing", color: "#06B6D4", isDefault: false, sortOrder: 1 },
              { id: "opt-trade-carpentry", categoryId: category.id, key: "carpentry", name: "Carpentry", color: "#D97706", isDefault: false, sortOrder: 2 },
              { id: "opt-trade-painting", categoryId: category.id, key: "painting", name: "Painting & Decorating", color: "#7C3AED", isDefault: false, sortOrder: 3 },
              { id: "opt-trade-flooring", categoryId: category.id, key: "flooring", name: "Flooring", color: "#059669", isDefault: false, sortOrder: 4 }
            ];
            break;
          case "selection.category":
            optionsToInsert = [
              { id: "opt-sel-fixtures", categoryId: category.id, key: "fixtures", name: "Fixtures & Fittings", color: "#8B5CF6", isDefault: true, sortOrder: 0 },
              { id: "opt-sel-finishes", categoryId: category.id, key: "finishes", name: "Finishes", color: "#EC4899", isDefault: false, sortOrder: 1 },
              { id: "opt-sel-appliances", categoryId: category.id, key: "appliances", name: "Appliances", color: "#F59E0B", isDefault: false, sortOrder: 2 }
            ];
            break;
          case "selection.room":
            optionsToInsert = [
              { id: "opt-room-kitchen", categoryId: category.id, key: "kitchen", name: "Kitchen", color: "#059669", isDefault: true, sortOrder: 0 },
              { id: "opt-room-living", categoryId: category.id, key: "living", name: "Living Room", color: "#DC2626", isDefault: false, sortOrder: 1 },
              { id: "opt-room-master", categoryId: category.id, key: "master-bedroom", name: "Master Bedroom", color: "#7C3AED", isDefault: false, sortOrder: 2 },
              { id: "opt-room-bathroom", categoryId: category.id, key: "main-bathroom", name: "Main Bathroom", color: "#06B6D4", isDefault: false, sortOrder: 3 },
              { id: "opt-room-ensuite", categoryId: category.id, key: "ensuite", name: "Ensuite", color: "#0891B2", isDefault: false, sortOrder: 4 },
              { id: "opt-room-laundry", categoryId: category.id, key: "laundry", name: "Laundry", color: "#65A30D", isDefault: false, sortOrder: 5 }
            ];
            break;
          case "estimate_item.unit":
            optionsToInsert = [
              { id: "opt-estimate-item-unit-ea", categoryId: category.id, key: "ea", name: "ea", color: "#6B7280", isDefault: true, sortOrder: 0 },
              { id: "opt-estimate-item-unit-m", categoryId: category.id, key: "m", name: "m", color: "#6B7280", isDefault: false, sortOrder: 1 },
              { id: "opt-estimate-item-unit-m2", categoryId: category.id, key: "m\xB2", name: "m\xB2", color: "#6B7280", isDefault: false, sortOrder: 2 },
              { id: "opt-estimate-item-unit-m3", categoryId: category.id, key: "m\xB3", name: "m\xB3", color: "#6B7280", isDefault: false, sortOrder: 3 },
              { id: "opt-estimate-item-unit-item", categoryId: category.id, key: "item", name: "item", color: "#6B7280", isDefault: false, sortOrder: 4 },
              { id: "opt-estimate-item-unit-hr", categoryId: category.id, key: "hr", name: "hr", color: "#6B7280", isDefault: false, sortOrder: 5 },
              { id: "opt-estimate-item-unit-day", categoryId: category.id, key: "day", name: "day", color: "#6B7280", isDefault: false, sortOrder: 6 },
              { id: "opt-estimate-item-unit-load", categoryId: category.id, key: "load", name: "load", color: "#6B7280", isDefault: false, sortOrder: 7 },
              { id: "opt-estimate-item-unit-tonne", categoryId: category.id, key: "tonne", name: "tonne", color: "#6B7280", isDefault: false, sortOrder: 8 },
              { id: "opt-estimate-item-unit-kg", categoryId: category.id, key: "kg", name: "kg", color: "#6B7280", isDefault: false, sortOrder: 9 },
              { id: "opt-estimate-item-unit-set", categoryId: category.id, key: "set", name: "set", color: "#6B7280", isDefault: false, sortOrder: 10 }
            ];
            break;
        }
        if (optionsToInsert.length > 0) {
          const optionsWithTimestamps = optionsToInsert.map((option) => ({
            ...option,
            isActive: true,
            createdAt: now,
            updatedAt: now
          }));
          await db.insert(fieldOptions).values(optionsWithTimestamps);
        }
      }
      async seedDefaultFieldCategories() {
        const now = /* @__PURE__ */ new Date();
        const defaultCategories = [
          {
            id: "cat-task-status",
            key: "task.status",
            label: "Task Statuses",
            entity: "task",
            description: "Status options for tasks",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 1,
            createdAt: now,
            updatedAt: now
          },
          {
            id: "cat-task-priority",
            key: "task.priority",
            label: "Task Priorities",
            entity: "task",
            description: "Priority levels for tasks",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 2,
            createdAt: now,
            updatedAt: now
          },
          {
            id: "cat-trade-types",
            key: "task.trade",
            label: "Trade Categories",
            entity: "task",
            description: "Construction trade categories",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 3,
            createdAt: now,
            updatedAt: now
          },
          {
            id: "cat-selection-categories",
            key: "selection.category",
            label: "Selection Categories",
            entity: "selection",
            description: "Categories for selections",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 4,
            createdAt: now,
            updatedAt: now
          },
          {
            id: "cat-location-rooms",
            key: "selection.room",
            label: "Locations/Rooms",
            entity: "selection",
            description: "Room/location options for selections",
            isBuiltIn: true,
            isActive: true,
            sortOrder: 5,
            createdAt: now,
            updatedAt: now
          }
        ];
        await db.insert(fieldCategories).values(defaultCategories);
        await this.seedDefaultFieldOptions(now);
      }
      async seedDefaultFieldOptions(now) {
        const fieldOptions2 = [
          // Task Status Options
          { id: "opt-status-todo", categoryId: "cat-task-status", key: "todo", name: "Not Started", color: "#6B7280", isDefault: true, sortOrder: 0 },
          { id: "opt-status-progress", categoryId: "cat-task-status", key: "in-progress", name: "In Progress", color: "#F59E0B", isDefault: false, sortOrder: 1 },
          { id: "opt-status-done", categoryId: "cat-task-status", key: "done", name: "Complete", color: "#10B981", isDefault: false, sortOrder: 2 },
          { id: "opt-status-hold", categoryId: "cat-task-status", key: "on-hold", name: "On Hold", color: "#EF4444", isDefault: false, sortOrder: 3 },
          // Task Priority Options
          { id: "opt-priority-low", categoryId: "cat-task-priority", key: "low", name: "Low", color: "#10B981", isDefault: false, sortOrder: 0 },
          { id: "opt-priority-medium", categoryId: "cat-task-priority", key: "medium", name: "Medium", color: "#F59E0B", isDefault: true, sortOrder: 1 },
          { id: "opt-priority-high", categoryId: "cat-task-priority", key: "high", name: "High", color: "#EF4444", isDefault: false, sortOrder: 2 },
          // Trade Categories
          { id: "opt-trade-electrical", categoryId: "cat-trade-types", key: "electrical", name: "Electrical", color: "#3B82F6", isDefault: true, sortOrder: 0 },
          { id: "opt-trade-plumbing", categoryId: "cat-trade-types", key: "plumbing", name: "Plumbing", color: "#06B6D4", isDefault: false, sortOrder: 1 },
          { id: "opt-trade-carpentry", categoryId: "cat-trade-types", key: "carpentry", name: "Carpentry", color: "#D97706", isDefault: false, sortOrder: 2 },
          { id: "opt-trade-painting", categoryId: "cat-trade-types", key: "painting", name: "Painting & Decorating", color: "#7C3AED", isDefault: false, sortOrder: 3 },
          { id: "opt-trade-flooring", categoryId: "cat-trade-types", key: "flooring", name: "Flooring", color: "#059669", isDefault: false, sortOrder: 4 },
          // Selection Categories
          { id: "opt-sel-fixtures", categoryId: "cat-selection-categories", key: "fixtures", name: "Fixtures & Fittings", color: "#8B5CF6", isDefault: true, sortOrder: 0 },
          { id: "opt-sel-finishes", categoryId: "cat-selection-categories", key: "finishes", name: "Finishes", color: "#EC4899", isDefault: false, sortOrder: 1 },
          { id: "opt-sel-appliances", categoryId: "cat-selection-categories", key: "appliances", name: "Appliances", color: "#F59E0B", isDefault: false, sortOrder: 2 },
          // Locations/Rooms
          { id: "opt-room-kitchen", categoryId: "cat-location-rooms", key: "kitchen", name: "Kitchen", color: "#059669", isDefault: true, sortOrder: 0 },
          { id: "opt-room-living", categoryId: "cat-location-rooms", key: "living", name: "Living Room", color: "#DC2626", isDefault: false, sortOrder: 1 },
          { id: "opt-room-master", categoryId: "cat-location-rooms", key: "master-bedroom", name: "Master Bedroom", color: "#7C3AED", isDefault: false, sortOrder: 2 },
          { id: "opt-room-bathroom", categoryId: "cat-location-rooms", key: "main-bathroom", name: "Main Bathroom", color: "#06B6D4", isDefault: false, sortOrder: 3 },
          { id: "opt-room-ensuite", categoryId: "cat-location-rooms", key: "ensuite", name: "Ensuite", color: "#0891B2", isDefault: false, sortOrder: 4 },
          { id: "opt-room-laundry", categoryId: "cat-location-rooms", key: "laundry", name: "Laundry", color: "#65A30D", isDefault: false, sortOrder: 5 }
        ];
        const fieldOptionsWithTimestamps = fieldOptions2.map((option) => ({
          ...option,
          isActive: true,
          createdAt: now,
          updatedAt: now
        }));
        await db.insert(fieldOptions).values(fieldOptionsWithTimestamps);
      }
      async seedDefaultCustomFields() {
        const now = /* @__PURE__ */ new Date();
        const defaultCustomFields = [
          {
            id: "cfd-task-custom-1",
            key: "task_custom_field_1",
            label: "Task Custom Field 1",
            type: "text",
            required: false,
            order: 1,
            isActive: true,
            createdAt: now,
            updatedAt: now
          }
        ];
        await db.insert(customFieldDefs).values(defaultCustomFields);
      }
      // User operations
      async getUser(id) {
        const [user] = await db.select().from(users).where(eq2(users.id, id)).limit(1);
        return user;
      }
      async getUserByUsername(username) {
        const [user] = await db.select().from(users).where(eq2(users.username, username)).limit(1);
        return user;
      }
      async getUserByEmail(email) {
        const [user] = await db.select().from(users).where(eq2(users.email, email)).limit(1);
        return user;
      }
      async validateUserCredentials(username, plainPassword) {
        const user = await this.getUserByUsername(username);
        if (!user) return void 0;
        const isValid = await PasswordUtils.verifyPassword(plainPassword, user.password);
        return isValid ? user : void 0;
      }
      async getUserWithRole(id) {
        const user = await this.getUser(id);
        if (!user) return void 0;
        let role;
        if (user.roleId) {
          role = await this.getUserRole(user.roleId);
        }
        return { ...user, role };
      }
      async createUser(insertUser) {
        const [user] = await db.insert(users).values(insertUser).returning();
        return user;
      }
      // Required for Replit Auth - upsert user based on Replit ID or email
      async upsertUser(userData) {
        console.log("\u{1F50D} [upsertUser] Input:", {
          id: userData.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName
        });
        if (userData.email) {
          const existingUser = await db.select().from(users).where(eq2(users.email, userData.email)).limit(1);
          console.log("\u{1F50D} [upsertUser] Existing user lookup:", {
            email: userData.email,
            found: existingUser.length > 0,
            existingId: existingUser[0]?.id,
            incomingId: userData.id,
            idsMatch: existingUser[0]?.id === userData.id
          });
          if (existingUser.length > 0 && existingUser[0].id !== userData.id) {
            console.log("\u2705 [upsertUser] Updating existing user by email");
            const [user2] = await db.update(users).set({
              firstName: userData.firstName,
              lastName: userData.lastName,
              profileImageUrl: userData.profileImageUrl,
              password: null,
              // Clear password since using Replit Auth
              updatedAt: /* @__PURE__ */ new Date()
            }).where(eq2(users.email, userData.email)).returning();
            console.log("\u2705 [upsertUser] Returned user:", { id: user2.id, email: user2.email, companyId: user2.companyId });
            return user2;
          }
        }
        console.log("\u{1F4DD} [upsertUser] No existing user by email, doing standard upsert by ID");
        const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
          target: users.id,
          set: {
            // Only update auth-specific fields, leave companyId/roleId intact
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: /* @__PURE__ */ new Date()
          }
        }).returning();
        console.log("\u{1F4DD} [upsertUser] Upserted user:", { id: user.id, email: user.email, companyId: user.companyId, isNew: !user.companyId });
        return user;
      }
      async updateUser(id, userData) {
        const [user] = await db.update(users).set({
          ...userData,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(users.id, id)).returning();
        return user;
      }
      async changeUserPassword(id, newPassword) {
        const hashedPassword = await PasswordUtils.hashPassword(newPassword);
        const [user] = await db.update(users).set({
          password: hashedPassword,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(users.id, id)).returning();
        return user;
      }
      async getUsers(category) {
        const whereConditions = category ? and(
          eq2(users.userCategory, category),
          eq2(users.isActive, true)
        ) : eq2(users.isActive, true);
        const results = await db.select({
          user: users,
          role: userRoles
        }).from(users).leftJoin(userRoles, eq2(users.roleId, userRoles.id)).where(whereConditions);
        return results.map(({ user, role }) => ({
          ...user,
          role: role || void 0
        }));
      }
      async getUserColumnPreferences(userId, pageKey) {
        const [preference] = await db.select().from(userColumnPreferences).where(
          and(
            eq2(userColumnPreferences.userId, userId),
            eq2(userColumnPreferences.pageKey, pageKey)
          )
        ).limit(1);
        return preference;
      }
      async saveUserColumnPreferences(preferences) {
        const existing = await this.getUserColumnPreferences(preferences.userId, preferences.pageKey);
        if (existing) {
          const [updated] = await db.update(userColumnPreferences).set({
            columnConfig: preferences.columnConfig,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq2(userColumnPreferences.id, existing.id)).returning();
          return updated;
        }
        const [newPreference] = await db.insert(userColumnPreferences).values(preferences).returning();
        return newPreference;
      }
      // Tasks CRUD operations
      async getTasks(projectId, status, businessTasks) {
        const conditions = [eq2(notes.type, "task")];
        if (businessTasks) {
          conditions.push(isNull(notes.projectId));
        } else if (projectId) {
          conditions.push(eq2(notes.projectId, projectId));
        }
        if (status) {
          conditions.push(eq2(notes.status, status));
        }
        const tasks = await db.select().from(notes).where(
          conditions.length === 1 ? conditions[0] : and(...conditions)
        );
        return tasks;
      }
      async getTasksByUser(userId, companyId) {
        const tasks = await db.select().from(notes).innerJoin(projects, eq2(notes.projectId, projects.id)).where(
          and(
            eq2(notes.type, "task"),
            eq2(projects.companyId, companyId),
            eq2(notes.assigneeId, userId)
          )
        ).orderBy(desc(notes.createdAt));
        return tasks.map((row) => row.notes);
      }
      async getTask(id) {
        const [task] = await db.select().from(notes).where(and(eq2(notes.id, id), eq2(notes.type, "task"))).limit(1);
        return task;
      }
      async createTask(insertTask) {
        const [task] = await db.insert(notes).values({
          ...insertTask,
          type: "task"
        }).returning();
        return task;
      }
      async updateTask(id, taskData) {
        const [task] = await db.update(notes).set({
          ...taskData,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(notes.id, id)).returning();
        return task;
      }
      async deleteTask(id) {
        const result = await db.delete(notes).where(eq2(notes.id, id));
        return result.rowCount > 0;
      }
      async updateTaskStatus(id, status) {
        const completedAt = status === "done" ? /* @__PURE__ */ new Date() : null;
        const [task] = await db.update(notes).set({
          status,
          completedAt,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(notes.id, id)).returning();
        return task;
      }
      // Selections CRUD
      async getSelections(projectId) {
        return await db.select().from(selections).where(eq2(selections.projectId, projectId));
      }
      async getSelection(id) {
        const [selection] = await db.select().from(selections).where(eq2(selections.id, id)).limit(1);
        return selection;
      }
      async getSelectionWithOptions(id) {
        const selection = await this.getSelection(id);
        if (!selection) return void 0;
        const options = await this.getSelectionOptions(id);
        return {
          ...selection,
          options
        };
      }
      async createSelection(insertSelection) {
        const [selection] = await db.insert(selections).values(insertSelection).returning();
        return selection;
      }
      async updateSelection(id, selectionData) {
        const [selection] = await db.update(selections).set({
          ...selectionData,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(selections.id, id)).returning();
        return selection;
      }
      async deleteSelection(id) {
        const result = await db.delete(selections).where(eq2(selections.id, id));
        return result.rowCount > 0;
      }
      // Selection Options CRUD
      async getSelectionOptions(selectionId) {
        return await db.select().from(selectionOptions).where(eq2(selectionOptions.selectionId, selectionId));
      }
      async getSelectionOption(id) {
        const [option] = await db.select().from(selectionOptions).where(eq2(selectionOptions.id, id)).limit(1);
        return option;
      }
      async createSelectionOption(insertOption) {
        const [option] = await db.insert(selectionOptions).values(insertOption).returning();
        return option;
      }
      async updateSelectionOption(id, optionData) {
        const [option] = await db.update(selectionOptions).set({
          ...optionData,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(selectionOptions.id, id)).returning();
        return option;
      }
      async deleteSelectionOption(id) {
        const result = await db.delete(selectionOptions).where(eq2(selectionOptions.id, id));
        return result.rowCount > 0;
      }
      // User Roles CRUD
      async getUserRoles(category, companyId) {
        try {
          const conditions = [];
          if (category) {
            conditions.push(eq2(userRoles.userCategory, category));
          }
          if (companyId) {
            conditions.push(eq2(userRoles.companyId, companyId));
          }
          if (conditions.length > 0) {
            return await db.select().from(userRoles).where(and(...conditions)).orderBy(asc(userRoles.displayOrder), asc(userRoles.name));
          }
          return await db.select().from(userRoles).orderBy(asc(userRoles.displayOrder), asc(userRoles.name));
        } catch (error) {
          console.error("Database error in getUserRoles:", error);
          throw error;
        }
      }
      async getUserRole(id, companyId) {
        try {
          const conditions = [eq2(userRoles.id, id)];
          if (companyId) {
            conditions.push(eq2(userRoles.companyId, companyId));
          }
          const results = await db.select().from(userRoles).where(and(...conditions)).limit(1);
          return results[0];
        } catch (error) {
          console.error("Database error in getUserRole:", error);
          throw error;
        }
      }
      async createUserRole(role) {
        try {
          let displayOrder = role.displayOrder;
          if (displayOrder === void 0 || displayOrder === null) {
            const maxResult = await db.select({ maxOrder: sql2`COALESCE(MAX(${userRoles.displayOrder}), -1)` }).from(userRoles).where(eq2(userRoles.companyId, role.companyId));
            displayOrder = (maxResult[0]?.maxOrder ?? -1) + 1;
          }
          const results = await db.insert(userRoles).values({ ...role, displayOrder }).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in createUserRole:", error);
          throw error;
        }
      }
      async updateUserRole(id, role, companyId) {
        try {
          const conditions = [eq2(userRoles.id, id)];
          if (companyId) {
            conditions.push(eq2(userRoles.companyId, companyId));
          }
          const results = await db.update(userRoles).set({ ...role, updatedAt: /* @__PURE__ */ new Date() }).where(and(...conditions)).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in updateUserRole:", error);
          throw error;
        }
      }
      async deleteUserRole(id, companyId) {
        try {
          const role = await this.getUserRole(id, companyId);
          if (!role) {
            return false;
          }
          if (role.isBuiltIn) {
            return false;
          }
          const userCount = await db.select({ count: sql2`COUNT(*)` }).from(users).where(and(
            eq2(users.roleId, id),
            eq2(users.isActive, true)
          ));
          if (userCount[0]?.count > 0) {
            return false;
          }
          const conditions = [eq2(userRoles.id, id)];
          if (companyId) {
            conditions.push(eq2(userRoles.companyId, companyId));
          }
          const results = await db.delete(userRoles).where(and(...conditions)).returning();
          return results.length > 0;
        } catch (error) {
          console.error("Database error in deleteUserRole:", error);
          throw error;
        }
      }
      async updateUserRolesOrder(updates, companyId) {
        try {
          await db.transaction(async (tx) => {
            for (const update of updates) {
              const conditions = [eq2(userRoles.id, update.id)];
              if (companyId) {
                conditions.push(eq2(userRoles.companyId, companyId));
              }
              await tx.update(userRoles).set({ displayOrder: update.displayOrder, updatedAt: /* @__PURE__ */ new Date() }).where(and(...conditions));
            }
          });
        } catch (error) {
          console.error("Database error in updateUserRolesOrder:", error);
          throw error;
        }
      }
      // Permissions CRUD
      async getPermissions(category) {
        try {
          if (category) {
            return await db.select().from(permissions).where(eq2(permissions.category, category)).orderBy(permissions.key);
          }
          return await db.select().from(permissions).orderBy(permissions.key);
        } catch (error) {
          console.error("Database error in getPermissions:", error);
          throw error;
        }
      }
      async getPermission(id) {
        try {
          const results = await db.select().from(permissions).where(eq2(permissions.id, id)).limit(1);
          return results[0];
        } catch (error) {
          console.error("Database error in getPermission:", error);
          throw error;
        }
      }
      async createPermission(permission) {
        try {
          const results = await db.insert(permissions).values(permission).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in createPermission:", error);
          throw error;
        }
      }
      async updatePermission(id, permission) {
        try {
          const results = await db.update(permissions).set({ ...permission, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(permissions.id, id)).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in updatePermission:", error);
          throw error;
        }
      }
      async deletePermission(id) {
        try {
          const results = await db.delete(permissions).where(eq2(permissions.id, id)).returning();
          return results.length > 0;
        } catch (error) {
          console.error("Database error in deletePermission:", error);
          throw error;
        }
      }
      // Role Permissions CRUD
      async getRolePermissions(roleId) {
        try {
          return await db.select().from(rolePermissions).where(eq2(rolePermissions.roleId, roleId));
        } catch (error) {
          console.error("Database error in getRolePermissions:", error);
          throw error;
        }
      }
      async createRolePermission(rolePermission) {
        try {
          const results = await db.insert(rolePermissions).values(rolePermission).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in createRolePermission:", error);
          throw error;
        }
      }
      async updateRolePermission(id, rolePermission) {
        try {
          const results = await db.update(rolePermissions).set({ ...rolePermission, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(rolePermissions.id, id)).returning();
          return results[0];
        } catch (error) {
          console.error("Database error in updateRolePermission:", error);
          throw error;
        }
      }
      async deleteRolePermission(id) {
        try {
          const results = await db.delete(rolePermissions).where(eq2(rolePermissions.id, id)).returning();
          return results.length > 0;
        } catch (error) {
          console.error("Database error in deleteRolePermission:", error);
          throw error;
        }
      }
      async setRolePermissions(roleId, permissions2) {
        try {
          await db.delete(rolePermissions).where(eq2(rolePermissions.roleId, roleId));
          if (permissions2.length > 0) {
            await db.insert(rolePermissions).values(permissions2.map((p) => ({
              roleId,
              permissionId: p.permissionId,
              allowedActions: p.allowedActions
            })));
          }
        } catch (error) {
          console.error("Database error in setRolePermissions:", error);
          throw error;
        }
      }
      async getUserProjectAccess(userId) {
        return [];
      }
      async createUserProjectAccess(access) {
        throw new Error("Not implemented");
      }
      async updateUserProjectAccess(id, access) {
        return void 0;
      }
      async deleteUserProjectAccess(id) {
        return false;
      }
      async grantProjectAccess(userId, projectId, accessLevel, grantedBy) {
        throw new Error("Not implemented");
      }
      async getUserInvitations(status) {
        return [];
      }
      async getUserInvitation(id) {
        return void 0;
      }
      async getUserInvitationByToken(token) {
        return void 0;
      }
      async createUserInvitation(invitation) {
        throw new Error("Not implemented");
      }
      async updateUserInvitation(id, invitation) {
        return void 0;
      }
      async deleteUserInvitation(id) {
        return false;
      }
      async acceptInvitation(token, userData) {
        return void 0;
      }
      async getNotes(projectId, companyId) {
        let query = db.select({
          id: notes.id,
          title: notes.title,
          content: notes.content,
          contentHtml: notes.contentHtml,
          contentText: notes.contentText,
          category: notes.category,
          priority: notes.priority,
          author: notes.author,
          ownerId: notes.ownerId,
          ownerName: notes.ownerName,
          visibility: notes.visibility,
          pinned: notes.pinned,
          customFields: notes.customFields,
          projectId: notes.projectId,
          type: notes.type,
          status: notes.status,
          assigneeId: notes.assigneeId,
          assigneeName: notes.assigneeName,
          dueDate: notes.dueDate,
          completedAt: notes.completedAt,
          tags: notes.tags,
          labels: notes.labels,
          parentTaskId: notes.parentTaskId,
          subtaskOrder: notes.subtaskOrder,
          recurringSettings: notes.recurringSettings,
          recurringParentId: notes.recurringParentId,
          templateId: notes.templateId,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt
        }).from(notes).leftJoin(projects, eq2(notes.projectId, projects.id));
        const conditions = [eq2(notes.type, "note")];
        if (projectId) {
          conditions.push(eq2(notes.projectId, projectId));
        }
        if (companyId) {
          conditions.push(eq2(projects.companyId, companyId));
        }
        const notes2 = await query.where(conditions.length === 1 ? conditions[0] : and(...conditions)).orderBy(desc(notes.createdAt));
        return notes2;
      }
      async getNote(id, companyId) {
        if (!companyId) {
          const result2 = await db.select().from(notes).where(eq2(notes.id, id));
          return result2[0];
        }
        const result = await db.select({
          id: notes.id,
          title: notes.title,
          content: notes.content,
          contentHtml: notes.contentHtml,
          contentText: notes.contentText,
          category: notes.category,
          priority: notes.priority,
          author: notes.author,
          ownerId: notes.ownerId,
          ownerName: notes.ownerName,
          visibility: notes.visibility,
          pinned: notes.pinned,
          customFields: notes.customFields,
          projectId: notes.projectId,
          type: notes.type,
          status: notes.status,
          assigneeId: notes.assigneeId,
          assigneeName: notes.assigneeName,
          dueDate: notes.dueDate,
          completedAt: notes.completedAt,
          tags: notes.tags,
          labels: notes.labels,
          parentTaskId: notes.parentTaskId,
          subtaskOrder: notes.subtaskOrder,
          recurringSettings: notes.recurringSettings,
          recurringParentId: notes.recurringParentId,
          templateId: notes.templateId,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt
        }).from(notes).leftJoin(projects, eq2(notes.projectId, projects.id)).where(and(
          eq2(notes.id, id),
          eq2(projects.companyId, companyId)
        ));
        return result[0];
      }
      async createNote(insertNote) {
        const now = /* @__PURE__ */ new Date();
        const noteData = {
          ...insertNote,
          category: insertNote.category || "General",
          priority: insertNote.priority || "medium",
          type: insertNote.type || "note",
          customFields: insertNote.customFields || {},
          tags: insertNote.tags || [],
          createdAt: now,
          updatedAt: now
        };
        const result = await db.insert(notes).values(noteData).returning();
        return result[0];
      }
      async updateNote(id, note) {
        const now = /* @__PURE__ */ new Date();
        const updateData = {
          ...note,
          updatedAt: now
        };
        const result = await db.update(notes).set(updateData).where(eq2(notes.id, id)).returning();
        return result[0];
      }
      async deleteNote(id) {
        const result = await db.delete(notes).where(eq2(notes.id, id)).returning({ id: notes.id });
        return result.length > 0;
      }
      async getCustomFieldDefs() {
        return [];
      }
      async getCustomFieldDef(id) {
        return void 0;
      }
      async createCustomFieldDef(fieldDef) {
        throw new Error("Not implemented");
      }
      async updateCustomFieldDef(id, fieldDef) {
        return void 0;
      }
      async deleteCustomFieldDef(id) {
        return false;
      }
      async getCustomFieldOptions(fieldDefId) {
        return [];
      }
      async getCustomFieldOption(id) {
        return void 0;
      }
      async createCustomFieldOption(option) {
        throw new Error("Not implemented");
      }
      async updateCustomFieldOption(id, option) {
        return void 0;
      }
      async deleteCustomFieldOption(id) {
        return false;
      }
      async getNoteTemplates(ownerId) {
        return [];
      }
      async getNoteTemplate(id) {
        return void 0;
      }
      async createNoteTemplate(template) {
        throw new Error("Not implemented");
      }
      async updateNoteTemplate(id, template) {
        return void 0;
      }
      async deleteNoteTemplate(id) {
        return false;
      }
      // Clients CRUD operations
      async getClients() {
        try {
          const clients2 = await db.select().from(clients).where(eq2(clients.isActive, true)).orderBy(clients.name);
          return clients2;
        } catch (error) {
          console.error("Database error in getClients:", error);
          return [];
        }
      }
      async getClient(id) {
        try {
          const [client2] = await db.select().from(clients).where(eq2(clients.id, id));
          return client2;
        } catch (error) {
          console.error("Database error in getClient:", error);
          return void 0;
        }
      }
      async createClient(client2) {
        try {
          const [newClient] = await db.insert(clients).values(client2).returning();
          return newClient;
        } catch (error) {
          console.error("Database error in createClient:", error);
          throw error;
        }
      }
      async updateClient(id, clientData) {
        try {
          const [updated] = await db.update(clients).set({ ...clientData, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(clients.id, id)).returning();
          return updated;
        } catch (error) {
          console.error("Database error in updateClient:", error);
          return void 0;
        }
      }
      async deleteClient(id) {
        try {
          await db.delete(clients).where(eq2(clients.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteClient:", error);
          return false;
        }
      }
      async getProjects(ownerId) {
        if (ownerId) {
          return await db.select().from(projects).where(
            and(
              eq2(projects.isActive, true),
              eq2(projects.ownerId, ownerId)
            )
          ).orderBy(projects.createdAt);
        } else {
          return await db.select().from(projects).where(eq2(projects.isActive, true)).orderBy(projects.createdAt);
        }
      }
      async getProject(id) {
        try {
          const result = await db.select().from(projects).where(eq2(projects.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getProject:", error);
          return void 0;
        }
      }
      async createProject(insertProject) {
        const id = randomUUID();
        const now = /* @__PURE__ */ new Date();
        const project = {
          ...insertProject,
          id,
          description: insertProject.description ?? null,
          jobNumber: insertProject.jobNumber ?? null,
          projectType: insertProject.projectType ?? null,
          clientId: insertProject.clientId ?? null,
          location: insertProject.location ?? null,
          projectStatus: insertProject.projectStatus ?? null,
          projectSubStatus: insertProject.projectSubStatus ?? null,
          clientBudget: insertProject.clientBudget ?? null,
          proposedStartDate: insertProject.proposedStartDate ?? null,
          proposedEndDate: insertProject.proposedEndDate ?? null,
          contractCost: insertProject.contractCost ?? null,
          selectedEstimateId: insertProject.selectedEstimateId ?? null,
          color: insertProject.color ?? null,
          icon: insertProject.icon ?? "Building2",
          ownerId: insertProject.ownerId ?? null,
          companyId: insertProject.companyId ?? null,
          isActive: insertProject.isActive ?? true,
          isArchived: insertProject.isArchived ?? false,
          invoicingMethod: insertProject.invoicingMethod ?? "progress_payments",
          createdAt: now,
          updatedAt: now
        };
        await db.insert(projects).values(project);
        console.log(`createProject: Successfully saved project ${project.name} to database`);
        return project;
      }
      async updateProject(id, updates) {
        try {
          const result = await db.update(projects).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(projects.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateProject:", error);
          return void 0;
        }
      }
      async deleteProject(id) {
        try {
          const result = await db.delete(projects).where(eq2(projects.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteProject:", error);
          return false;
        }
      }
      async getTaskViews(ownerId) {
        return [];
      }
      async getTaskView(id) {
        return void 0;
      }
      async createTaskView(view) {
        throw new Error("Not implemented");
      }
      async updateTaskView(id, view) {
        return void 0;
      }
      async deleteTaskView(id) {
        return false;
      }
      async getSubtasks(parentTaskId) {
        return [];
      }
      async createSubtask(parentTaskId, subtask) {
        throw new Error("Not implemented");
      }
      async getEstimates(projectId) {
        try {
          let query = db.select().from(estimates);
          if (projectId) {
            query = query.where(eq2(estimates.projectId, projectId));
          }
          const estimates2 = await query.orderBy(estimates.updatedAt);
          return estimates2;
        } catch (error) {
          console.error("Database error in getEstimates:", error);
          return [];
        }
      }
      async getEstimate(id) {
        try {
          const result = await db.select().from(estimates).where(eq2(estimates.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getEstimate:", error);
          return void 0;
        }
      }
      async createEstimate(insertEstimate) {
        try {
          const estimate = {
            ...insertEstimate,
            status: insertEstimate.status || "draft",
            version: 1,
            isLocked: false
          };
          const result = await db.insert(estimates).values(estimate).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createEstimate:", error);
          throw error;
        }
      }
      async updateEstimate(id, updateEstimate) {
        try {
          const estimate = await this.getEstimate(id);
          if (!estimate) {
            return void 0;
          }
          if (estimate.isLocked) {
            throw new Error("Cannot update locked estimate. Unlock the estimate first.");
          }
          const sanitizedUpdate = { ...updateEstimate };
          delete sanitizedUpdate.version;
          delete sanitizedUpdate.isLocked;
          const result = await db.update(estimates).set({ ...sanitizedUpdate, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(estimates.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateEstimate:", error);
          throw error;
        }
      }
      async deleteEstimate(id) {
        try {
          const estimate = await this.getEstimate(id);
          if (!estimate) {
            return false;
          }
          if (estimate.isLocked) {
            throw new Error("Cannot delete locked estimate. Unlock the estimate first.");
          }
          await db.delete(estimateItems).where(eq2(estimateItems.estimateId, id));
          await db.delete(estimateGroups).where(eq2(estimateGroups.estimateId, id));
          await db.delete(estimates).where(eq2(estimates.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteEstimate:", error);
          return false;
        }
      }
      async getEstimateItems(estimateId) {
        try {
          const items = await db.select().from(estimateItems).where(eq2(estimateItems.estimateId, estimateId)).orderBy(estimateItems.order);
          return items;
        } catch (error) {
          console.error("Database error in getEstimateItems:", error);
          return [];
        }
      }
      async getEstimateItem(id) {
        try {
          const result = await db.select().from(estimateItems).where(eq2(estimateItems.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getEstimateItem:", error);
          return void 0;
        }
      }
      async createEstimateItem(insertItem) {
        try {
          const estimate = await this.getEstimate(insertItem.estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot create item in locked estimate. Unlock the estimate first.");
          }
          const unitCostExTax = insertItem.unitCostExTax || 0;
          const taxRate = estimate?.taxRate || 10;
          const taxAmount = Math.round(unitCostExTax * taxRate / 100);
          const priceIncTax = unitCostExTax + taxAmount;
          const estimateItem = {
            ...insertItem,
            taxAmount,
            priceIncTax,
            type: insertItem.type || "Material",
            status: insertItem.status || "pending",
            order: insertItem.order || 0
          };
          const result = await db.insert(estimateItems).values(estimateItem).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createEstimateItem:", error);
          throw error;
        }
      }
      async bulkCreateEstimateItems(insertItems) {
        if (insertItems.length === 0) {
          return [];
        }
        try {
          const firstEstimateId = insertItems[0].estimateId;
          const estimate = await this.getEstimate(firstEstimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot create items in locked estimate. Unlock the estimate first.");
          }
          const taxRate = estimate?.taxRate || 10;
          const preparedItems = insertItems.map((insertItem) => {
            const unitCostExTax = insertItem.unitCostExTax || 0;
            const taxAmount = Math.round(unitCostExTax * taxRate / 100);
            const priceIncTax = unitCostExTax + taxAmount;
            return {
              ...insertItem,
              taxAmount,
              priceIncTax,
              type: insertItem.type || "Material",
              status: insertItem.status || "incomplete",
              order: insertItem.order || 0
            };
          });
          const result = await db.insert(estimateItems).values(preparedItems).returning();
          return result;
        } catch (error) {
          console.error("Database error in bulkCreateEstimateItems:", error);
          throw error;
        }
      }
      async updateEstimateItem(id, item) {
        try {
          const existingItem = await db.query.estimateItems.findFirst({
            where: eq2(estimateItems.id, id)
          });
          if (!existingItem) {
            return void 0;
          }
          const estimate = await this.getEstimate(existingItem.estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot update item in locked estimate. Unlock the estimate first.");
          }
          const updateData = { ...item };
          if (item.unitCostExTax !== void 0 || item.quantity !== void 0) {
            const taxRate = estimate?.taxRate || 10;
            const unitCostExTax = item.unitCostExTax !== void 0 ? item.unitCostExTax : existingItem.unitCostExTax;
            const quantity = item.quantity !== void 0 ? item.quantity : existingItem.quantity;
            const amountExTax = Math.round(unitCostExTax * quantity / 100);
            const taxAmount = Math.round(amountExTax * taxRate / 100);
            const amountIncTax = amountExTax + taxAmount;
            const priceIncTax = unitCostExTax + Math.round(unitCostExTax * taxRate / 100);
            updateData.taxAmount = taxAmount;
            updateData.priceIncTax = priceIncTax;
            updateData.amountExTax = amountExTax;
            updateData.amountIncTax = amountIncTax;
          }
          updateData.updatedAt = /* @__PURE__ */ new Date();
          const result = await db.update(estimateItems).set(updateData).where(eq2(estimateItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateEstimateItem:", error);
          throw error;
        }
      }
      async deleteEstimateItem(id) {
        try {
          const item = await db.query.estimateItems.findFirst({
            where: eq2(estimateItems.id, id)
          });
          if (!item) {
            return false;
          }
          const estimate = await this.getEstimate(item.estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot delete item in locked estimate. Unlock the estimate first.");
          }
          const result = await db.delete(estimateItems).where(eq2(estimateItems.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteEstimateItem:", error);
          throw error;
        }
      }
      async getProjectAllowances(projectId) {
        try {
          const estimates2 = await db.select().from(estimates).where(eq2(estimates.projectId, projectId));
          const estimateIds = estimates2.map((e) => e.id);
          if (estimateIds.length === 0) return [];
          const allowanceItems2 = await db.select().from(estimateItems).where(
            and(
              inArray(estimateItems.estimateId, estimateIds),
              or(
                eq2(estimateItems.allowance, "Prime Cost"),
                eq2(estimateItems.allowance, "Provisional Sum")
              )
            )
          );
          const allowancesWithCosts = await Promise.all(
            allowanceItems2.map(async (item) => {
              const estimate = estimates2.find((e) => e.id === item.estimateId);
              const billAllocations = await db.select({
                amount: billLineItemAllowances.amount
              }).from(billLineItemAllowances).where(eq2(billLineItemAllowances.estimateItemId, item.id));
              const billCost = billAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
              const timesheetAllocations = await db.select({
                amount: timesheetAllowances.amount
              }).from(timesheetAllowances).where(eq2(timesheetAllowances.estimateItemId, item.id));
              const timesheetCost = timesheetAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
              const actualCost = billCost + timesheetCost;
              const variance = actualCost - (item.priceIncTax || 0);
              return {
                item: {
                  ...item,
                  estimateName: estimate?.name || "Unknown",
                  estimateVersion: estimate?.version || 1
                },
                actualCost,
                variance
              };
            })
          );
          return allowancesWithCosts;
        } catch (error) {
          console.error("Database error in getProjectAllowances:", error);
          return [];
        }
      }
      async getEstimateGroups(estimateId) {
        try {
          const groups = await db.select().from(estimateGroups).where(eq2(estimateGroups.estimateId, estimateId)).orderBy(asc(estimateGroups.order));
          return groups;
        } catch (error) {
          console.error("Database error in getEstimateGroups:", error);
          return [];
        }
      }
      async getEstimateGroup(id) {
        try {
          const result = await db.select().from(estimateGroups).where(eq2(estimateGroups.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getEstimateGroup:", error);
          return void 0;
        }
      }
      async createEstimateGroup(insertGroup) {
        try {
          const estimate = await this.getEstimate(insertGroup.estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot create group in locked estimate. Unlock the estimate first.");
          }
          const result = await db.insert(estimateGroups).values(insertGroup).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createEstimateGroup:", error);
          throw error;
        }
      }
      async updateEstimateGroup(id, updateGroup) {
        try {
          const existingGroup = await db.query.estimateGroups.findFirst({
            where: eq2(estimateGroups.id, id)
          });
          if (!existingGroup) {
            return void 0;
          }
          const estimate = await this.getEstimate(existingGroup.estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot update group in locked estimate. Unlock the estimate first.");
          }
          const result = await db.update(estimateGroups).set({
            ...updateGroup,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq2(estimateGroups.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateEstimateGroup:", error);
          throw error;
        }
      }
      async deleteEstimateGroup(id) {
        try {
          const group = await db.select().from(estimateGroups).where(eq2(estimateGroups.id, id)).limit(1);
          if (!group[0]) {
            return false;
          }
          const estimate = await this.getEstimate(group[0].estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot delete group in locked estimate. Unlock the estimate first.");
          }
          await db.update(estimateItems).set({
            groupId: null,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq2(estimateItems.groupId, id));
          await db.delete(estimateGroups).where(eq2(estimateGroups.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteEstimateGroup:", error);
          throw error;
        }
      }
      async duplicateEstimateGroup(id) {
        try {
          const group = await db.select().from(estimateGroups).where(eq2(estimateGroups.id, id)).limit(1);
          if (!group[0]) {
            throw new Error("Group not found");
          }
          const estimate = await this.getEstimate(group[0].estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot duplicate group in locked estimate. Unlock the estimate first.");
          }
          const newGroupData = {
            ...group[0],
            id: void 0,
            name: `${group[0].name} (Copy)`,
            createdAt: void 0,
            updatedAt: void 0
          };
          const [newGroup] = await db.insert(estimateGroups).values(newGroupData).returning();
          const items = await db.select().from(estimateItems).where(eq2(estimateItems.groupId, id));
          for (const item of items) {
            const newItemData = {
              ...item,
              id: void 0,
              groupId: newGroup.id,
              createdAt: void 0,
              updatedAt: void 0
            };
            await db.insert(estimateItems).values(newItemData);
          }
          return newGroup;
        } catch (error) {
          console.error("Database error in duplicateEstimateGroup:", error);
          throw error;
        }
      }
      async copyGroupToEstimate(groupId, targetEstimateId) {
        try {
          const group = await db.select().from(estimateGroups).where(eq2(estimateGroups.id, groupId)).limit(1);
          if (!group[0]) {
            throw new Error("Group not found");
          }
          const targetEstimate = await this.getEstimate(targetEstimateId);
          if (!targetEstimate) {
            throw new Error("Target estimate not found");
          }
          if (targetEstimate.isLocked) {
            throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
          }
          const newGroupData = {
            ...group[0],
            id: void 0,
            estimateId: targetEstimateId,
            createdAt: void 0,
            updatedAt: void 0
          };
          const [newGroup] = await db.insert(estimateGroups).values(newGroupData).returning();
          const items = await db.select().from(estimateItems).where(eq2(estimateItems.groupId, groupId));
          for (const item of items) {
            const newItemData = {
              ...item,
              id: void 0,
              estimateId: targetEstimateId,
              groupId: newGroup.id,
              createdAt: void 0,
              updatedAt: void 0
            };
            await db.insert(estimateItems).values(newItemData);
          }
          return newGroup;
        } catch (error) {
          console.error("Database error in copyGroupToEstimate:", error);
          throw error;
        }
      }
      async duplicateEstimateItem(id) {
        try {
          const item = await db.select().from(estimateItems).where(eq2(estimateItems.id, id)).limit(1);
          if (!item[0]) {
            throw new Error("Item not found");
          }
          const estimate = await this.getEstimate(item[0].estimateId);
          if (estimate?.isLocked) {
            throw new Error("Cannot duplicate item in locked estimate. Unlock the estimate first.");
          }
          const newItemData = {
            ...item[0],
            id: void 0,
            name: `${item[0].name} (Copy)`,
            createdAt: void 0,
            updatedAt: void 0
          };
          const [newItem] = await db.insert(estimateItems).values(newItemData).returning();
          return newItem;
        } catch (error) {
          console.error("Database error in duplicateEstimateItem:", error);
          throw error;
        }
      }
      async copyItemToEstimate(itemId, targetEstimateId) {
        try {
          const item = await db.select().from(estimateItems).where(eq2(estimateItems.id, itemId)).limit(1);
          if (!item[0]) {
            throw new Error("Item not found");
          }
          const targetEstimate = await this.getEstimate(targetEstimateId);
          if (!targetEstimate) {
            throw new Error("Target estimate not found");
          }
          if (targetEstimate.isLocked) {
            throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
          }
          const newItemData = {
            ...item[0],
            id: void 0,
            estimateId: targetEstimateId,
            groupId: null,
            // Don't assign to a group in target estimate
            createdAt: void 0,
            updatedAt: void 0
          };
          const [newItem] = await db.insert(estimateItems).values(newItemData).returning();
          return newItem;
        } catch (error) {
          console.error("Database error in copyItemToEstimate:", error);
          throw error;
        }
      }
      // Cost Categories CRUD operations (company-specific)
      async getCostCategories(companyId) {
        try {
          return await db.select().from(costCategories).where(and(
            eq2(costCategories.companyId, companyId),
            eq2(costCategories.isActive, true)
          )).orderBy(costCategories.sortOrder);
        } catch (error) {
          console.error("Database error in getCostCategories:", error);
          throw error;
        }
      }
      async getCostCategory(id, companyId) {
        try {
          const result = await db.select().from(costCategories).where(and(
            eq2(costCategories.id, id),
            eq2(costCategories.companyId, companyId)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getCostCategory:", error);
          throw error;
        }
      }
      async createCostCategory(insertCategory) {
        try {
          const result = await db.insert(costCategories).values(insertCategory).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createCostCategory:", error);
          throw error;
        }
      }
      async updateCostCategory(id, updateCategory, companyId) {
        try {
          const result = await db.update(costCategories).set({
            ...updateCategory,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(and(
            eq2(costCategories.id, id),
            eq2(costCategories.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateCostCategory:", error);
          throw error;
        }
      }
      async deleteCostCategory(id, companyId) {
        try {
          await db.delete(costCategories).where(and(
            eq2(costCategories.id, id),
            eq2(costCategories.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteCostCategory:", error);
          return false;
        }
      }
      async archiveCostCategory(id, companyId) {
        try {
          const result = await db.update(costCategories).set({ isActive: false }).where(and(
            eq2(costCategories.id, id),
            eq2(costCategories.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in archiveCostCategory:", error);
          throw error;
        }
      }
      async mergeCostCategories(sourceId, targetId, companyId) {
        try {
          await db.update(costCodes).set({ categoryId: targetId }).where(and(
            eq2(costCodes.categoryId, sourceId),
            eq2(costCodes.companyId, companyId)
          ));
          await db.update(costCategories).set({ isActive: false }).where(and(
            eq2(costCategories.id, sourceId),
            eq2(costCategories.companyId, companyId)
          ));
        } catch (error) {
          console.error("Database error in mergeCostCategories:", error);
          throw error;
        }
      }
      // Cost Codes CRUD operations (company-specific)
      async getCostCodes(companyId) {
        try {
          return await db.select().from(costCodes).where(and(
            eq2(costCodes.companyId, companyId),
            eq2(costCodes.isActive, true)
          )).orderBy(costCodes.sortOrder);
        } catch (error) {
          console.error("Database error in getCostCodes:", error);
          throw error;
        }
      }
      async getCostCode(id, companyId) {
        try {
          const result = await db.select().from(costCodes).where(and(
            eq2(costCodes.id, id),
            eq2(costCodes.companyId, companyId)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getCostCode:", error);
          throw error;
        }
      }
      async createCostCode(insertCode) {
        try {
          const result = await db.insert(costCodes).values(insertCode).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createCostCode:", error);
          throw error;
        }
      }
      async updateCostCode(id, updateCode, companyId) {
        try {
          const result = await db.update(costCodes).set({
            ...updateCode,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(and(
            eq2(costCodes.id, id),
            eq2(costCodes.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateCostCode:", error);
          throw error;
        }
      }
      async deleteCostCode(id, companyId) {
        try {
          await db.delete(costCodes).where(and(
            eq2(costCodes.id, id),
            eq2(costCodes.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteCostCode:", error);
          return false;
        }
      }
      async archiveCostCode(id, companyId) {
        try {
          const result = await db.update(costCodes).set({
            isArchived: true,
            isActive: false,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(and(
            eq2(costCodes.id, id),
            eq2(costCodes.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in archiveCostCode:", error);
          throw error;
        }
      }
      async mergeCostCodes(sourceId, targetId, companyId) {
        try {
          await db.update(billLineItems).set({ costCodeId: targetId }).where(eq2(billLineItems.costCodeId, sourceId));
          await this.archiveCostCode(sourceId, companyId);
          return true;
        } catch (error) {
          console.error("Database error in mergeCostCodes:", error);
          return false;
        }
      }
      // Task Tags CRUD operations (company-specific)
      async getTaskTags(companyId) {
        try {
          return await db.select().from(taskTags).where(and(
            eq2(taskTags.companyId, companyId),
            eq2(taskTags.isActive, true)
          )).orderBy(taskTags.displayOrder);
        } catch (error) {
          console.error("Database error in getTaskTags:", error);
          throw error;
        }
      }
      async getTaskTag(id, companyId) {
        try {
          const result = await db.select().from(taskTags).where(and(
            eq2(taskTags.id, id),
            eq2(taskTags.companyId, companyId)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getTaskTag:", error);
          throw error;
        }
      }
      async createTaskTag(insertTag) {
        try {
          const result = await db.insert(taskTags).values(insertTag).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createTaskTag:", error);
          throw error;
        }
      }
      async updateTaskTag(id, updateTag, companyId) {
        try {
          const result = await db.update(taskTags).set({
            ...updateTag,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(and(
            eq2(taskTags.id, id),
            eq2(taskTags.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateTaskTag:", error);
          throw error;
        }
      }
      async deleteTaskTag(id, companyId) {
        try {
          await db.delete(taskTags).where(and(
            eq2(taskTags.id, id),
            eq2(taskTags.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteTaskTag:", error);
          return false;
        }
      }
      async updateTaskTagsOrder(updates, companyId) {
        try {
          for (const update of updates) {
            await db.update(taskTags).set({ displayOrder: update.displayOrder }).where(and(
              eq2(taskTags.id, update.id),
              eq2(taskTags.companyId, companyId)
            ));
          }
        } catch (error) {
          console.error("Database error in updateTaskTagsOrder:", error);
          throw error;
        }
      }
      // Task Template Statuses CRUD operations (company-specific)
      async getTaskTemplateStatuses(companyId) {
        try {
          return await db.select().from(taskTemplateStatuses).where(and(
            eq2(taskTemplateStatuses.companyId, companyId),
            eq2(taskTemplateStatuses.isActive, true)
          )).orderBy(taskTemplateStatuses.displayOrder);
        } catch (error) {
          console.error("Database error in getTaskTemplateStatuses:", error);
          throw error;
        }
      }
      async getTaskTemplateStatus(id, companyId) {
        try {
          const result = await db.select().from(taskTemplateStatuses).where(and(
            eq2(taskTemplateStatuses.id, id),
            eq2(taskTemplateStatuses.companyId, companyId)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getTaskTemplateStatus:", error);
          throw error;
        }
      }
      async createTaskTemplateStatus(insertStatus) {
        try {
          const result = await db.insert(taskTemplateStatuses).values(insertStatus).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createTaskTemplateStatus:", error);
          throw error;
        }
      }
      async updateTaskTemplateStatus(id, updateStatus, companyId) {
        try {
          const result = await db.update(taskTemplateStatuses).set({
            ...updateStatus,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(and(
            eq2(taskTemplateStatuses.id, id),
            eq2(taskTemplateStatuses.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateTaskTemplateStatus:", error);
          throw error;
        }
      }
      async deleteTaskTemplateStatus(id, companyId) {
        try {
          await db.delete(taskTemplateStatuses).where(and(
            eq2(taskTemplateStatuses.id, id),
            eq2(taskTemplateStatuses.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteTaskTemplateStatus:", error);
          return false;
        }
      }
      async updateTaskTemplateStatusesOrder(updates, companyId) {
        try {
          for (const update of updates) {
            await db.update(taskTemplateStatuses).set({ displayOrder: update.displayOrder }).where(and(
              eq2(taskTemplateStatuses.id, update.id),
              eq2(taskTemplateStatuses.companyId, companyId)
            ));
          }
        } catch (error) {
          console.error("Database error in updateTaskTemplateStatusesOrder:", error);
          throw error;
        }
      }
      async createEstimateVersion(estimateId, newVersionData) {
        throw new Error("Not implemented");
      }
      async lockEstimate(estimateId) {
        try {
          const result = await db.update(estimates).set({
            isLocked: true,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq2(estimates.id, estimateId)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in lockEstimate:", error);
          throw error;
        }
      }
      async unlockEstimate(estimateId) {
        try {
          const result = await db.update(estimates).set({
            isLocked: false,
            updatedAt: /* @__PURE__ */ new Date()
          }).where(eq2(estimates.id, estimateId)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in unlockEstimate:", error);
          throw error;
        }
      }
      async getEstimateSummary(estimateId) {
        try {
          const estimate = await this.getEstimate(estimateId);
          const items = await this.getEstimateItems(estimateId);
          let itemAmountsExTaxTotal = 0;
          items.forEach((item) => {
            const builderCost = Math.round(item.unitCostExTax * item.quantity / 100);
            if (item.taxAmount != null && item.priceIncTax != null) {
              const itemAmountExTax = item.priceIncTax - item.taxAmount;
              itemAmountsExTaxTotal += itemAmountExTax;
            } else {
              const markupPercent = item.markupPercent ?? 0;
              const markupAmount = Math.round(builderCost * markupPercent / 100);
              const itemAmountExTax = builderCost + markupAmount;
              itemAmountsExTaxTotal += itemAmountExTax;
            }
          });
          const globalMarkupPercent = estimate?.projectMarkupPercent ?? 0;
          const globalMarkupAmount = Math.round(itemAmountsExTaxTotal * globalMarkupPercent / 100);
          const totalAmountExTax = itemAmountsExTaxTotal + globalMarkupAmount;
          const taxRate = estimate?.taxRate ?? 10;
          const totalTax = Math.round(totalAmountExTax * taxRate / 100);
          const totalAmountIncTax = totalAmountExTax + totalTax;
          return {
            subtotal: itemAmountsExTaxTotal,
            // Sum of all line item amounts (ex tax, includes item markups)
            markupAmount: globalMarkupAmount,
            // Global markup applied to subtotal
            subtotalWithMarkup: totalAmountExTax,
            // Subtotal + global markup
            taxAmount: totalTax,
            // Tax on the total amount
            total: totalAmountIncTax,
            // Final total inc tax
            itemCount: items.length
          };
        } catch (error) {
          console.error("Database error in getEstimateSummary:", error);
          return { subtotal: 0, markupAmount: 0, subtotalWithMarkup: 0, taxAmount: 0, total: 0, itemCount: 0 };
        }
      }
      // Scope Items CRUD
      async getScopeItems(projectId) {
        try {
          const [project] = await db.select().from(projects).where(eq2(projects.id, projectId)).limit(1);
          if (!project) return [];
          const items = await db.select().from(scopeItems).where(and(
            eq2(scopeItems.projectId, projectId),
            eq2(scopeItems.companyId, project.companyId)
          )).orderBy(asc(scopeItems.displayOrder));
          return items;
        } catch (error) {
          console.error("Database error in getScopeItems:", error);
          return [];
        }
      }
      async getScopeItem(id) {
        try {
          const [item] = await db.select().from(scopeItems).where(eq2(scopeItems.id, id)).limit(1);
          return item;
        } catch (error) {
          console.error("Database error in getScopeItem:", error);
          return void 0;
        }
      }
      async createScopeItem(item) {
        const [newItem] = await db.insert(scopeItems).values(item).returning();
        return newItem;
      }
      async bulkCreateScopeItems(items) {
        if (items.length === 0) return [];
        const newItems = await db.insert(scopeItems).values(items).returning();
        return newItems;
      }
      async updateScopeItem(id, item) {
        try {
          const [updated] = await db.update(scopeItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(scopeItems.id, id)).returning();
          return updated;
        } catch (error) {
          console.error("Database error in updateScopeItem:", error);
          return void 0;
        }
      }
      async deleteScopeItem(id) {
        try {
          await db.delete(scopeItems).where(eq2(scopeItems.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteScopeItem:", error);
          return false;
        }
      }
      async reorderScopeItems(updates) {
        try {
          for (const update of updates) {
            await db.update(scopeItems).set({ displayOrder: update.displayOrder, parentId: update.parentId }).where(eq2(scopeItems.id, update.id));
          }
        } catch (error) {
          console.error("Database error in reorderScopeItems:", error);
        }
      }
      // Scope Stages CRUD
      async getScopeStages(projectId) {
        try {
          const [project] = await db.select().from(projects).where(eq2(projects.id, projectId)).limit(1);
          if (!project) return [];
          const stages = await db.select().from(scopeStages).where(and(
            eq2(scopeStages.projectId, projectId),
            eq2(scopeStages.companyId, project.companyId)
          )).orderBy(asc(scopeStages.displayOrder));
          return stages;
        } catch (error) {
          console.error("Database error in getScopeStages:", error);
          return [];
        }
      }
      async getScopeStage(id) {
        try {
          const [stage] = await db.select().from(scopeStages).where(eq2(scopeStages.id, id)).limit(1);
          return stage;
        } catch (error) {
          console.error("Database error in getScopeStage:", error);
          return void 0;
        }
      }
      async createScopeStage(stage) {
        const [newStage] = await db.insert(scopeStages).values(stage).returning();
        return newStage;
      }
      async updateScopeStage(id, stage) {
        try {
          const [updated] = await db.update(scopeStages).set({ ...stage, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(scopeStages.id, id)).returning();
          return updated;
        } catch (error) {
          console.error("Database error in updateScopeStage:", error);
          return void 0;
        }
      }
      async deleteScopeStage(id) {
        try {
          await db.delete(scopeStages).where(eq2(scopeStages.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteScopeStage:", error);
          return false;
        }
      }
      async reorderScopeStages(updates) {
        try {
          for (const update of updates) {
            await db.update(scopeStages).set({ displayOrder: update.displayOrder, parentId: update.parentId }).where(eq2(scopeStages.id, update.id));
          }
        } catch (error) {
          console.error("Database error in reorderScopeStages:", error);
        }
      }
      async initializeDefaultStages(projectId, companyId) {
        try {
          const defaultStages = ["Prelim", "Frame", "Lockup", "Fix", "Handover"];
          const stages = [];
          for (let i = 0; i < defaultStages.length; i++) {
            const [stage] = await db.insert(scopeStages).values({
              projectId,
              companyId,
              name: defaultStages[i],
              displayOrder: i
            }).returning();
            stages.push(stage);
          }
          return stages;
        } catch (error) {
          console.error("Database error in initializeDefaultStages:", error);
          return [];
        }
      }
      // Scope Templates CRUD
      async getScopeTemplates(companyId) {
        try {
          const templates = await db.select().from(scopeTemplates).where(eq2(scopeTemplates.companyId, companyId));
          return templates;
        } catch (error) {
          console.error("Database error in getScopeTemplates:", error);
          return [];
        }
      }
      async getScopeTemplate(id, companyId) {
        try {
          const [template] = await db.select().from(scopeTemplates).where(and(
            eq2(scopeTemplates.id, id),
            eq2(scopeTemplates.companyId, companyId)
          )).limit(1);
          return template;
        } catch (error) {
          console.error("Database error in getScopeTemplate:", error);
          return void 0;
        }
      }
      async createScopeTemplate(template) {
        const [newTemplate] = await db.insert(scopeTemplates).values(template).returning();
        return newTemplate;
      }
      async updateScopeTemplate(id, template, companyId) {
        try {
          const [updated] = await db.update(scopeTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(scopeTemplates.id, id),
            eq2(scopeTemplates.companyId, companyId)
          )).returning();
          return updated;
        } catch (error) {
          console.error("Database error in updateScopeTemplate:", error);
          return void 0;
        }
      }
      async deleteScopeTemplate(id, companyId) {
        try {
          await db.delete(scopeTemplates).where(and(
            eq2(scopeTemplates.id, id),
            eq2(scopeTemplates.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteScopeTemplate:", error);
          return false;
        }
      }
      async applyScopeTemplate(templateId, projectId) {
        try {
          const [template] = await db.select().from(scopeTemplates).where(eq2(scopeTemplates.id, templateId)).limit(1);
          if (!template) {
            throw new Error("Template not found");
          }
          const templateData = template.templateData;
          const itemsToCreate = templateData.map((data) => ({
            ...data,
            projectId,
            id: void 0,
            // Let database generate new IDs
            createdAt: void 0,
            updatedAt: void 0
          }));
          return await this.bulkCreateScopeItems(itemsToCreate);
        } catch (error) {
          console.error("Database error in applyScopeTemplate:", error);
          return [];
        }
      }
      // Scope Gear Photos CRUD
      async getScopeGearPhotos(scopeItemId) {
        try {
          const photos = await db.select().from(scopeGearPhotos).where(eq2(scopeGearPhotos.scopeItemId, scopeItemId));
          return photos;
        } catch (error) {
          console.error("Database error in getScopeGearPhotos:", error);
          return [];
        }
      }
      async createScopeGearPhoto(photo) {
        const [newPhoto] = await db.insert(scopeGearPhotos).values(photo).returning();
        return newPhoto;
      }
      async deleteScopeGearPhoto(id) {
        try {
          await db.delete(scopeGearPhotos).where(eq2(scopeGearPhotos.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteScopeGearPhoto:", error);
          return false;
        }
      }
      // Scope Integration Helpers
      async pushScopeToEstimate(scopeItemIds, estimateId) {
        try {
          const scopeItems2 = await db.select().from(scopeItems).where(inArray(scopeItems.id, scopeItemIds));
          const [estimate] = await db.select().from(estimates).where(eq2(estimates.id, estimateId)).limit(1);
          if (!estimate) {
            throw new Error("Estimate not found");
          }
          const estimateItems2 = scopeItems2.map((scopeItem, index2) => ({
            estimateId,
            groupId: null,
            description: scopeItem.description || scopeItem.title,
            costCodeId: scopeItem.costCodeId,
            costCodeTitle: scopeItem.costCodeTitle,
            quantity: 1,
            unit: "item",
            unitCost: 0,
            builderCost: 0,
            markup: estimate.markupPercentage || 0,
            clientPrice: 0,
            taxAmount: 0,
            displayOrder: index2
          }));
          const newItems = await this.bulkCreateEstimateItems(estimateItems2);
          for (let i = 0; i < scopeItems2.length; i++) {
            await db.update(scopeItems).set({ estimateItemId: newItems[i].id }).where(eq2(scopeItems.id, scopeItems2[i].id));
          }
          return newItems;
        } catch (error) {
          console.error("Database error in pushScopeToEstimate:", error);
          return [];
        }
      }
      async createRfqFromScope(scopeItemIds, projectId) {
        try {
          const [project] = await db.select().from(projects).where(eq2(projects.id, projectId)).limit(1);
          if (!project) {
            throw new Error("Project not found");
          }
          const scopeItems2 = await db.select().from(scopeItems).where(inArray(scopeItems.id, scopeItemIds));
          for (const item of scopeItems2) {
            if (item.projectId !== projectId || item.companyId !== project.companyId) {
              throw new Error("Unauthorized: Scope item does not belong to this project/company");
            }
          }
          if (scopeItems2.length !== scopeItemIds.length) {
            throw new Error("Some scope items not found");
          }
          const description = scopeItems2.map((item) => item.title).join("\n");
          const scope = scopeItems2.map((item) => `${item.title}
${item.description || ""}`).join("\n\n");
          const [rfq] = await db.insert(rfqs).values({
            projectId,
            title: "RFQ from Scope",
            description,
            scope,
            status: "draft",
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1e3)
            // 2 weeks from now
          }).returning();
          for (const scopeItem of scopeItems2) {
            await db.update(scopeItems).set({ rfqId: rfq.id }).where(eq2(scopeItems.id, scopeItem.id));
          }
          return rfq;
        } catch (error) {
          console.error("Database error in createRfqFromScope:", error);
          throw error;
        }
      }
      async createPoFromScope(scopeItemIds, projectId) {
        try {
          const [project] = await db.select().from(projects).where(eq2(projects.id, projectId)).limit(1);
          if (!project) {
            throw new Error("Project not found");
          }
          const scopeItems2 = await db.select().from(scopeItems).where(inArray(scopeItems.id, scopeItemIds));
          for (const item of scopeItems2) {
            if (item.projectId !== projectId || item.companyId !== project.companyId) {
              throw new Error("Unauthorized: Scope item does not belong to this project/company");
            }
          }
          if (scopeItems2.length !== scopeItemIds.length) {
            throw new Error("Some scope items not found");
          }
          const result = await db.transaction(async (tx) => {
            await tx.execute(sql2`SELECT pg_advisory_xact_lock(hashtext(${project.companyId}))`);
            const existingPos = await tx.select({ poNumber: (void 0).poNumber }).from(void 0).where(eq2((void 0).companyId, project.companyId)).orderBy(sql2`${(void 0).poNumber} DESC`).limit(1);
            let nextNumber = 1;
            if (existingPos.length > 0 && existingPos[0].poNumber) {
              const match = existingPos[0].poNumber.match(/PO-(\d+)/);
              if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
              }
            }
            const poNumber = `PO-${String(nextNumber).padStart(4, "0")}`;
            const description = scopeItems2.map((item) => `${item.title}
${item.description || ""}`).join("\n\n");
            const [po] = await tx.insert(void 0).values({
              projectId,
              companyId: project.companyId,
              poNumber,
              title: "PO from Scope",
              description,
              status: "draft",
              total: 0
            }).returning();
            for (const scopeItem of scopeItems2) {
              await tx.update(scopeItems).set({ poId: po.id }).where(eq2(scopeItems.id, scopeItem.id));
            }
            return po;
          });
          return result;
        } catch (error) {
          console.error("Database error in createPoFromScope:", error);
          throw error;
        }
      }
      async linkScopeToScheduleItem(scopeItemId, scheduleItemId) {
        try {
          const [updated] = await db.update(scopeItems).set({ scheduleItemId }).where(eq2(scopeItems.id, scopeItemId)).returning();
          return updated;
        } catch (error) {
          console.error("Database error in linkScopeToScheduleItem:", error);
          return void 0;
        }
      }
      // Company CRUD
      async getCompany(id) {
        const [company] = await db.select().from(companies).where(eq2(companies.id, id)).limit(1);
        return company;
      }
      async createCompany(company, ownerId) {
        const [newCompany] = await db.insert(companies).values({
          ...company,
          ownerId,
          isActive: true
        }).returning();
        await db.update(users).set({ companyId: newCompany.id, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(users.id, ownerId));
        return newCompany;
      }
      async updateCompany(id, company) {
        const [updated] = await db.update(companies).set({ ...company, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(companies.id, id)).returning();
        return updated;
      }
      async getCompanySettings() {
        const [settings] = await db.select().from(companySettings).limit(1);
        return settings;
      }
      async updateCompanySettings(settings) {
        const existing = await this.getCompanySettings();
        if (existing) {
          const [updated] = await db.update(companySettings).set({ ...settings, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(companySettings.id, existing.id)).returning();
          return updated;
        } else {
          const [created] = await db.insert(companySettings).values(settings).returning();
          return created;
        }
      }
      async getSystemConfiguration() {
        const [config] = await db.select().from(systemConfiguration).limit(1);
        return config;
      }
      async updateSystemConfiguration(config) {
        const existing = await this.getSystemConfiguration();
        if (existing) {
          const [updated] = await db.update(systemConfiguration).set({ ...config, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(systemConfiguration.id, existing.id)).returning();
          return updated;
        } else {
          const [created] = await db.insert(systemConfiguration).values(config).returning();
          return created;
        }
      }
      async getFieldCategories() {
        return await db.select().from(fieldCategories).where(eq2(fieldCategories.isActive, true)).orderBy(fieldCategories.sortOrder);
      }
      async getFieldCategory(id) {
        const [category] = await db.select().from(fieldCategories).where(eq2(fieldCategories.id, id)).limit(1);
        return category;
      }
      async getFieldCategoryByKey(key) {
        const [category] = await db.select().from(fieldCategories).where(eq2(fieldCategories.key, key)).limit(1);
        return category;
      }
      async getFieldCategoryWithOptions(key) {
        const category = await this.getFieldCategoryByKey(key);
        if (!category) return void 0;
        const options = await this.getFieldOptions(category.id);
        return {
          ...category,
          options
        };
      }
      async createFieldCategory(category) {
        throw new Error("Not implemented");
      }
      async updateFieldCategory(id, category) {
        return void 0;
      }
      async deleteFieldCategory(id) {
        return false;
      }
      async getFieldOptions(categoryId) {
        return await db.select().from(fieldOptions).where(and(
          eq2(fieldOptions.categoryId, categoryId),
          eq2(fieldOptions.isActive, true)
        )).orderBy(fieldOptions.sortOrder);
      }
      async getFieldOption(id) {
        const [option] = await db.select().from(fieldOptions).where(eq2(fieldOptions.id, id)).limit(1);
        return option;
      }
      async createFieldOption(option) {
        const [created] = await db.insert(fieldOptions).values({
          ...option,
          id: randomUUID(),
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date()
        }).returning();
        return created;
      }
      async updateFieldOption(id, option) {
        const [updated] = await db.update(fieldOptions).set({
          ...option,
          updatedAt: /* @__PURE__ */ new Date()
        }).where(eq2(fieldOptions.id, id)).returning();
        return updated;
      }
      async deleteFieldOption(id) {
        const result = await db.delete(fieldOptions).where(eq2(fieldOptions.id, id));
        return result.rowCount ? result.rowCount > 0 : false;
      }
      async setCategoryOptions(categoryId, options) {
        try {
          await db.delete(fieldOptions).where(eq2(fieldOptions.categoryId, categoryId));
          if (options.length === 0) {
            return [];
          }
          const now = /* @__PURE__ */ new Date();
          const hasDefault = options.some((opt) => opt.isDefault);
          const newOptions = options.map((optData, index2) => ({
            id: optData.id || randomUUID(),
            categoryId,
            key: optData.key,
            name: optData.name,
            color: optData.color || "#6B7280",
            isActive: optData.isActive !== false,
            // Default to true
            isDefault: hasDefault ? optData.isDefault === true : index2 === 0,
            // First option is default if none specified
            sortOrder: optData.sortOrder !== void 0 ? optData.sortOrder : index2,
            createdAt: optData.createdAt || now,
            updatedAt: now
          }));
          const createdOptions = await db.insert(fieldOptions).values(newOptions).returning();
          return createdOptions;
        } catch (error) {
          console.error("Database error in setCategoryOptions:", error);
          throw error;
        }
      }
      async getOptionAttachments(optionId) {
        return [];
      }
      async createOptionAttachment(attachment) {
        throw new Error("Not implemented");
      }
      async deleteOptionAttachment(id) {
        return false;
      }
      async getClientSelections(projectId) {
        return [];
      }
      async createClientSelection(selection) {
        throw new Error("Not implemented");
      }
      async deleteClientSelection(id) {
        return false;
      }
      async getSuppliers(projectId) {
        try {
          if (projectId) {
            return await db.select().from(suppliers).where(eq2(suppliers.projectId, projectId));
          }
          return await db.select().from(suppliers);
        } catch (error) {
          console.error("Database error in getSuppliers:", error);
          throw error;
        }
      }
      async getSupplierById(id) {
        try {
          const suppliers2 = await db.select().from(suppliers).where(eq2(suppliers.id, id));
          return suppliers2[0] || null;
        } catch (error) {
          console.error("Database error in getSupplierById:", error);
          throw error;
        }
      }
      async createSupplier(supplier) {
        try {
          const newSuppliers = await db.insert(suppliers).values(supplier).returning();
          return newSuppliers[0];
        } catch (error) {
          console.error("Database error in createSupplier:", error);
          throw error;
        }
      }
      async updateSupplier(id, supplier) {
        try {
          const updatedSuppliers = await db.update(suppliers).set({ ...supplier, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(suppliers.id, id)).returning();
          if (!updatedSuppliers[0]) {
            throw new Error("Supplier not found");
          }
          return updatedSuppliers[0];
        } catch (error) {
          console.error("Database error in updateSupplier:", error);
          throw error;
        }
      }
      async deleteSupplier(id) {
        try {
          await db.delete(suppliers).where(eq2(suppliers.id, id));
        } catch (error) {
          console.error("Database error in deleteSupplier:", error);
          throw error;
        }
      }
      async getContacts(contactType) {
        try {
          if (contactType) {
            return await db.select().from(contacts).where(eq2(contacts.contactType, contactType));
          }
          return await db.select().from(contacts);
        } catch (error) {
          console.error("Database error in getContacts:", error);
          throw error;
        }
      }
      async getContact(id) {
        try {
          const contacts2 = await db.select().from(contacts).where(eq2(contacts.id, id));
          return contacts2[0];
        } catch (error) {
          console.error("Database error in getContact:", error);
          throw error;
        }
      }
      async createContact(contact) {
        try {
          const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "";
          const newContacts = await db.insert(contacts).values({ ...contact, name }).returning();
          return newContacts[0];
        } catch (error) {
          console.error("Database error in createContact:", error);
          throw error;
        }
      }
      async updateContact(id, contact) {
        try {
          let updateData = { ...contact, updatedAt: /* @__PURE__ */ new Date() };
          if (contact.firstName !== void 0 || contact.lastName !== void 0) {
            const existing = await this.getContact(id);
            if (existing) {
              const firstName = contact.firstName !== void 0 ? contact.firstName : existing.firstName;
              const lastName = contact.lastName !== void 0 ? contact.lastName : existing.lastName;
              const trimmedFirst = (firstName || "").trim();
              const trimmedLast = (lastName || "").trim();
              if (trimmedFirst || trimmedLast) {
                updateData.name = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
              }
            }
          }
          const updatedContacts = await db.update(contacts).set(updateData).where(eq2(contacts.id, id)).returning();
          return updatedContacts[0];
        } catch (error) {
          console.error("Database error in updateContact:", error);
          throw error;
        }
      }
      async archiveContact(id) {
        try {
          const archivedContacts = await db.update(contacts).set({ isArchived: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(contacts.id, id)).returning();
          return archivedContacts[0];
        } catch (error) {
          console.error("Database error in archiveContact:", error);
          throw error;
        }
      }
      async restoreContact(id) {
        try {
          const restoredContacts = await db.update(contacts).set({ isArchived: false, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(contacts.id, id)).returning();
          return restoredContacts[0];
        } catch (error) {
          console.error("Database error in restoreContact:", error);
          throw error;
        }
      }
      // RFQ Methods
      async getRFQs(companyId, projectId) {
        try {
          const conditions = [eq2(rfqs.companyId, companyId)];
          if (projectId) {
            conditions.push(eq2(rfqs.projectId, projectId));
          }
          const rfqs2 = await db.select().from(rfqs).where(and(...conditions)).orderBy(desc(rfqs.createdAt));
          return rfqs2;
        } catch (error) {
          console.error("Database error in getRFQs:", error);
          throw error;
        }
      }
      async getRFQ(id) {
        try {
          const rfqs2 = await db.select().from(rfqs).where(eq2(rfqs.id, id));
          return rfqs2[0];
        } catch (error) {
          console.error("Database error in getRFQ:", error);
          throw error;
        }
      }
      async createRFQ(rfq) {
        try {
          const newRfqs = await db.insert(rfqs).values(rfq).returning();
          return newRfqs[0];
        } catch (error) {
          console.error("Database error in createRFQ:", error);
          throw error;
        }
      }
      async updateRFQ(id, rfq) {
        try {
          const updatedRfqs = await db.update(rfqs).set({ ...rfq, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(rfqs.id, id)).returning();
          return updatedRfqs[0];
        } catch (error) {
          console.error("Database error in updateRFQ:", error);
          throw error;
        }
      }
      async deleteRFQ(id) {
        try {
          await db.delete(rfqItems).where(eq2(rfqItems.rfqId, id));
          const deletedRfqs = await db.delete(rfqs).where(eq2(rfqs.id, id)).returning();
          return deletedRfqs.length > 0;
        } catch (error) {
          console.error("Database error in deleteRFQ:", error);
          throw error;
        }
      }
      // RFQ Items Methods
      async getRFQItems(rfqId) {
        try {
          const items = await db.select().from(rfqItems).where(eq2(rfqItems.rfqId, rfqId)).orderBy(asc(rfqItems.displayOrder));
          return items;
        } catch (error) {
          console.error("Database error in getRFQItems:", error);
          throw error;
        }
      }
      async createRFQItem(item) {
        try {
          const newItems = await db.insert(rfqItems).values(item).returning();
          return newItems[0];
        } catch (error) {
          console.error("Database error in createRFQItem:", error);
          throw error;
        }
      }
      async deleteRFQItem(id) {
        try {
          const deletedItems = await db.delete(rfqItems).where(eq2(rfqItems.id, id)).returning();
          return deletedItems.length > 0;
        } catch (error) {
          console.error("Database error in deleteRFQItem:", error);
          throw error;
        }
      }
      // RFQ Quotes Methods
      async getRFQQuotes(rfqId) {
        try {
          const quotes = await db.select().from(rfqQuotes).where(eq2(rfqQuotes.rfqId, rfqId)).orderBy(asc(rfqQuotes.createdAt));
          return quotes;
        } catch (error) {
          console.error("Database error in getRFQQuotes:", error);
          throw error;
        }
      }
      async getRFQQuote(id) {
        try {
          const quotes = await db.select().from(rfqQuotes).where(eq2(rfqQuotes.id, id));
          return quotes[0];
        } catch (error) {
          console.error("Database error in getRFQQuote:", error);
          throw error;
        }
      }
      async createRFQQuote(quote) {
        try {
          const newQuotes = await db.insert(rfqQuotes).values(quote).returning();
          return newQuotes[0];
        } catch (error) {
          console.error("Database error in createRFQQuote:", error);
          throw error;
        }
      }
      async updateRFQQuote(id, quote) {
        try {
          const updatedQuotes = await db.update(rfqQuotes).set({ ...quote, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(rfqQuotes.id, id)).returning();
          return updatedQuotes[0];
        } catch (error) {
          console.error("Database error in updateRFQQuote:", error);
          throw error;
        }
      }
      async deleteRFQQuote(id) {
        try {
          const deletedQuotes = await db.delete(rfqQuotes).where(eq2(rfqQuotes.id, id)).returning();
          return deletedQuotes.length > 0;
        } catch (error) {
          console.error("Database error in deleteRFQQuote:", error);
          throw error;
        }
      }
      // RFQ Follow-ups Methods
      async getRFQFollowUps(rfqId) {
        try {
          const followUps = await db.select().from(rfqFollowUps).where(eq2(rfqFollowUps.rfqId, rfqId)).orderBy(asc(rfqFollowUps.scheduledFor));
          return followUps;
        } catch (error) {
          console.error("Database error in getRFQFollowUps:", error);
          throw error;
        }
      }
      async createRFQFollowUp(followUp) {
        try {
          const newFollowUps = await db.insert(rfqFollowUps).values(followUp).returning();
          return newFollowUps[0];
        } catch (error) {
          console.error("Database error in createRFQFollowUp:", error);
          throw error;
        }
      }
      async updateRFQFollowUp(id, followUp) {
        try {
          const updatedFollowUps = await db.update(rfqFollowUps).set(followUp).where(eq2(rfqFollowUps.id, id)).returning();
          return updatedFollowUps[0];
        } catch (error) {
          console.error("Database error in updateRFQFollowUp:", error);
          throw error;
        }
      }
      async deleteRFQFollowUp(id) {
        try {
          const deletedFollowUps = await db.delete(rfqFollowUps).where(eq2(rfqFollowUps.id, id)).returning();
          return deletedFollowUps.length > 0;
        } catch (error) {
          console.error("Database error in deleteRFQFollowUp:", error);
          throw error;
        }
      }
      async getBills(projectId, status) {
        try {
          let query = db.select().from(bills);
          const conditions = [];
          if (projectId) {
            conditions.push(eq2(bills.projectId, projectId));
          }
          if (status) {
            conditions.push(eq2(bills.status, status));
          }
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          return await query.orderBy(desc(bills.createdAt));
        } catch (error) {
          console.error("Database error in getBills:", error);
          throw error;
        }
      }
      async getBillById(id) {
        try {
          const bills2 = await db.select().from(bills).where(eq2(bills.id, id));
          return bills2[0] || null;
        } catch (error) {
          console.error("Database error in getBillById:", error);
          throw error;
        }
      }
      async createBill(bill) {
        try {
          const newBills = await db.insert(bills).values(bill).returning();
          return newBills[0];
        } catch (error) {
          console.error("Database error in createBill:", error);
          throw error;
        }
      }
      async updateBill(id, bill) {
        try {
          const updatedBills = await db.update(bills).set({ ...bill, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(bills.id, id)).returning();
          if (!updatedBills[0]) {
            throw new Error("Bill not found");
          }
          return updatedBills[0];
        } catch (error) {
          console.error("Database error in updateBill:", error);
          throw error;
        }
      }
      async deleteBill(id) {
        try {
          await db.delete(bills).where(eq2(bills.id, id));
        } catch (error) {
          console.error("Database error in deleteBill:", error);
          throw error;
        }
      }
      async getBillLineItems(billId) {
        try {
          return await db.select().from(billLineItems).where(eq2(billLineItems.billId, billId)).orderBy(billLineItems.order);
        } catch (error) {
          console.error("Database error in getBillLineItems:", error);
          throw error;
        }
      }
      async createBillLineItem(item) {
        try {
          const newItems = await db.insert(billLineItems).values(item).returning();
          return newItems[0];
        } catch (error) {
          console.error("Database error in createBillLineItem:", error);
          throw error;
        }
      }
      async updateBillLineItem(id, item) {
        try {
          const updatedItems = await db.update(billLineItems).set(item).where(eq2(billLineItems.id, id)).returning();
          if (!updatedItems[0]) {
            throw new Error("Bill line item not found");
          }
          return updatedItems[0];
        } catch (error) {
          console.error("Database error in updateBillLineItem:", error);
          throw error;
        }
      }
      async deleteBillLineItem(id) {
        try {
          await db.delete(billLineItems).where(eq2(billLineItems.id, id));
        } catch (error) {
          console.error("Database error in deleteBillLineItem:", error);
          throw error;
        }
      }
      async getBillLineItemAllowances(billLineItemId) {
        try {
          const allowances = await db.select().from(billLineItemAllowances).where(eq2(billLineItemAllowances.billLineItemId, billLineItemId));
          return allowances;
        } catch (error) {
          console.error("Database error in getBillLineItemAllowances:", error);
          throw error;
        }
      }
      async getBillLineItemAllowancesByBillId(billId) {
        try {
          const allowances = await db.select({
            id: billLineItemAllowances.id,
            billLineItemId: billLineItemAllowances.billLineItemId,
            estimateItemId: billLineItemAllowances.estimateItemId,
            amount: billLineItemAllowances.amount,
            createdAt: billLineItemAllowances.createdAt
          }).from(billLineItemAllowances).innerJoin(billLineItems, eq2(billLineItemAllowances.billLineItemId, billLineItems.id)).where(eq2(billLineItems.billId, billId));
          return allowances;
        } catch (error) {
          console.error("Database error in getBillLineItemAllowancesByBillId:", error);
          throw error;
        }
      }
      async createBillLineItemAllowance(allowance) {
        try {
          const [newAllowance] = await db.insert(billLineItemAllowances).values(allowance).returning();
          return newAllowance;
        } catch (error) {
          console.error("Database error in createBillLineItemAllowance:", error);
          throw error;
        }
      }
      async updateBillLineItemAllowance(id, allowance) {
        try {
          const [updatedAllowance] = await db.update(billLineItemAllowances).set(allowance).where(eq2(billLineItemAllowances.id, id)).returning();
          return updatedAllowance;
        } catch (error) {
          console.error("Database error in updateBillLineItemAllowance:", error);
          throw error;
        }
      }
      async deleteBillLineItemAllowance(id) {
        try {
          await db.delete(billLineItemAllowances).where(eq2(billLineItemAllowances.id, id));
        } catch (error) {
          console.error("Database error in deleteBillLineItemAllowance:", error);
          throw error;
        }
      }
      async deleteBillLineItemAllowancesByLineItemId(billLineItemId) {
        try {
          await db.delete(billLineItemAllowances).where(eq2(billLineItemAllowances.billLineItemId, billLineItemId));
        } catch (error) {
          console.error("Database error in deleteBillLineItemAllowancesByLineItemId:", error);
          throw error;
        }
      }
      async getTimesheetAllowances(timesheetId) {
        try {
          const allowances = await db.select().from(timesheetAllowances).where(eq2(timesheetAllowances.timesheetId, timesheetId));
          return allowances;
        } catch (error) {
          console.error("Database error in getTimesheetAllowances:", error);
          throw error;
        }
      }
      async getTimesheetAllowancesByProject(projectId) {
        try {
          const allowances = await db.select({
            id: timesheetAllowances.id,
            timesheetId: timesheetAllowances.timesheetId,
            estimateItemId: timesheetAllowances.estimateItemId,
            hours: timesheetAllowances.hours,
            amount: timesheetAllowances.amount,
            createdAt: timesheetAllowances.createdAt
          }).from(timesheetAllowances).innerJoin(timesheets, eq2(timesheetAllowances.timesheetId, timesheets.id)).where(eq2(timesheets.projectId, projectId));
          return allowances;
        } catch (error) {
          console.error("Database error in getTimesheetAllowancesByProject:", error);
          throw error;
        }
      }
      async createTimesheetAllowance(allowance) {
        try {
          const [newAllowance] = await db.insert(timesheetAllowances).values(allowance).returning();
          return newAllowance;
        } catch (error) {
          console.error("Database error in createTimesheetAllowance:", error);
          throw error;
        }
      }
      async updateTimesheetAllowance(id, allowance) {
        try {
          const [updatedAllowance] = await db.update(timesheetAllowances).set(allowance).where(eq2(timesheetAllowances.id, id)).returning();
          return updatedAllowance;
        } catch (error) {
          console.error("Database error in updateTimesheetAllowance:", error);
          throw error;
        }
      }
      async deleteTimesheetAllowance(id) {
        try {
          await db.delete(timesheetAllowances).where(eq2(timesheetAllowances.id, id));
        } catch (error) {
          console.error("Database error in deleteTimesheetAllowance:", error);
          throw error;
        }
      }
      async deleteTimesheetAllowancesByTimesheetId(timesheetId) {
        try {
          await db.delete(timesheetAllowances).where(eq2(timesheetAllowances.timesheetId, timesheetId));
        } catch (error) {
          console.error("Database error in deleteTimesheetAllowancesByTimesheetId:", error);
          throw error;
        }
      }
      async getAllowanceItems(estimateItemId) {
        try {
          const items = await db.select().from(allowanceItems).where(eq2(allowanceItems.estimateItemId, estimateItemId)).orderBy(allowanceItems.sortOrder);
          return items;
        } catch (error) {
          console.error("Database error in getAllowanceItems:", error);
          throw error;
        }
      }
      async createAllowanceItem(item) {
        try {
          const [newItem] = await db.insert(allowanceItems).values(item).returning();
          return newItem;
        } catch (error) {
          console.error("Database error in createAllowanceItem:", error);
          throw error;
        }
      }
      async updateAllowanceItem(id, item) {
        try {
          const [updated] = await db.update(allowanceItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(allowanceItems.id, id)).returning();
          return updated;
        } catch (error) {
          console.error("Database error in updateAllowanceItem:", error);
          throw error;
        }
      }
      async deleteAllowanceItem(id) {
        try {
          await db.delete(allowanceItems).where(eq2(allowanceItems.id, id));
        } catch (error) {
          console.error("Database error in deleteAllowanceItem:", error);
          throw error;
        }
      }
      async deleteAllowanceItemsByEstimateItemId(estimateItemId) {
        try {
          await db.delete(allowanceItems).where(eq2(allowanceItems.estimateItemId, estimateItemId));
        } catch (error) {
          console.error("Database error in deleteAllowanceItemsByEstimateItemId:", error);
          throw error;
        }
      }
      async getBillApprovals(billId) {
        try {
          const approvals = await db.select({
            id: billApprovals.id,
            billId: billApprovals.billId,
            approvedById: billApprovals.approvedById,
            approvedByName: users.firstName,
            approvedByLastName: users.lastName,
            status: billApprovals.status,
            comments: billApprovals.comments,
            createdAt: billApprovals.createdAt
          }).from(billApprovals).leftJoin(users, eq2(billApprovals.approvedById, users.id)).where(eq2(billApprovals.billId, billId)).orderBy(desc(billApprovals.createdAt));
          return approvals.map((approval) => ({
            id: approval.id,
            billId: approval.billId,
            approvedById: approval.approvedById,
            status: approval.status,
            comments: approval.comments,
            createdAt: approval.createdAt
          }));
        } catch (error) {
          console.error("Database error in getBillApprovals:", error);
          throw error;
        }
      }
      async createBillApproval(approval) {
        try {
          const [newApproval] = await db.insert(billApprovals).values(approval).returning();
          return newApproval;
        } catch (error) {
          console.error("Database error in createBillApproval:", error);
          throw error;
        }
      }
      async canUserApproveBills(userId) {
        try {
          const user = await db.select().from(users).where(eq2(users.id, userId)).limit(1);
          if (!user.length || !user[0].roleId) {
            return false;
          }
          const billsApprovePermission = await db.select().from(permissions).where(eq2(permissions.key, "bills.approve")).limit(1);
          if (!billsApprovePermission.length) {
            return false;
          }
          const rolePermission = await db.select().from(rolePermissions).where(
            and(
              eq2(rolePermissions.roleId, user[0].roleId),
              eq2(rolePermissions.permissionId, billsApprovePermission[0].id)
            )
          ).limit(1);
          if (!rolePermission.length) {
            return false;
          }
          const allowedActions = rolePermission[0].allowedActions;
          return allowedActions && allowedActions.includes("approve");
        } catch (error) {
          console.error("Database error in canUserApproveBills:", error);
          return false;
        }
      }
      // Variations CRUD operations
      async getVariations(projectId, status) {
        try {
          let query = db.select().from(variations);
          const conditions = [];
          if (projectId) {
            conditions.push(eq2(variations.projectId, projectId));
          }
          if (status) {
            conditions.push(eq2(variations.status, status));
          }
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          return await query.orderBy(desc(variations.createdAt));
        } catch (error) {
          console.error("Database error in getVariations:", error);
          throw error;
        }
      }
      async getVariation(id) {
        try {
          const result = await db.select().from(variations).where(eq2(variations.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getVariation:", error);
          return void 0;
        }
      }
      async createVariation(variation) {
        try {
          const result = await db.insert(variations).values(variation).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createVariation:", error);
          throw error;
        }
      }
      async updateVariation(id, variation) {
        try {
          const result = await db.update(variations).set({ ...variation, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(variations.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateVariation:", error);
          throw error;
        }
      }
      async deleteVariation(id) {
        try {
          await db.delete(variations).where(eq2(variations.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteVariation:", error);
          return false;
        }
      }
      // Variation Items CRUD operations
      async getVariationItems(variationId) {
        try {
          return await db.select().from(variationItems).where(eq2(variationItems.variationId, variationId)).orderBy(variationItems.sortOrder);
        } catch (error) {
          console.error("Database error in getVariationItems:", error);
          throw error;
        }
      }
      async createVariationItem(item) {
        try {
          const result = await db.insert(variationItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createVariationItem:", error);
          throw error;
        }
      }
      async updateVariationItem(id, item) {
        try {
          const result = await db.update(variationItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(variationItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateVariationItem:", error);
          throw error;
        }
      }
      async deleteVariationItem(id) {
        try {
          await db.delete(variationItems).where(eq2(variationItems.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteVariationItem:", error);
          return false;
        }
      }
      // Client Invoices CRUD
      async getClientInvoices(projectId, status) {
        try {
          let query = db.select().from(clientInvoices);
          const conditions = [];
          if (projectId) {
            conditions.push(eq2(clientInvoices.projectId, projectId));
          }
          if (status) {
            conditions.push(eq2(clientInvoices.status, status));
          }
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          return await query;
        } catch (error) {
          console.error("Database error in getClientInvoices:", error);
          throw error;
        }
      }
      async getClientInvoice(id) {
        try {
          const result = await db.select().from(clientInvoices).where(eq2(clientInvoices.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getClientInvoice:", error);
          return void 0;
        }
      }
      async createClientInvoice(invoice) {
        try {
          const result = await db.insert(clientInvoices).values(invoice).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createClientInvoice:", error);
          throw error;
        }
      }
      async updateClientInvoice(id, invoice) {
        try {
          const result = await db.update(clientInvoices).set(invoice).where(eq2(clientInvoices.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateClientInvoice:", error);
          return void 0;
        }
      }
      async deleteClientInvoice(id) {
        try {
          await db.delete(clientInvoices).where(eq2(clientInvoices.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteClientInvoice:", error);
          return false;
        }
      }
      // Client Invoice Items CRUD
      async getClientInvoiceItems(invoiceId) {
        try {
          return await db.select().from(clientInvoiceItems).where(eq2(clientInvoiceItems.invoiceId, invoiceId)).orderBy(clientInvoiceItems.sortOrder);
        } catch (error) {
          console.error("Database error in getClientInvoiceItems:", error);
          throw error;
        }
      }
      async createClientInvoiceItem(item) {
        try {
          const result = await db.insert(clientInvoiceItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createClientInvoiceItem:", error);
          throw error;
        }
      }
      async updateClientInvoiceItem(id, item) {
        try {
          const result = await db.update(clientInvoiceItems).set(item).where(eq2(clientInvoiceItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateClientInvoiceItem:", error);
          return void 0;
        }
      }
      async deleteClientInvoiceItem(id) {
        try {
          await db.delete(clientInvoiceItems).where(eq2(clientInvoiceItems.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteClientInvoiceItem:", error);
          return false;
        }
      }
      // Client Invoice Payments CRUD
      async getClientInvoicePayments(invoiceId) {
        try {
          return await db.select().from(clientInvoicePayments).where(eq2(clientInvoicePayments.invoiceId, invoiceId)).orderBy(desc(clientInvoicePayments.paymentDate));
        } catch (error) {
          console.error("Database error in getClientInvoicePayments:", error);
          throw error;
        }
      }
      async createClientInvoicePayment(payment) {
        try {
          const result = await db.insert(clientInvoicePayments).values(payment).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createClientInvoicePayment:", error);
          throw error;
        }
      }
      async deleteClientInvoicePayment(id) {
        try {
          await db.delete(clientInvoicePayments).where(eq2(clientInvoicePayments.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteClientInvoicePayment:", error);
          return false;
        }
      }
      // Invoice-Estimate Junction Table
      async getInvoiceEstimates(invoiceId) {
        try {
          return await db.select().from(invoiceEstimates).where(eq2(invoiceEstimates.invoiceId, invoiceId));
        } catch (error) {
          console.error("Database error in getInvoiceEstimates:", error);
          throw error;
        }
      }
      async createInvoiceEstimate(data) {
        try {
          const result = await db.insert(invoiceEstimates).values(data).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createInvoiceEstimate:", error);
          throw error;
        }
      }
      async deleteInvoiceEstimate(id) {
        try {
          await db.delete(invoiceEstimates).where(eq2(invoiceEstimates.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteInvoiceEstimate:", error);
          return false;
        }
      }
      // Invoice-Variation Junction Table
      async getInvoiceVariations(invoiceId) {
        try {
          return await db.select().from(invoiceVariations).where(eq2(invoiceVariations.invoiceId, invoiceId));
        } catch (error) {
          console.error("Database error in getInvoiceVariations:", error);
          throw error;
        }
      }
      async createInvoiceVariation(data) {
        try {
          const result = await db.insert(invoiceVariations).values(data).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createInvoiceVariation:", error);
          throw error;
        }
      }
      async deleteInvoiceVariation(id) {
        try {
          await db.delete(invoiceVariations).where(eq2(invoiceVariations.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteInvoiceVariation:", error);
          return false;
        }
      }
      // Invoice-Bill Junction Table
      async getInvoiceBills(invoiceId) {
        try {
          return await db.select().from(invoiceBills).where(eq2(invoiceBills.invoiceId, invoiceId));
        } catch (error) {
          console.error("Database error in getInvoiceBills:", error);
          throw error;
        }
      }
      async createInvoiceBill(data) {
        try {
          const result = await db.insert(invoiceBills).values(data).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createInvoiceBill:", error);
          throw error;
        }
      }
      async deleteInvoiceBill(id) {
        try {
          await db.delete(invoiceBills).where(eq2(invoiceBills.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteInvoiceBill:", error);
          return false;
        }
      }
      // Proposals CRUD operations
      async getProposals(projectId, status) {
        try {
          let query = db.select().from(proposals);
          const conditions = [];
          if (projectId) {
            conditions.push(eq2(proposals.projectId, projectId));
          }
          if (status) {
            conditions.push(eq2(proposals.status, status));
          }
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          return await query.orderBy(desc(proposals.createdAt));
        } catch (error) {
          console.error("Database error in getProposals:", error);
          throw error;
        }
      }
      async getProposal(id) {
        try {
          const result = await db.select().from(proposals).where(eq2(proposals.id, id));
          return result[0];
        } catch (error) {
          console.error("Database error in getProposal:", error);
          throw error;
        }
      }
      async createProposal(proposal) {
        try {
          const result = await db.insert(proposals).values(proposal).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createProposal:", error);
          throw error;
        }
      }
      async updateProposal(id, proposal) {
        try {
          const result = await db.update(proposals).set({ ...proposal, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(proposals.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateProposal:", error);
          throw error;
        }
      }
      async deleteProposal(id) {
        try {
          await db.delete(proposals).where(eq2(proposals.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteProposal:", error);
          return false;
        }
      }
      // Proposal Sections CRUD operations
      async getProposalSections(proposalId) {
        try {
          return await db.select().from(proposalSections).where(eq2(proposalSections.proposalId, proposalId)).orderBy(proposalSections.order);
        } catch (error) {
          console.error("Database error in getProposalSections:", error);
          throw error;
        }
      }
      async createProposalSection(section) {
        try {
          const result = await db.insert(proposalSections).values(section).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createProposalSection:", error);
          throw error;
        }
      }
      async updateProposalSection(id, section) {
        try {
          const result = await db.update(proposalSections).set({ ...section, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(proposalSections.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateProposalSection:", error);
          throw error;
        }
      }
      async deleteProposalSection(id) {
        try {
          await db.delete(proposalSections).where(eq2(proposalSections.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteProposalSection:", error);
          return false;
        }
      }
      // Proposal Items CRUD operations
      async getProposalItems(proposalId) {
        try {
          return await db.select().from(proposalItems).where(eq2(proposalItems.proposalId, proposalId)).orderBy(proposalItems.order);
        } catch (error) {
          console.error("Database error in getProposalItems:", error);
          throw error;
        }
      }
      async createProposalItem(item) {
        try {
          const result = await db.insert(proposalItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createProposalItem:", error);
          throw error;
        }
      }
      async updateProposalItem(id, item) {
        try {
          const result = await db.update(proposalItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(proposalItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateProposalItem:", error);
          throw error;
        }
      }
      async deleteProposalItem(id) {
        try {
          await db.delete(proposalItems).where(eq2(proposalItems.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteProposalItem:", error);
          return false;
        }
      }
      // Proposal Acceptances CRUD operations
      async getProposalAcceptances(proposalId) {
        try {
          return await db.select().from(proposalAcceptances).where(eq2(proposalAcceptances.proposalId, proposalId)).orderBy(desc(proposalAcceptances.signedAt));
        } catch (error) {
          console.error("Database error in getProposalAcceptances:", error);
          throw error;
        }
      }
      async createProposalAcceptance(acceptance) {
        try {
          const result = await db.insert(proposalAcceptances).values(acceptance).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createProposalAcceptance:", error);
          throw error;
        }
      }
      async getLatestProposalAcceptance(proposalId) {
        try {
          const result = await db.select().from(proposalAcceptances).where(eq2(proposalAcceptances.proposalId, proposalId)).orderBy(desc(proposalAcceptances.signedAt)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getLatestProposalAcceptance:", error);
          throw error;
        }
      }
      // Activity Feed CRUD
      async getActivities(projectId, limit = 50) {
        try {
          return await db.select().from(activities).where(eq2(activities.projectId, projectId)).orderBy(desc(activities.createdAt)).limit(limit);
        } catch (error) {
          console.error("Database error in getActivities:", error);
          throw error;
        }
      }
      async createActivity(activity) {
        try {
          const result = await db.insert(activities).values(activity).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createActivity:", error);
          throw error;
        }
      }
      // Site Diary Templates CRUD
      async getSiteDiaryTemplates() {
        try {
          return await db.select().from(siteDiaryTemplates).where(eq2(siteDiaryTemplates.isArchived, false)).orderBy(desc(siteDiaryTemplates.updatedAt));
        } catch (error) {
          console.error("Database error in getSiteDiaryTemplates:", error);
          throw error;
        }
      }
      async getSiteDiaryTemplate(id) {
        try {
          const result = await db.select().from(siteDiaryTemplates).where(eq2(siteDiaryTemplates.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getSiteDiaryTemplate:", error);
          throw error;
        }
      }
      async createSiteDiaryTemplate(template) {
        try {
          const result = await db.insert(siteDiaryTemplates).values(template).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createSiteDiaryTemplate:", error);
          throw error;
        }
      }
      async updateSiteDiaryTemplate(id, template) {
        try {
          const result = await db.update(siteDiaryTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(siteDiaryTemplates.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateSiteDiaryTemplate:", error);
          throw error;
        }
      }
      async deleteSiteDiaryTemplate(id) {
        try {
          const result = await db.update(siteDiaryTemplates).set({ isArchived: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(siteDiaryTemplates.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteSiteDiaryTemplate:", error);
          throw error;
        }
      }
      // Site Diary Entries CRUD
      async getSiteDiaryEntries(projectId) {
        try {
          return await db.select().from(siteDiaryEntries).where(eq2(siteDiaryEntries.projectId, projectId)).orderBy(desc(siteDiaryEntries.entryDateTime));
        } catch (error) {
          console.error("Database error in getSiteDiaryEntries:", error);
          throw error;
        }
      }
      async getSiteDiaryEntry(id) {
        try {
          const result = await db.select().from(siteDiaryEntries).where(eq2(siteDiaryEntries.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getSiteDiaryEntry:", error);
          throw error;
        }
      }
      async createSiteDiaryEntry(entry) {
        try {
          const result = await db.insert(siteDiaryEntries).values(entry).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createSiteDiaryEntry:", error);
          throw error;
        }
      }
      async updateSiteDiaryEntry(id, entry) {
        try {
          const result = await db.update(siteDiaryEntries).set({ ...entry, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(siteDiaryEntries.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateSiteDiaryEntry:", error);
          throw error;
        }
      }
      async deleteSiteDiaryEntry(id) {
        try {
          const result = await db.delete(siteDiaryEntries).where(eq2(siteDiaryEntries.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteSiteDiaryEntry:", error);
          throw error;
        }
      }
      // Checklist Templates CRUD
      async getChecklistTemplates() {
        try {
          return await db.select().from(checklistTemplates).where(eq2(checklistTemplates.isArchived, false)).orderBy(desc(checklistTemplates.createdAt));
        } catch (error) {
          console.error("Database error in getChecklistTemplates:", error);
          throw error;
        }
      }
      async getChecklistTemplate(id) {
        try {
          const result = await db.select().from(checklistTemplates).where(eq2(checklistTemplates.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getChecklistTemplate:", error);
          throw error;
        }
      }
      async createChecklistTemplate(template) {
        try {
          const result = await db.insert(checklistTemplates).values(template).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createChecklistTemplate:", error);
          throw error;
        }
      }
      async updateChecklistTemplate(id, template) {
        try {
          const result = await db.update(checklistTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(checklistTemplates.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateChecklistTemplate:", error);
          throw error;
        }
      }
      async deleteChecklistTemplate(id) {
        try {
          const result = await db.update(checklistTemplates).set({ isArchived: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(checklistTemplates.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteChecklistTemplate:", error);
          throw error;
        }
      }
      async hardDeleteChecklistTemplate(id) {
        try {
          const result = await db.delete(checklistTemplates).where(eq2(checklistTemplates.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in hardDeleteChecklistTemplate:", error);
          throw error;
        }
      }
      // Checklist Template Groups CRUD
      async getChecklistTemplateGroups(templateId) {
        try {
          return await db.select().from(checklistTemplateGroups).where(eq2(checklistTemplateGroups.templateId, templateId)).orderBy(checklistTemplateGroups.order);
        } catch (error) {
          console.error("Database error in getChecklistTemplateGroups:", error);
          throw error;
        }
      }
      async getChecklistTemplateGroup(id) {
        try {
          const result = await db.select().from(checklistTemplateGroups).where(eq2(checklistTemplateGroups.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getChecklistTemplateGroup:", error);
          throw error;
        }
      }
      async createChecklistTemplateGroup(group) {
        try {
          const result = await db.insert(checklistTemplateGroups).values(group).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createChecklistTemplateGroup:", error);
          throw error;
        }
      }
      async updateChecklistTemplateGroup(id, group) {
        try {
          const result = await db.update(checklistTemplateGroups).set({ ...group, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(checklistTemplateGroups.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateChecklistTemplateGroup:", error);
          throw error;
        }
      }
      async deleteChecklistTemplateGroup(id) {
        try {
          const result = await db.delete(checklistTemplateGroups).where(eq2(checklistTemplateGroups.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteChecklistTemplateGroup:", error);
          throw error;
        }
      }
      // Checklist Template Items CRUD
      async getChecklistTemplateItems(groupId) {
        try {
          return await db.select().from(checklistTemplateItems).where(eq2(checklistTemplateItems.groupId, groupId)).orderBy(checklistTemplateItems.order);
        } catch (error) {
          console.error("Database error in getChecklistTemplateItems:", error);
          throw error;
        }
      }
      async getChecklistTemplateItem(id) {
        try {
          const result = await db.select().from(checklistTemplateItems).where(eq2(checklistTemplateItems.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getChecklistTemplateItem:", error);
          throw error;
        }
      }
      async createChecklistTemplateItem(item) {
        try {
          const result = await db.insert(checklistTemplateItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createChecklistTemplateItem:", error);
          throw error;
        }
      }
      async updateChecklistTemplateItem(id, item) {
        try {
          const result = await db.update(checklistTemplateItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(checklistTemplateItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateChecklistTemplateItem:", error);
          throw error;
        }
      }
      async deleteChecklistTemplateItem(id) {
        try {
          const result = await db.delete(checklistTemplateItems).where(eq2(checklistTemplateItems.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteChecklistTemplateItem:", error);
          throw error;
        }
      }
      // Budget CRUD
      async getBudget(projectId) {
        try {
          const result = await db.select().from(budgets).where(eq2(budgets.projectId, projectId)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getBudget:", error);
          throw error;
        }
      }
      async createBudget(budget) {
        try {
          const result = await db.insert(budgets).values(budget).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createBudget:", error);
          throw error;
        }
      }
      async updateBudget(id, budget) {
        try {
          const result = await db.update(budgets).set({ ...budget, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(budgets.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateBudget:", error);
          throw error;
        }
      }
      async deleteBudget(id) {
        try {
          const result = await db.delete(budgets).where(eq2(budgets.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteBudget:", error);
          throw error;
        }
      }
      async calculateBudget(projectId) {
        try {
          let budget = await this.getBudget(projectId);
          if (!budget) {
            budget = await this.createBudget({
              projectId,
              name: "Project Budget",
              baselineAmount: 0,
              revisedAmount: 0,
              actualAmount: 0,
              forecastAmount: 0,
              varianceAmount: 0,
              profitAmount: 0,
              profitPercent: 0
            });
          }
          const estimates2 = await db.select().from(estimates).where(eq2(estimates.projectId, projectId));
          const estimateItems2 = estimates2.length > 0 ? await db.select().from(estimateItems).where(eq2(estimateItems.estimateId, estimates2[0].id)) : [];
          const baselineAmount = estimateItems2.reduce((sum, item) => sum + (item.priceIncTax || 0), 0);
          const bills2 = await db.select().from(bills).where(eq2(bills.projectId, projectId));
          const actualAmount = bills2.reduce((sum, bill) => sum + (bill.total || 0), 0);
          const variations2 = await db.select().from(variations).where(and(
            eq2(variations.projectId, projectId),
            eq2(variations.status, "approved")
          ));
          const variationAmount = variations2.reduce((sum, v) => sum + (v.totalAmount || 0), 0);
          const revisedAmount = baselineAmount + variationAmount;
          const forecastAmount = actualAmount + (revisedAmount - actualAmount);
          const varianceAmount = revisedAmount - forecastAmount;
          const profitPercent = revisedAmount > 0 ? Math.round((revisedAmount - forecastAmount) / revisedAmount * 100) : 0;
          const updated = await this.updateBudget(budget.id, {
            baselineAmount,
            revisedAmount,
            actualAmount,
            forecastAmount,
            varianceAmount,
            profitPercent
          });
          return updated;
        } catch (error) {
          console.error("Database error in calculateBudget:", error);
          throw error;
        }
      }
      // Budget Line Items CRUD
      async getBudgetLineItems(budgetId) {
        try {
          return await db.select().from(budgetLineItems).where(eq2(budgetLineItems.budgetId, budgetId)).orderBy(budgetLineItems.sortOrder);
        } catch (error) {
          console.error("Database error in getBudgetLineItems:", error);
          throw error;
        }
      }
      async getBudgetLineItem(id) {
        try {
          const result = await db.select().from(budgetLineItems).where(eq2(budgetLineItems.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getBudgetLineItem:", error);
          throw error;
        }
      }
      async createBudgetLineItem(item) {
        try {
          const result = await db.insert(budgetLineItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createBudgetLineItem:", error);
          throw error;
        }
      }
      async updateBudgetLineItem(id, item) {
        try {
          const result = await db.update(budgetLineItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(budgetLineItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateBudgetLineItem:", error);
          throw error;
        }
      }
      async deleteBudgetLineItem(id) {
        try {
          const result = await db.delete(budgetLineItems).where(eq2(budgetLineItems.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteBudgetLineItem:", error);
          throw error;
        }
      }
      async recalculateBudgetLineItems(budgetId) {
        try {
          const budgetResult = await db.select().from(budgets).where(eq2(budgets.id, budgetId)).limit(1);
          if (!budgetResult[0]) {
            throw new Error("Budget not found");
          }
          const budget = budgetResult[0];
          const projectId = budget.projectId;
          const costCodes2 = await db.select().from(costCodes).where(eq2(costCodes.isActive, true));
          const estimates2 = await db.select().from(estimates).where(eq2(estimates.projectId, projectId));
          const estimateItems2 = estimates2.length > 0 ? await db.select().from(estimateItems).where(eq2(estimateItems.estimateId, estimates2[0].id)) : [];
          const bills2 = await db.select().from(bills).where(eq2(bills.projectId, projectId));
          const billIds = bills2.map((b) => b.id);
          const billLineItems2 = billIds.length > 0 ? await db.select().from(billLineItems).where(billLineItems.billId) : [];
          const costCodeMap = /* @__PURE__ */ new Map();
          for (const item of estimateItems2) {
            const costCodeKey = item.costCode || "uncategorized";
            const existing = costCodeMap.get(costCodeKey) || {
              budgeted: 0,
              actual: 0,
              costCodeTitle: item.costCode || "Uncategorized",
              categoryTitle: "General"
            };
            existing.budgeted += item.priceIncTax || 0;
            costCodeMap.set(costCodeKey, existing);
          }
          for (const billItem of billLineItems2) {
            const costCode = costCodes2.find((cc) => cc.id === billItem.costCodeId);
            const costCodeKey = costCode?.code || "uncategorized";
            const existing = costCodeMap.get(costCodeKey) || {
              budgeted: 0,
              actual: 0,
              costCodeTitle: costCode?.title || "Uncategorized",
              categoryTitle: "General"
            };
            existing.actual += billItem.total || 0;
            costCodeMap.set(costCodeKey, existing);
          }
          await db.delete(budgetLineItems).where(eq2(budgetLineItems.budgetId, budgetId));
          const lineItems = [];
          let sortOrder = 0;
          for (const [costCodeKey, data] of costCodeMap.entries()) {
            const costCode = costCodes2.find((cc) => cc.code === costCodeKey);
            const forecast = data.actual + Math.max(0, data.budgeted - data.actual);
            const variance = data.budgeted - forecast;
            const variancePercent = data.budgeted > 0 ? Math.round(variance / data.budgeted * 100) : 0;
            const lineItem = await this.createBudgetLineItem({
              budgetId,
              costCodeId: costCode?.id || null,
              costCodeTitle: data.costCodeTitle,
              categoryTitle: data.categoryTitle,
              budgetedAmount: data.budgeted,
              actualAmount: data.actual,
              variationAmount: 0,
              forecastAmount: forecast,
              variance,
              variancePercent,
              profitAmount: variance,
              sortOrder: sortOrder++
            });
            lineItems.push(lineItem);
          }
          return lineItems;
        } catch (error) {
          console.error("Database error in recalculateBudgetLineItems:", error);
          throw error;
        }
      }
      // Labour Hours Budget CRUD
      async getLabourHoursBudget(projectId) {
        try {
          const result = await db.select().from(labourHoursBudget).where(eq2(labourHoursBudget.projectId, projectId)).orderBy(labourHoursBudget.sortOrder);
          return result;
        } catch (error) {
          console.error("Database error in getLabourHoursBudget:", error);
          throw error;
        }
      }
      async recalculateLabourHoursBudget(projectId) {
        try {
          const costCodes2 = await db.select().from(costCodes).where(eq2(costCodes.isActive, true));
          const estimates2 = await db.select().from(estimates).where(eq2(estimates.projectId, projectId));
          const estimateItems2 = estimates2.length > 0 ? await db.select().from(estimateItems).where(
            and(
              eq2(estimateItems.estimateId, estimates2[0].id),
              eq2(estimateItems.type, "Labour"),
              eq2(estimateItems.trackLabourHours, true)
            )
          ) : [];
          const costCodeMap = /* @__PURE__ */ new Map();
          for (const item of estimateItems2) {
            const costCodeKey = item.costCode || "uncategorized";
            const costCode = costCodes2.find((cc) => cc.code === costCodeKey);
            const existing = costCodeMap.get(costCodeKey) || {
              budgetedHours: 0,
              costCodeTitle: costCode?.title || item.costCode || "Uncategorized",
              categoryTitle: "General",
              costCodeId: costCode?.id || null
            };
            const hours = item.quantity || 0;
            const roundedHours = Math.round(hours * 4) / 4;
            existing.budgetedHours += roundedHours;
            costCodeMap.set(costCodeKey, existing);
          }
          const timesheets2 = await db.select().from(timesheets).where(eq2(timesheets.projectId, projectId));
          const timesheetIds = timesheets2.map((t) => t.id);
          const timesheetCostCodes2 = timesheetIds.length > 0 ? await db.select().from(timesheetCostCodes).where(sql2`${timesheetCostCodes.timesheetId} = ANY(${timesheetIds})`) : [];
          const pendingHoursMap = /* @__PURE__ */ new Map();
          const approvedHoursMap = /* @__PURE__ */ new Map();
          for (const split of timesheetCostCodes2) {
            const timesheet = timesheets2.find((t) => t.id === split.timesheetId);
            if (!timesheet) continue;
            const duration = parseFloat(split.duration);
            const costCode = costCodes2.find((cc) => cc.id === split.costCodeId);
            const costCodeKey = costCode?.code || "uncategorized";
            if (timesheet.status === "submitted") {
              pendingHoursMap.set(costCodeKey, (pendingHoursMap.get(costCodeKey) || 0) + duration);
            } else if (timesheet.status === "approved") {
              approvedHoursMap.set(costCodeKey, (approvedHoursMap.get(costCodeKey) || 0) + duration);
            }
          }
          await db.delete(labourHoursBudget).where(eq2(labourHoursBudget.projectId, projectId));
          const labourHoursBudget2 = [];
          let sortOrder = 0;
          for (const [costCodeKey, data] of costCodeMap.entries()) {
            const pendingHours = pendingHoursMap.get(costCodeKey) || 0;
            const approvedHours = approvedHoursMap.get(costCodeKey) || 0;
            const result = await db.insert(labourHoursBudget).values({
              projectId,
              costCodeId: data.costCodeId,
              costCodeTitle: data.costCodeTitle,
              categoryTitle: data.categoryTitle,
              budgetedHours: data.budgetedHours.toString(),
              pendingHours: pendingHours.toString(),
              approvedHours: approvedHours.toString(),
              sortOrder: sortOrder++
            }).returning();
            labourHoursBudget2.push(result[0]);
          }
          return labourHoursBudget2;
        } catch (error) {
          console.error("Database error in recalculateLabourHoursBudget:", error);
          throw error;
        }
      }
      // Timesheets CRUD
      async getTimesheets(projectId, filters) {
        try {
          let query = db.select().from(timesheets);
          const conditions = [];
          if (projectId) conditions.push(eq2(timesheets.projectId, projectId));
          if (filters?.userId) conditions.push(eq2(timesheets.userId, filters.userId));
          if (filters?.status) conditions.push(eq2(timesheets.status, filters.status));
          if (filters?.invoiced !== void 0) conditions.push(eq2(timesheets.invoiced, filters.invoiced));
          if (filters?.startDate) conditions.push(gte(timesheets.date, filters.startDate));
          if (filters?.endDate) conditions.push(lte(timesheets.date, filters.endDate));
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          const result = await query.orderBy(desc(timesheets.date));
          return result;
        } catch (error) {
          console.error("Database error in getTimesheets:", error);
          throw error;
        }
      }
      async getTimesheet(id) {
        try {
          const result = await db.select().from(timesheets).where(eq2(timesheets.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getTimesheet:", error);
          throw error;
        }
      }
      async createTimesheet(timesheet) {
        try {
          const result = await db.insert(timesheets).values(timesheet).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createTimesheet:", error);
          throw error;
        }
      }
      async updateTimesheet(id, timesheet) {
        try {
          const result = await db.update(timesheets).set({ ...timesheet, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(timesheets.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateTimesheet:", error);
          throw error;
        }
      }
      async deleteTimesheet(id) {
        try {
          const result = await db.delete(timesheets).where(eq2(timesheets.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteTimesheet:", error);
          throw error;
        }
      }
      async submitTimesheet(id) {
        try {
          const result = await db.update(timesheets).set({ status: "submitted", updatedAt: /* @__PURE__ */ new Date() }).where(eq2(timesheets.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in submitTimesheet:", error);
          throw error;
        }
      }
      async approveTimesheet(id) {
        try {
          const result = await db.update(timesheets).set({ status: "approved", updatedAt: /* @__PURE__ */ new Date() }).where(eq2(timesheets.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in approveTimesheet:", error);
          throw error;
        }
      }
      async rejectTimesheet(id) {
        try {
          const result = await db.update(timesheets).set({ status: "rejected", updatedAt: /* @__PURE__ */ new Date() }).where(eq2(timesheets.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in rejectTimesheet:", error);
          throw error;
        }
      }
      // Timesheet Cost Codes
      async getTimesheetCostCodes(timesheetId) {
        try {
          const result = await db.select().from(timesheetCostCodes).where(eq2(timesheetCostCodes.timesheetId, timesheetId));
          return result;
        } catch (error) {
          console.error("Database error in getTimesheetCostCodes:", error);
          throw error;
        }
      }
      async createTimesheetCostCode(costCode) {
        try {
          const result = await db.insert(timesheetCostCodes).values(costCode).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createTimesheetCostCode:", error);
          throw error;
        }
      }
      async updateTimesheetCostCode(id, costCode) {
        try {
          const result = await db.update(timesheetCostCodes).set({ ...costCode, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(timesheetCostCodes.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateTimesheetCostCode:", error);
          throw error;
        }
      }
      async deleteTimesheetCostCode(id) {
        try {
          const result = await db.delete(timesheetCostCodes).where(eq2(timesheetCostCodes.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteTimesheetCostCode:", error);
          throw error;
        }
      }
      // Clock-in/out methods
      async getActiveTimesheet(userId) {
        try {
          const result = await db.select().from(timesheets).where(and(
            eq2(timesheets.userId, userId),
            eq2(timesheets.isActive, true)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getActiveTimesheet:", error);
          throw error;
        }
      }
      async clockIn(projectId, userId, costCodeId) {
        try {
          const activeTimesheet = await this.getActiveTimesheet(userId);
          if (activeTimesheet) {
            await this.clockOut(activeTimesheet.id, userId);
          }
          const now = /* @__PURE__ */ new Date();
          const startTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
          const newTimesheet = await db.insert(timesheets).values({
            projectId,
            userId,
            date: now,
            startTime,
            isActive: true,
            clockInTime: now,
            costCodeId: costCodeId || null,
            status: "draft",
            duration: "0",
            breakDuration: "0",
            hourlyRate: "0",
            total: "0",
            invoiced: false
          }).returning();
          return newTimesheet[0];
        } catch (error) {
          console.error("Database error in clockIn:", error);
          throw error;
        }
      }
      async clockOut(timesheetId, userId) {
        try {
          const timesheet = await this.getTimesheet(timesheetId);
          if (!timesheet) {
            return void 0;
          }
          if (timesheet.userId !== userId) {
            throw new Error("Unauthorized: Cannot clock out another user's timesheet");
          }
          if (!timesheet.isActive) {
            return timesheet;
          }
          const now = /* @__PURE__ */ new Date();
          const endTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
          let duration = 0;
          if (timesheet.clockInTime) {
            const diffMs = now.getTime() - new Date(timesheet.clockInTime).getTime();
            duration = diffMs / (1e3 * 60 * 60);
          }
          const result = await db.update(timesheets).set({
            endTime,
            duration: duration.toFixed(2),
            isActive: false,
            updatedAt: now
          }).where(and(
            eq2(timesheets.id, timesheetId),
            eq2(timesheets.userId, userId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in clockOut:", error);
          throw error;
        }
      }
      // Schedule CRUD
      async getSchedule(projectId) {
        try {
          const result = await db.select().from(schedules).where(eq2(schedules.projectId, projectId)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getSchedule:", error);
          throw error;
        }
      }
      async createSchedule(schedule) {
        try {
          const result = await db.insert(schedules).values(schedule).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createSchedule:", error);
          throw error;
        }
      }
      async updateSchedule(id, schedule) {
        try {
          const result = await db.update(schedules).set({ ...schedule, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(schedules.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateSchedule:", error);
          throw error;
        }
      }
      async deleteSchedule(id) {
        try {
          const result = await db.delete(schedules).where(eq2(schedules.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteSchedule:", error);
          throw error;
        }
      }
      async updateScheduleStatus(id, status, userId) {
        try {
          const updates = { status, updatedAt: /* @__PURE__ */ new Date() };
          if (status === "locked" && userId) {
            const user = await db.select().from(users).where(eq2(users.id, userId)).limit(1);
            updates.lockedBy = userId;
            if (user[0]) {
              const firstName = user[0].firstName || "";
              const lastName = user[0].lastName || "";
              updates.lockedByName = `${firstName} ${lastName}`.trim() || user[0].username || null;
            } else {
              updates.lockedByName = null;
            }
            updates.lockedAt = /* @__PURE__ */ new Date();
          } else if (status !== "locked") {
            updates.lockedBy = null;
            updates.lockedByName = null;
            updates.lockedAt = null;
          }
          const result = await db.update(schedules).set(updates).where(eq2(schedules.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateScheduleStatus:", error);
          throw error;
        }
      }
      // Schedule Items CRUD
      async getScheduleItems(scheduleId) {
        try {
          return await db.select().from(scheduleItems).where(eq2(scheduleItems.scheduleId, scheduleId)).orderBy(scheduleItems.startDate, scheduleItems.sortOrder);
        } catch (error) {
          console.error("Database error in getScheduleItems:", error);
          throw error;
        }
      }
      async getScheduleItemsByProject(projectId) {
        try {
          const items = await db.select().from(scheduleItems).innerJoin(schedules, eq2(scheduleItems.scheduleId, schedules.id)).where(eq2(schedules.projectId, projectId)).orderBy(scheduleItems.startDate, scheduleItems.sortOrder);
          return items.map((item) => item.schedule_items);
        } catch (error) {
          console.error("Database error in getScheduleItemsByProject:", error);
          throw error;
        }
      }
      async getAllScheduleItems(companyId) {
        try {
          const items = await db.select({
            id: scheduleItems.id,
            scheduleId: scheduleItems.scheduleId,
            title: scheduleItems.title,
            description: scheduleItems.description,
            startDate: scheduleItems.startDate,
            endDate: scheduleItems.endDate,
            color: scheduleItems.color,
            sortOrder: scheduleItems.sortOrder,
            createdAt: scheduleItems.createdAt,
            updatedAt: scheduleItems.updatedAt
          }).from(scheduleItems).innerJoin(schedules, eq2(scheduleItems.scheduleId, schedules.id)).innerJoin(projects, eq2(schedules.projectId, projects.id)).where(eq2(projects.companyId, companyId)).orderBy(scheduleItems.startDate);
          return items;
        } catch (error) {
          console.error("Database error in getAllScheduleItems:", error);
          throw error;
        }
      }
      async getScheduleItem(id) {
        try {
          const result = await db.select().from(scheduleItems).where(eq2(scheduleItems.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getScheduleItem:", error);
          throw error;
        }
      }
      async createScheduleItem(item) {
        try {
          const result = await db.insert(scheduleItems).values(item).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createScheduleItem:", error);
          throw error;
        }
      }
      async updateScheduleItem(id, item) {
        try {
          const result = await db.update(scheduleItems).set({ ...item, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(scheduleItems.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateScheduleItem:", error);
          throw error;
        }
      }
      async deleteScheduleItem(id) {
        try {
          const result = await db.delete(scheduleItems).where(eq2(scheduleItems.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteScheduleItem:", error);
          throw error;
        }
      }
      async bulkUpdateScheduleItems(items) {
        try {
          const results = [];
          for (const { id, updates } of items) {
            const result = await this.updateScheduleItem(id, updates);
            if (result) {
              results.push(result);
            }
          }
          return results;
        } catch (error) {
          console.error("Database error in bulkUpdateScheduleItems:", error);
          throw error;
        }
      }
      // Schedule Templates CRUD
      async getScheduleTemplates(category) {
        try {
          const query = db.select().from(scheduleTemplates).where(eq2(scheduleTemplates.isArchived, false));
          if (category) {
            return await query.where(eq2(scheduleTemplates.category, category));
          }
          return await query;
        } catch (error) {
          console.error("Database error in getScheduleTemplates:", error);
          throw error;
        }
      }
      async getScheduleTemplate(id) {
        try {
          const result = await db.select().from(scheduleTemplates).where(eq2(scheduleTemplates.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getScheduleTemplate:", error);
          throw error;
        }
      }
      async createScheduleTemplate(template) {
        try {
          const result = await db.insert(scheduleTemplates).values(template).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createScheduleTemplate:", error);
          throw error;
        }
      }
      async updateScheduleTemplate(id, template) {
        try {
          const result = await db.update(scheduleTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(scheduleTemplates.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateScheduleTemplate:", error);
          throw error;
        }
      }
      async deleteScheduleTemplate(id) {
        try {
          const result = await db.delete(scheduleTemplates).where(eq2(scheduleTemplates.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteScheduleTemplate:", error);
          throw error;
        }
      }
      // Calendar Views CRUD
      async getCalendarViews(userId, calendarType, companyId) {
        try {
          return await db.select().from(calendarViews).where(and(
            eq2(calendarViews.userId, userId),
            eq2(calendarViews.calendarType, calendarType),
            eq2(calendarViews.companyId, companyId),
            eq2(calendarViews.isArchived, false)
          )).orderBy(asc(calendarViews.sortOrder));
        } catch (error) {
          console.error("Database error in getCalendarViews:", error);
          throw error;
        }
      }
      async getCalendarView(id, companyId) {
        try {
          const result = await db.select().from(calendarViews).where(and(
            eq2(calendarViews.id, id),
            eq2(calendarViews.companyId, companyId)
          )).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getCalendarView:", error);
          throw error;
        }
      }
      async createCalendarView(view) {
        try {
          const result = await db.insert(calendarViews).values(view).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createCalendarView:", error);
          throw error;
        }
      }
      async updateCalendarView(id, view, companyId) {
        try {
          const result = await db.update(calendarViews).set({ ...view, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(calendarViews.id, id),
            eq2(calendarViews.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateCalendarView:", error);
          throw error;
        }
      }
      async deleteCalendarView(id, companyId) {
        try {
          const result = await db.delete(calendarViews).where(and(
            eq2(calendarViews.id, id),
            eq2(calendarViews.companyId, companyId)
          )).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteCalendarView:", error);
          throw error;
        }
      }
      // Activity Notes CRUD
      async getActivityNotes(scheduleItemId, limit = 10, offset = 0) {
        try {
          return await db.select().from(activityNotes).where(eq2(activityNotes.scheduleItemId, scheduleItemId)).orderBy(desc(activityNotes.createdAt)).limit(limit).offset(offset);
        } catch (error) {
          console.error("Database error in getActivityNotes:", error);
          throw error;
        }
      }
      async getActivityNoteCount(scheduleItemId) {
        try {
          const result = await db.select({ count: sql2`count(*)` }).from(activityNotes).where(eq2(activityNotes.scheduleItemId, scheduleItemId));
          return Number(result[0]?.count || 0);
        } catch (error) {
          console.error("Database error in getActivityNoteCount:", error);
          throw error;
        }
      }
      async getBatchActivityNoteCounts(scheduleItemIds) {
        try {
          if (scheduleItemIds.length === 0) return {};
          const results = await db.select({
            scheduleItemId: activityNotes.scheduleItemId,
            count: sql2`count(*)`
          }).from(activityNotes).where(inArray(activityNotes.scheduleItemId, scheduleItemIds)).groupBy(activityNotes.scheduleItemId);
          const counts = {};
          results.forEach((row) => {
            counts[row.scheduleItemId] = Number(row.count);
          });
          scheduleItemIds.forEach((id) => {
            if (!(id in counts)) {
              counts[id] = 0;
            }
          });
          return counts;
        } catch (error) {
          console.error("Database error in getBatchActivityNoteCounts:", error);
          throw error;
        }
      }
      async createActivityNote(note) {
        try {
          const result = await db.insert(activityNotes).values(note).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createActivityNote:", error);
          throw error;
        }
      }
      async updateActivityNote(id, note) {
        try {
          const result = await db.update(activityNotes).set({
            ...note,
            isEdited: true,
            editedAt: /* @__PURE__ */ new Date()
          }).where(eq2(activityNotes.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateActivityNote:", error);
          throw error;
        }
      }
      async deleteActivityNote(id) {
        try {
          const result = await db.delete(activityNotes).where(eq2(activityNotes.id, id)).returning();
          return result.length > 0;
        } catch (error) {
          console.error("Database error in deleteActivityNote:", error);
          throw error;
        }
      }
      async canEditActivityNote(noteId, userId) {
        try {
          const result = await db.select().from(activityNotes).where(eq2(activityNotes.id, noteId)).limit(1);
          const note = result[0];
          if (!note || note.userId !== userId || note.type !== "user") return false;
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1e3);
          return new Date(note.createdAt) > fiveMinutesAgo;
        } catch (error) {
          console.error("Database error in canEditActivityNote:", error);
          throw error;
        }
      }
      // Defects CRUD
      async getDefects(projectId, status) {
        try {
          let query = db.select().from(defects);
          const conditions = [];
          if (projectId) {
            conditions.push(eq2(defects.projectId, projectId));
          }
          if (status) {
            conditions.push(eq2(defects.status, status));
          }
          if (conditions.length > 0) {
            query = query.where(and(...conditions));
          }
          const defects2 = await query.orderBy(desc(defects.dateIdentified));
          return defects2;
        } catch (error) {
          console.error("Database error in getDefects:", error);
          throw error;
        }
      }
      async getDefectById(id) {
        try {
          const result = await db.select().from(defects).where(eq2(defects.id, id)).limit(1);
          return result[0] || null;
        } catch (error) {
          console.error("Database error in getDefectById:", error);
          throw error;
        }
      }
      async createDefect(defect) {
        try {
          const result = await db.insert(defects).values(defect).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createDefect:", error);
          throw error;
        }
      }
      async updateDefect(id, defect) {
        try {
          const result = await db.update(defects).set({ ...defect, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(defects.id, id)).returning();
          if (result.length === 0) {
            throw new Error("Defect not found");
          }
          return result[0];
        } catch (error) {
          console.error("Database error in updateDefect:", error);
          throw error;
        }
      }
      async deleteDefect(id) {
        try {
          await db.delete(defects).where(eq2(defects.id, id));
        } catch (error) {
          console.error("Database error in deleteDefect:", error);
          throw error;
        }
      }
      // Minutes CRUD operations
      async getMinutes(projectId) {
        try {
          let query = db.select().from(minutes).orderBy(desc(minutes.meetingDate));
          if (projectId) {
            query = query.where(eq2(minutes.projectId, projectId));
          }
          const minutes2 = await query;
          return minutes2;
        } catch (error) {
          console.error("Database error in getMinutes:", error);
          throw error;
        }
      }
      async getMinute(id) {
        try {
          const result = await db.select().from(minutes).where(eq2(minutes.id, id));
          return result[0];
        } catch (error) {
          console.error("Database error in getMinute:", error);
          throw error;
        }
      }
      async createMinute(minute) {
        try {
          const result = await db.insert(minutes).values(minute).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createMinute:", error);
          throw error;
        }
      }
      async updateMinute(id, minute) {
        try {
          const result = await db.update(minutes).set({ ...minute, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(minutes.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateMinute:", error);
          throw error;
        }
      }
      async deleteMinute(id) {
        try {
          await db.delete(minutes).where(eq2(minutes.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteMinute:", error);
          throw error;
        }
      }
      // ============================================================
      // SYSTEMS LIBRARY - Folders
      // ============================================================
      async getSystemFolders(companyId, parentId) {
        try {
          let query = db.select().from(systemFolders).where(eq2(systemFolders.companyId, companyId)).orderBy(asc(systemFolders.displayOrder));
          if (parentId === null) {
            query = query.where(sql2`${systemFolders.parentId} IS NULL`);
          } else if (parentId) {
            query = query.where(eq2(systemFolders.parentId, parentId));
          }
          const folders = await query;
          return folders;
        } catch (error) {
          console.error("Database error in getSystemFolders:", error);
          throw error;
        }
      }
      async getSystemFolder(id, companyId) {
        try {
          const result = await db.select().from(systemFolders).where(and(
            eq2(systemFolders.id, id),
            eq2(systemFolders.companyId, companyId)
          ));
          return result[0];
        } catch (error) {
          console.error("Database error in getSystemFolder:", error);
          throw error;
        }
      }
      async createSystemFolder(folder) {
        try {
          const result = await db.insert(systemFolders).values(folder).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createSystemFolder:", error);
          throw error;
        }
      }
      async updateSystemFolder(id, folder, companyId) {
        try {
          const result = await db.update(systemFolders).set({ ...folder, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(systemFolders.id, id),
            eq2(systemFolders.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateSystemFolder:", error);
          throw error;
        }
      }
      async deleteSystemFolder(id, companyId) {
        try {
          await db.delete(systemFolders).where(and(
            eq2(systemFolders.id, id),
            eq2(systemFolders.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteSystemFolder:", error);
          throw error;
        }
      }
      async updateSystemFoldersOrder(updates, companyId) {
        try {
          for (const update of updates) {
            await db.update(systemFolders).set({ displayOrder: update.displayOrder }).where(and(
              eq2(systemFolders.id, update.id),
              eq2(systemFolders.companyId, companyId)
            ));
          }
        } catch (error) {
          console.error("Database error in updateSystemFoldersOrder:", error);
          throw error;
        }
      }
      // ============================================================
      // SYSTEMS LIBRARY - Documents
      // ============================================================
      async getSystemDocuments(companyId, folderId) {
        try {
          let query = db.select().from(systemDocuments).where(eq2(systemDocuments.companyId, companyId)).orderBy(desc(systemDocuments.createdAt));
          if (folderId !== void 0) {
            if (folderId === null) {
              query = query.where(sql2`${systemDocuments.folderId} IS NULL`);
            } else {
              query = query.where(eq2(systemDocuments.folderId, folderId));
            }
          }
          const documents = await query;
          return documents;
        } catch (error) {
          console.error("Database error in getSystemDocuments:", error);
          throw error;
        }
      }
      async getSystemDocument(id, companyId) {
        try {
          const result = await db.select().from(systemDocuments).where(and(
            eq2(systemDocuments.id, id),
            eq2(systemDocuments.companyId, companyId)
          ));
          return result[0];
        } catch (error) {
          console.error("Database error in getSystemDocument:", error);
          throw error;
        }
      }
      async createSystemDocument(document) {
        try {
          const result = await db.insert(systemDocuments).values(document).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createSystemDocument:", error);
          throw error;
        }
      }
      async updateSystemDocument(id, document, companyId) {
        try {
          const result = await db.update(systemDocuments).set({ ...document, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(systemDocuments.id, id),
            eq2(systemDocuments.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateSystemDocument:", error);
          throw error;
        }
      }
      async deleteSystemDocument(id, companyId) {
        try {
          await db.delete(systemDocuments).where(and(
            eq2(systemDocuments.id, id),
            eq2(systemDocuments.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteSystemDocument:", error);
          throw error;
        }
      }
      async updateSystemDocumentsOrder(updates, companyId) {
        try {
          for (const update of updates) {
            const updateData = { displayOrder: update.displayOrder };
            if (update.folderId !== void 0) {
              updateData.folderId = update.folderId;
            }
            await db.update(systemDocuments).set(updateData).where(and(
              eq2(systemDocuments.id, update.id),
              eq2(systemDocuments.companyId, companyId)
            ));
          }
        } catch (error) {
          console.error("Database error in updateSystemDocumentsOrder:", error);
          throw error;
        }
      }
      // ============================================================
      // SYSTEMS LIBRARY - Task Templates
      // ============================================================
      async getTaskTemplates(companyId, isActive) {
        try {
          let query = db.select().from(taskTemplates).where(eq2(taskTemplates.companyId, companyId)).orderBy(asc(taskTemplates.title));
          if (isActive !== void 0) {
            query = query.where(eq2(taskTemplates.isActive, isActive));
          }
          const templates = await query;
          return templates;
        } catch (error) {
          console.error("Database error in getTaskTemplates:", error);
          throw error;
        }
      }
      async getTaskTemplate(id, companyId) {
        try {
          const result = await db.select().from(taskTemplates).where(and(
            eq2(taskTemplates.id, id),
            eq2(taskTemplates.companyId, companyId)
          ));
          return result[0];
        } catch (error) {
          console.error("Database error in getTaskTemplate:", error);
          throw error;
        }
      }
      async createTaskTemplate(template) {
        try {
          const result = await db.insert(taskTemplates).values(template).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createTaskTemplate:", error);
          throw error;
        }
      }
      async updateTaskTemplate(id, template, companyId) {
        try {
          const result = await db.update(taskTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(taskTemplates.id, id),
            eq2(taskTemplates.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateTaskTemplate:", error);
          throw error;
        }
      }
      async deleteTaskTemplate(id, companyId) {
        try {
          await db.delete(taskTemplates).where(and(
            eq2(taskTemplates.id, id),
            eq2(taskTemplates.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteTaskTemplate:", error);
          throw error;
        }
      }
      async generateRecurringTasks(companyId) {
        try {
          const templates = await db.select().from(taskTemplates).where(and(
            eq2(taskTemplates.companyId, companyId),
            eq2(taskTemplates.isActive, true),
            eq2(taskTemplates.isRecurringTemplate, true)
          ));
          if (templates.length === 0) {
            return { generated: 0 };
          }
          const existingTasks = await db.select().from(notes).where(and(
            eq2(notes.companyId, companyId),
            eq2(notes.type, "task")
          ));
          const existingTaskKeys = /* @__PURE__ */ new Set();
          for (const task of existingTasks) {
            const taskData = task;
            if (taskData.templateId && taskData.dueDate) {
              const assigneeId = taskData.assigneeId || "unassigned";
              const dateStr = getRecurringTaskKey(taskData.templateId, taskData.dueDate);
              const key = `${dateStr}:${assigneeId}`;
              existingTaskKeys.add(key);
            }
          }
          const allUsers = await db.select().from(users).where(
            and(
              eq2(users.companyId, companyId),
              eq2(users.isActive, true)
            )
          );
          let generatedCount = 0;
          for (const template of templates) {
            const instances = generateRecurringTaskInstances(template, existingTaskKeys);
            let assignees = [];
            if (template.defaultRoleId) {
              assignees = allUsers.filter((user) => user.roleId === template.defaultRoleId);
            } else if (template.recurringAssigneeId) {
              const singleUser = allUsers.find((user) => user.id === template.recurringAssigneeId);
              if (singleUser) assignees = [singleUser];
            }
            for (const instance of instances) {
              if (assignees.length === 0) {
                const dateKey = getRecurringTaskKey(instance.templateId, instance.dueDate);
                const taskKey = `${dateKey}:unassigned`;
                if (!existingTaskKeys.has(taskKey)) {
                  const taskData = {
                    title: instance.title,
                    content: instance.content || "",
                    author: "System",
                    // Auto-generated by recurring template
                    type: "task",
                    priority: instance.priority,
                    status: "todo",
                    assigneeId: void 0,
                    assigneeName: void 0,
                    dueDate: instance.dueDate,
                    startTime: instance.startTime,
                    endTime: instance.endTime,
                    tags: [],
                    labels: [],
                    category: instance.category,
                    templateId: instance.templateId,
                    companyId
                  };
                  await db.insert(notes).values(taskData);
                  existingTaskKeys.add(taskKey);
                  generatedCount++;
                }
              } else {
                for (const assignee of assignees) {
                  const dateKey = getRecurringTaskKey(instance.templateId, instance.dueDate);
                  const taskKey = `${dateKey}:${assignee.id}`;
                  if (!existingTaskKeys.has(taskKey)) {
                    const taskData = {
                      title: instance.title,
                      content: instance.content || "",
                      author: "System",
                      type: "task",
                      priority: instance.priority,
                      status: "todo",
                      assigneeId: assignee.id,
                      assigneeName: `${assignee.firstName} ${assignee.lastName}`,
                      dueDate: instance.dueDate,
                      startTime: instance.startTime,
                      endTime: instance.endTime,
                      tags: [],
                      labels: [],
                      category: instance.category,
                      templateId: instance.templateId,
                      companyId
                    };
                    await db.insert(notes).values(taskData);
                    existingTaskKeys.add(taskKey);
                    generatedCount++;
                  }
                }
              }
            }
          }
          return { generated: generatedCount };
        } catch (error) {
          console.error("Database error in generateRecurringTasks:", error);
          throw error;
        }
      }
      async clearAndRegenerateTemplateTask(templateId, companyId) {
        try {
          const deletedTasks = await db.delete(notes).where(and(
            eq2(notes.templateId, templateId),
            eq2(notes.companyId, companyId),
            eq2(notes.type, "task")
          )).returning();
          const deletedCount = deletedTasks.length;
          const template = await this.getTaskTemplate(templateId, companyId);
          if (!template || !template.isRecurringTemplate) {
            return { deleted: deletedCount, generated: 0 };
          }
          const allUsers = await db.select().from(users).where(eq2(users.companyId, companyId));
          const instances = generateRecurringTaskInstances(template, /* @__PURE__ */ new Set());
          let assignees = [];
          if (template.defaultRoleId) {
            assignees = allUsers.filter((user) => user.roleId === template.defaultRoleId);
          }
          let generatedCount = 0;
          for (const instance of instances) {
            if (assignees.length === 0) {
              const taskData = {
                title: instance.title,
                content: instance.content || "",
                author: "System",
                type: "task",
                priority: instance.priority,
                status: "todo",
                assigneeId: instance.assigneeId,
                assigneeName: instance.assigneeId ? allUsers.find((u) => u.id === instance.assigneeId)?.firstName + " " + allUsers.find((u) => u.id === instance.assigneeId)?.lastName : void 0,
                dueDate: instance.dueDate,
                startTime: instance.startTime,
                endTime: instance.endTime,
                tags: [],
                labels: [],
                category: instance.category,
                templateId: instance.templateId,
                companyId
              };
              await db.insert(notes).values(taskData);
              generatedCount++;
            } else {
              for (const assignee of assignees) {
                const taskData = {
                  title: instance.title,
                  content: instance.content || "",
                  author: "System",
                  type: "task",
                  priority: instance.priority,
                  status: "todo",
                  assigneeId: assignee.id,
                  assigneeName: `${assignee.firstName} ${assignee.lastName}`,
                  dueDate: instance.dueDate,
                  startTime: instance.startTime,
                  endTime: instance.endTime,
                  tags: [],
                  labels: [],
                  category: instance.category,
                  templateId: instance.templateId,
                  companyId
                };
                await db.insert(notes).values(taskData);
                generatedCount++;
              }
            }
          }
          return { deleted: deletedCount, generated: generatedCount };
        } catch (error) {
          console.error("Database error in clearAndRegenerateTemplateTask:", error);
          throw error;
        }
      }
      // ============================================================
      // SYSTEMS LIBRARY - Workflow Templates
      // ============================================================
      async getWorkflowTemplates(companyId, isActive) {
        try {
          let query = db.select().from(workflowTemplates).where(eq2(workflowTemplates.companyId, companyId)).orderBy(asc(workflowTemplates.name));
          if (isActive !== void 0) {
            query = query.where(eq2(workflowTemplates.isActive, isActive));
          }
          const templates = await query;
          return templates;
        } catch (error) {
          console.error("Database error in getWorkflowTemplates:", error);
          throw error;
        }
      }
      async getWorkflowTemplate(id, companyId) {
        try {
          const result = await db.select().from(workflowTemplates).where(and(
            eq2(workflowTemplates.id, id),
            eq2(workflowTemplates.companyId, companyId)
          ));
          return result[0];
        } catch (error) {
          console.error("Database error in getWorkflowTemplate:", error);
          throw error;
        }
      }
      async createWorkflowTemplate(template) {
        try {
          const result = await db.insert(workflowTemplates).values(template).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createWorkflowTemplate:", error);
          throw error;
        }
      }
      async updateWorkflowTemplate(id, template, companyId) {
        try {
          const result = await db.update(workflowTemplates).set({ ...template, updatedAt: /* @__PURE__ */ new Date() }).where(and(
            eq2(workflowTemplates.id, id),
            eq2(workflowTemplates.companyId, companyId)
          )).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateWorkflowTemplate:", error);
          throw error;
        }
      }
      async deleteWorkflowTemplate(id, companyId) {
        try {
          await db.delete(workflowTemplates).where(and(
            eq2(workflowTemplates.id, id),
            eq2(workflowTemplates.companyId, companyId)
          ));
          return true;
        } catch (error) {
          console.error("Database error in deleteWorkflowTemplate:", error);
          throw error;
        }
      }
      // ============================================================
      // SYSTEMS LIBRARY - Project Workflows
      // ============================================================
      async getProjectWorkflows(projectId) {
        try {
          const workflows = await db.select().from(projectWorkflows).where(eq2(projectWorkflows.projectId, projectId)).orderBy(desc(projectWorkflows.triggeredAt));
          return workflows;
        } catch (error) {
          console.error("Database error in getProjectWorkflows:", error);
          throw error;
        }
      }
      async getProjectWorkflow(id) {
        try {
          const result = await db.select().from(projectWorkflows).where(eq2(projectWorkflows.id, id));
          return result[0];
        } catch (error) {
          console.error("Database error in getProjectWorkflow:", error);
          throw error;
        }
      }
      async createProjectWorkflow(workflow) {
        try {
          const result = await db.insert(projectWorkflows).values(workflow).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createProjectWorkflow:", error);
          throw error;
        }
      }
      async updateProjectWorkflow(id, workflow) {
        try {
          const result = await db.update(projectWorkflows).set({ ...workflow, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(projectWorkflows.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateProjectWorkflow:", error);
          throw error;
        }
      }
      async deleteProjectWorkflow(id) {
        try {
          await db.delete(projectWorkflows).where(eq2(projectWorkflows.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteProjectWorkflow:", error);
          throw error;
        }
      }
      // ============================================================================
      // MESSAGING METHODS
      // ============================================================================
      // Channels
      async getChannels(companyId, userId) {
        try {
          const query = db.select().from(channels).where(
            and(
              eq2(channels.companyId, companyId),
              eq2(channels.isArchived, false)
            )
          ).orderBy(asc(channels.name));
          const channels2 = await query;
          if (userId) {
            const memberChannelIds = await db.select({ channelId: channelMembers.channelId }).from(channelMembers).where(eq2(channelMembers.userId, userId));
            const channelIdsSet = new Set(memberChannelIds.map((m) => m.channelId));
            return channels2.filter((c) => channelIdsSet.has(c.id));
          }
          return channels2;
        } catch (error) {
          console.error("Database error in getChannels:", error);
          throw error;
        }
      }
      async getChannel(id, companyId) {
        try {
          const result = await db.select().from(channels).where(
            and(
              eq2(channels.id, id),
              eq2(channels.companyId, companyId)
            )
          ).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getChannel:", error);
          throw error;
        }
      }
      async createChannel(channel) {
        try {
          const result = await db.insert(channels).values(channel).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createChannel:", error);
          throw error;
        }
      }
      async updateChannel(id, channel, companyId) {
        try {
          const result = await db.update(channels).set({ ...channel, updatedAt: /* @__PURE__ */ new Date() }).where(
            and(
              eq2(channels.id, id),
              eq2(channels.companyId, companyId)
            )
          ).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateChannel:", error);
          throw error;
        }
      }
      async deleteChannel(id, companyId) {
        try {
          await db.delete(channels).where(
            and(
              eq2(channels.id, id),
              eq2(channels.companyId, companyId)
            )
          );
          return true;
        } catch (error) {
          console.error("Database error in deleteChannel:", error);
          throw error;
        }
      }
      async getOrCreateDMChannel(userId1, userId2, companyId) {
        try {
          const [user1, user2] = [userId1, userId2].sort();
          const dmParticipants = [user1, user2];
          const existing = await db.select().from(channels).where(
            and(
              eq2(channels.companyId, companyId),
              eq2(channels.type, "dm"),
              sql2`${channels.dmParticipants}::jsonb @> ${JSON.stringify(dmParticipants)}::jsonb`
            )
          ).limit(1);
          if (existing.length > 0) {
            return existing[0];
          }
          const users2 = await Promise.all([
            this.getUser(user1),
            this.getUser(user2)
          ]);
          const dmName = `dm-${users2[0]?.firstName || users2[0]?.email}-${users2[1]?.firstName || users2[1]?.email}`;
          const newChannel = await this.createChannel({
            name: dmName,
            type: "dm",
            dmParticipants,
            companyId,
            createdById: userId1
          });
          await Promise.all([
            this.addChannelMember({ channelId: newChannel.id, userId: user1, role: "member" }),
            this.addChannelMember({ channelId: newChannel.id, userId: user2, role: "member" })
          ]);
          return newChannel;
        } catch (error) {
          console.error("Database error in getOrCreateDMChannel:", error);
          throw error;
        }
      }
      // Channel Members
      async getChannelMembers(channelId) {
        try {
          const members = await db.select().from(channelMembers).where(eq2(channelMembers.channelId, channelId)).orderBy(asc(channelMembers.joinedAt));
          return members;
        } catch (error) {
          console.error("Database error in getChannelMembers:", error);
          throw error;
        }
      }
      async addChannelMember(member) {
        try {
          const result = await db.insert(channelMembers).values(member).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in addChannelMember:", error);
          throw error;
        }
      }
      async removeChannelMember(channelId, userId) {
        try {
          await db.delete(channelMembers).where(
            and(
              eq2(channelMembers.channelId, channelId),
              eq2(channelMembers.userId, userId)
            )
          );
          return true;
        } catch (error) {
          console.error("Database error in removeChannelMember:", error);
          throw error;
        }
      }
      async updateChannelMemberLastRead(channelId, userId) {
        try {
          await db.update(channelMembers).set({ lastReadAt: /* @__PURE__ */ new Date() }).where(
            and(
              eq2(channelMembers.channelId, channelId),
              eq2(channelMembers.userId, userId)
            )
          );
        } catch (error) {
          console.error("Database error in updateChannelMemberLastRead:", error);
          throw error;
        }
      }
      async getUnreadCounts(userId, companyId) {
        try {
          const channelsWithMembers = await db.select({
            channelId: channelMembers.channelId,
            lastReadAt: channelMembers.lastReadAt
          }).from(channelMembers).innerJoin(channels, eq2(channelMembers.channelId, channels.id)).where(
            and(
              eq2(channelMembers.userId, userId),
              eq2(channels.companyId, companyId)
            )
          );
          const unreadCounts = {};
          for (const { channelId, lastReadAt } of channelsWithMembers) {
            const conditions = [
              eq2(messages.channelId, channelId),
              eq2(messages.isDeleted, false)
            ];
            if (lastReadAt) {
              conditions.push(gt(messages.createdAt, lastReadAt));
            }
            const result = await db.select({ count: sql2`count(*)` }).from(messages).where(and(...conditions));
            unreadCounts[channelId] = Number(result[0]?.count || 0);
          }
          return unreadCounts;
        } catch (error) {
          console.error("Database error in getUnreadCounts:", error);
          throw error;
        }
      }
      // Messages
      async getMessages(channelId, limit = 100, before) {
        try {
          let query = db.select().from(messages).where(
            and(
              eq2(messages.channelId, channelId),
              eq2(messages.isDeleted, false)
            )
          );
          if (before) {
            query = query.where(
              and(
                eq2(messages.channelId, channelId),
                eq2(messages.isDeleted, false),
                sql2`${messages.createdAt} < (SELECT created_at FROM ${messages} WHERE id = ${before})`
              )
            );
          }
          const messages2 = await query.orderBy(desc(messages.createdAt)).limit(limit);
          return messages2.reverse();
        } catch (error) {
          console.error("Database error in getMessages:", error);
          throw error;
        }
      }
      async getMessage(id) {
        try {
          const result = await db.select().from(messages).where(eq2(messages.id, id)).limit(1);
          return result[0];
        } catch (error) {
          console.error("Database error in getMessage:", error);
          throw error;
        }
      }
      async createMessage(message) {
        try {
          const user = await this.getUser(message.userId);
          const messageWithUserInfo = {
            ...message,
            userFirstName: user?.firstName || null,
            userLastName: user?.lastName || null,
            userEmail: user?.email || null
          };
          const result = await db.insert(messages).values(messageWithUserInfo).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in createMessage:", error);
          throw error;
        }
      }
      async updateMessage(id, message) {
        try {
          const result = await db.update(messages).set({ ...message, updatedAt: /* @__PURE__ */ new Date(), isEdited: true }).where(eq2(messages.id, id)).returning();
          return result[0];
        } catch (error) {
          console.error("Database error in updateMessage:", error);
          throw error;
        }
      }
      async deleteMessage(id) {
        try {
          await db.update(messages).set({ isDeleted: true, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(messages.id, id));
          return true;
        } catch (error) {
          console.error("Database error in deleteMessage:", error);
          throw error;
        }
      }
    };
    dbStorage = new DbStorage();
    storage = dbStorage;
    dbStorage.initialize().catch(console.error);
  }
});

// server/utils/googleCalendar.ts
var googleCalendar_exports = {};
__export(googleCalendar_exports, {
  getGoogleCalendarConnectionInfo: () => getGoogleCalendarConnectionInfo,
  getUncachableGoogleCalendarClient: () => getUncachableGoogleCalendarClient,
  isGoogleCalendarConnected: () => isGoogleCalendarConnected
});
import { google } from "googleapis";
async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY ? "repl " + process.env.REPL_IDENTITY : process.env.WEB_REPL_RENEWAL ? "depl " + process.env.WEB_REPL_RENEWAL : null;
  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }
  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=google-calendar",
    {
      headers: {
        "Accept": "application/json",
        "X_REPLIT_TOKEN": xReplitToken
      }
    }
  ).then((res) => res.json()).then((data) => data.items?.[0]);
  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error("Google Calendar not connected");
  }
  return accessToken;
}
async function getUncachableGoogleCalendarClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });
  return google.calendar({ version: "v3", auth: oauth2Client });
}
async function isGoogleCalendarConnected() {
  try {
    await getAccessToken();
    return true;
  } catch (error) {
    return false;
  }
}
async function getGoogleCalendarConnectionInfo() {
  try {
    const client2 = await getUncachableGoogleCalendarClient();
    const calendarList = await client2.calendarList.list();
    const primaryCalendar = calendarList.data.items?.find((cal) => cal.primary);
    return {
      connected: true,
      email: primaryCalendar?.id || null,
      calendars: calendarList.data.items || []
    };
  } catch (error) {
    return {
      connected: false,
      email: null,
      calendars: []
    };
  }
}
var connectionSettings;
var init_googleCalendar = __esm({
  "server/utils/googleCalendar.ts"() {
    "use strict";
  }
});

// server/services/ocr.ts
var ocr_exports = {};
__export(ocr_exports, {
  MindeeOCRService: () => MindeeOCRService,
  getOCRService: () => getOCRService
});
import * as mindee from "mindee";
function getOCRService() {
  if (!ocrService) {
    ocrService = new MindeeOCRService();
  }
  return ocrService;
}
var MindeeOCRService, ocrService;
var init_ocr = __esm({
  "server/services/ocr.ts"() {
    "use strict";
    MindeeOCRService = class {
      client;
      constructor() {
        const apiKey = process.env.MINDEE_API_KEY;
        if (!apiKey) {
          throw new Error("MINDEE_API_KEY environment variable is not set");
        }
        this.client = new mindee.Client({ apiKey });
      }
      async extractInvoiceData(fileBuffer, fileName) {
        try {
          const inputSource = this.client.docFromBuffer(fileBuffer, fileName);
          const apiResponse = await this.client.parse(
            mindee.product.InvoiceV4,
            inputSource
          );
          const invoice = apiResponse.document.inference.prediction;
          const lineItems = invoice.lineItems.map((item) => ({
            description: item.description?.value || "",
            quantity: item.quantity?.value || 1,
            unitPrice: item.unitPrice?.value || 0,
            totalAmount: item.totalAmount?.value || 0,
            taxAmount: item.tax?.value || 0
          }));
          const result = {
            invoiceNumber: invoice.invoiceNumber?.value || void 0,
            invoiceDate: invoice.date?.value || void 0,
            dueDate: invoice.dueDate?.value || void 0,
            supplierName: invoice.supplierName?.value || void 0,
            supplierAddress: invoice.supplierAddress?.value || void 0,
            supplierEmail: void 0,
            supplierPhone: void 0,
            // Convert from dollars to cents
            totalAmount: invoice.totalAmount?.value ? Math.round(invoice.totalAmount.value * 100) : void 0,
            totalTax: invoice.totalTax?.value ? Math.round(invoice.totalTax.value * 100) : void 0,
            subtotalAmount: invoice.totalNet?.value ? Math.round(invoice.totalNet.value * 100) : void 0,
            lineItems: lineItems.map((item) => ({
              ...item,
              unitPrice: Math.round((item.unitPrice || 0) * 100),
              totalAmount: Math.round((item.totalAmount || 0) * 100),
              taxAmount: Math.round((item.taxAmount || 0) * 100)
            })),
            currency: invoice.locale?.currency || "AUD",
            confidence: 0
          };
          return result;
        } catch (error) {
          console.error("Mindee OCR Error:", error);
          throw new Error(`Failed to process invoice with OCR: ${error.message}`);
        }
      }
      async processInvoiceFromBase64(base64Data, fileName) {
        const base64Clean = base64Data.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(base64Clean, "base64");
        return this.extractInvoiceData(buffer, fileName);
      }
    };
    ocrService = null;
  }
});

// server/services/emailParser.ts
var emailParser_exports = {};
__export(emailParser_exports, {
  EmailParserService: () => EmailParserService,
  getEmailParserService: () => getEmailParserService
});
function getEmailParserService() {
  if (!emailParserService) {
    emailParserService = new EmailParserService();
  }
  return emailParserService;
}
var EmailParserService, emailParserService;
var init_emailParser = __esm({
  "server/services/emailParser.ts"() {
    "use strict";
    EmailParserService = class {
      /**
       * Parse SendGrid inbound email format
       * @param data - Email metadata from SendGrid (multipart body fields)
       * @param files - Attachment files from multer (when using multipart/form-data)
       */
      parseSendGridEmail(data, files) {
        const attachments = [];
        if (files && files.length > 0) {
          let attachmentInfo = {};
          try {
            if (data["attachment-info"]) {
              attachmentInfo = JSON.parse(data["attachment-info"]);
            }
          } catch (e) {
            console.warn("Failed to parse attachment-info:", e);
          }
          for (const file of files) {
            const filename = file.originalname || file.fieldname || "attachment";
            let contentType = file.mimetype;
            if (!contentType || contentType === "application/octet-stream") {
              const ext = filename.split(".").pop()?.toLowerCase();
              const typeMap = {
                "pdf": "application/pdf",
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "gif": "image/gif"
              };
              contentType = typeMap[ext || ""] || "application/octet-stream";
            }
            attachments.push({
              filename,
              contentType,
              content: file.buffer,
              size: file.size
            });
          }
        } else {
          const attachmentCount = data.attachments || 0;
          for (let i = 1; i <= attachmentCount; i++) {
            const attachmentData = data[`attachment${i}`];
            const attachmentInfo = data.attachment_info ? JSON.parse(data.attachment_info) : {};
            if (attachmentData) {
              const info = attachmentInfo[`attachment${i}`] || {};
              attachments.push({
                filename: info.filename || `attachment${i}`,
                contentType: info.type || "application/octet-stream",
                content: attachmentData,
                size: attachmentData.length
              });
            }
          }
        }
        return {
          from: data.from,
          to: data.to,
          subject: data.subject,
          text: data.text,
          html: data.html,
          attachments,
          receivedAt: /* @__PURE__ */ new Date()
        };
      }
      /**
       * Filter attachments to only invoice-like documents (PDF, images)
       */
      filterInvoiceAttachments(attachments) {
        const validTypes = [
          "application/pdf",
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif"
        ];
        return attachments.filter((att) => {
          const contentType = att.contentType.toLowerCase();
          if (validTypes.includes(contentType)) {
            return true;
          }
          if (contentType === "application/octet-stream" || !contentType) {
            const ext2 = att.filename.split(".").pop()?.toLowerCase();
            return ["pdf", "jpg", "jpeg", "png", "gif"].includes(ext2 || "");
          }
          const ext = att.filename.split(".").pop()?.toLowerCase();
          return ["pdf", "jpg", "jpeg", "png", "gif"].includes(ext || "");
        });
      }
      /**
       * Extract project hint from email subject or body
       * e.g., "Invoice for Project ABC" or "[ProjectXYZ] Invoice"
       */
      extractProjectHint(email) {
        const text2 = `${email.subject} ${email.text || ""}`.toLowerCase();
        const bracketMatch = text2.match(/\[([^\]]+)\]/);
        if (bracketMatch) {
          return bracketMatch[1];
        }
        const colonMatch = text2.match(/project[:\s]+([^\s,\.]+)/i);
        if (colonMatch) {
          return colonMatch[1];
        }
        return null;
      }
      /**
       * Extract supplier hint from email
       */
      extractSupplierHint(email) {
        const fromMatch = email.from.match(/<([^>]+)>/);
        const fromEmail = fromMatch ? fromMatch[1] : email.from;
        const domainMatch = fromEmail.match(/@([^\.]+)/);
        if (domainMatch) {
          return domainMatch[1];
        }
        return null;
      }
    };
    emailParserService = null;
  }
});

// server/services/autoBillCreator.ts
var autoBillCreator_exports = {};
__export(autoBillCreator_exports, {
  AutoBillCreatorService: () => AutoBillCreatorService,
  getAutoBillCreatorService: () => getAutoBillCreatorService
});
function getAutoBillCreatorService() {
  if (!autoBillCreatorService) {
    autoBillCreatorService = new AutoBillCreatorService();
  }
  return autoBillCreatorService;
}
var AutoBillCreatorService, autoBillCreatorService;
var init_autoBillCreator = __esm({
  "server/services/autoBillCreator.ts"() {
    "use strict";
    init_ocr();
    init_emailParser();
    init_storage();
    AutoBillCreatorService = class {
      /**
       * Process email and create bills from attachments
       */
      async processEmailInvoices(email, options) {
        const emailParser = getEmailParserService();
        const ocrService2 = getOCRService();
        const invoiceAttachments = emailParser.filterInvoiceAttachments(email.attachments);
        if (invoiceAttachments.length === 0) {
          return [{
            success: false,
            error: "No invoice attachments found (PDF or images)"
          }];
        }
        const results = [];
        for (const attachment of invoiceAttachments) {
          try {
            const result = await this.createBillFromAttachment(
              attachment.content,
              attachment.filename,
              email,
              options
            );
            results.push(result);
          } catch (error) {
            results.push({
              success: false,
              error: `Failed to process ${attachment.filename}: ${error.message}`
            });
          }
        }
        return results;
      }
      /**
       * Create a bill from a single attachment
       */
      async createBillFromAttachment(fileContent, fileName, email, options) {
        const ocrService2 = getOCRService();
        const emailParser = getEmailParserService();
        const base64Data = Buffer.isBuffer(fileContent) ? fileContent.toString("base64") : fileContent;
        const ocrData = await ocrService2.processInvoiceFromBase64(base64Data, fileName);
        let projectId = options.defaultProjectId;
        if (!projectId) {
          const projectHint = emailParser.extractProjectHint(email);
          if (projectHint && options.autoMatch) {
            const projects2 = await storage.getProjects();
            const matchedProject = projects2.find(
              (p) => p.name.toLowerCase().includes(projectHint.toLowerCase())
            );
            if (matchedProject) {
              projectId = matchedProject.id;
            }
          }
          if (!projectId) {
            const projects2 = await storage.getProjects();
            const activeProject = projects2.find((p) => p.isActive);
            if (activeProject) {
              projectId = activeProject.id;
            } else {
              throw new Error("No active project found. Please set a default project.");
            }
          }
        }
        let supplierId;
        let supplierName = ocrData.supplierName || emailParser.extractSupplierHint(email) || "Unknown Supplier";
        if (options.autoMatch && ocrData.supplierName) {
          const suppliers2 = await storage.getSuppliers();
          const matchedSupplier = suppliers2.find(
            (s) => s.name.toLowerCase() === ocrData.supplierName.toLowerCase()
          );
          if (matchedSupplier) {
            supplierId = matchedSupplier.id;
            supplierName = matchedSupplier.name;
          } else {
            const newSupplier = await storage.createSupplier({
              name: ocrData.supplierName,
              email: ocrData.supplierEmail,
              phone: ocrData.supplierPhone,
              address: ocrData.supplierAddress,
              isActive: true
            });
            supplierId = newSupplier.id;
            supplierName = newSupplier.name;
          }
        } else {
          const suppliers2 = await storage.getSuppliers();
          if (suppliers2.length > 0) {
            supplierId = suppliers2[0].id;
            supplierName = suppliers2[0].name;
          } else {
            throw new Error("No suppliers found. Please create at least one supplier.");
          }
        }
        const bills2 = await storage.getBills();
        const billNumber = `BILL-${String(bills2.length + 1).padStart(5, "0")}`;
        const billData = {
          billNumber,
          projectId,
          supplierId,
          billType: "bill",
          status: "draft",
          billDate: ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : /* @__PURE__ */ new Date(),
          dueDate: ocrData.dueDate ? new Date(ocrData.dueDate) : void 0,
          billReference: ocrData.invoiceNumber,
          notes: `Auto-created from email: ${email.subject}
From: ${email.from}`,
          subtotal: ocrData.subtotalAmount || 0,
          tax: ocrData.totalTax || 0,
          total: ocrData.totalAmount || 0,
          paidAmount: 0,
          sendToXero: false,
          ocrProcessed: true,
          ocrData,
          attachmentUrls: [],
          // Would store file URL here if we had file storage
          createdById: options.defaultUserId
        };
        const createdBill = await storage.createBill(billData);
        if (ocrData.lineItems && ocrData.lineItems.length > 0) {
          const costCodes2 = await storage.getCostCodes(projectId);
          const defaultCostCode = costCodes2.find((cc) => cc.isActive);
          for (let i = 0; i < ocrData.lineItems.length; i++) {
            const item = ocrData.lineItems[i];
            const lineItemData = {
              billId: createdBill.id,
              lineType: "custom",
              description: item.description || `Line Item ${i + 1}`,
              costCodeId: defaultCostCode?.id,
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || 0,
              tax: item.taxAmount ? "GST on expenses" : "No GST",
              account: "Expenses",
              total: item.totalAmount || 0,
              order: i
            };
            await storage.createBillLineItem(lineItemData);
          }
        }
        const project = await storage.getProject(projectId);
        return {
          success: true,
          billId: createdBill.id,
          billNumber: createdBill.billNumber,
          supplierName,
          projectName: project?.name,
          total: createdBill.total
        };
      }
    };
    autoBillCreatorService = null;
  }
});

// server/index.ts
import express2 from "express";

// server/routes.ts
init_storage();
init_db();
import { createServer } from "http";
import { google as google2 } from "googleapis";
import { randomBytes as randomBytes2 } from "crypto";

// server/replitAuth.ts
init_storage();
import * as client from "openid-client";
import { Strategy } from "openid-client/passport";
import passport from "passport";
import session from "express-session";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
var getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID
    );
  },
  { maxAge: 3600 * 1e3 }
);
var sessionMiddleware = (() => {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  return session({
    secret: process.env.SESSION_SECRET || "buildpro-secret-key-2025",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      // REQUIRED with sameSite: 'none' - browsers reject otherwise
      sameSite: "none",
      // Required for Replit iframe
      maxAge: 24 * 60 * 60 * 1e3
    }
  });
})();
function updateUserSession(user, tokens) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}
async function upsertUser(claims) {
  const userData = {
    id: claims["sub"],
    email: claims["email"] || null,
    firstName: claims["first_name"] || claims["name"]?.split(" ")[0] || null,
    lastName: claims["last_name"] || claims["name"]?.split(" ").slice(1).join(" ") || null,
    profileImageUrl: claims["profile_image_url"] || null
  };
  const user = await storage.upsertUser(userData);
  return user;
}
async function setupAuth(app2) {
  app2.set("trust proxy", 1);
  app2.use(sessionMiddleware);
  app2.use(passport.initialize());
  app2.use(passport.session());
  const config = await getOidcConfig();
  const domains = process.env.REPLIT_DOMAINS?.split(",") || [];
  const isProduction = domains.length > 0 && domains.every((d) => d.trim().endsWith(".replit.app"));
  console.log("[Replit Auth Setup]", {
    replId: process.env.REPL_ID,
    domains: process.env.REPLIT_DOMAINS,
    isProduction,
    issuer: process.env.ISSUER_URL || "https://replit.com/oidc"
  });
  const verify = async (tokens, verified) => {
    const sessionData = {};
    updateUserSession(sessionData, tokens);
    const user = await upsertUser(tokens.claims());
    sessionData.dbUser = user;
    sessionData.userId = user.id;
    verified(null, sessionData);
  };
  const registeredStrategies = /* @__PURE__ */ new Set();
  const ensureStrategy = (domain) => {
    const strategyName = `replitauth:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: `https://${domain}/api/callback`
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };
  passport.serializeUser((sessionData, cb) => cb(null, sessionData));
  passport.deserializeUser(async (sessionData, cb) => {
    try {
      const data = sessionData;
      if (data.userId) {
        const user = await storage.getUser(data.userId);
        if (user) {
          data.dbUser = user;
          console.log(`[Passport Deserialize] User ${user.id}: companyId=${user.companyId}, roleId=${user.roleId}`);
          if (!user.companyId) {
            console.warn(`\u26A0\uFE0F  [Passport Deserialize] User ${user.id} has NO companyId!`);
          }
        } else {
          console.warn(`\u26A0\uFE0F  [Passport Deserialize] No user found for userId=${data.userId}`);
        }
      } else if (data.claims?.sub) {
        console.warn(`\u26A0\uFE0F  [Passport Deserialize] Legacy session detected - using claims.sub=${data.claims.sub}`);
        const user = await storage.getUser(data.claims.sub);
        if (user) {
          data.dbUser = user;
          data.userId = user.id;
        }
      }
      cb(null, data);
    } catch (error) {
      console.error("[Passport Deserialize] Error:", error);
      cb(error);
    }
  });
  app2.get("/api/login", (req, res, next) => {
    const hostname = req.hostname;
    const protocol = req.protocol;
    const callbackUrl = `${protocol}://${hostname}/api/callback`;
    console.log(`[OAuth Login] hostname: ${hostname}, protocol: ${protocol}, callback: ${callbackUrl}, cookie sameSite: ${isProduction ? "lax" : "none"}`);
    ensureStrategy(hostname);
    passport.authenticate(`replitauth:${hostname}`, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"]
    })(req, res, next);
  });
  app2.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname);
    passport.authenticate(`replitauth:${req.hostname}`, {
      failureRedirect: "/api/login"
    })(req, res, (err) => {
      if (err) {
        console.error("[OAuth Callback] Authentication failed:", err);
        return next(err);
      }
      const user = req.user?.dbUser;
      req.session.userId = user?.id;
      req.session.companyId = user?.companyId;
      req.session.roleId = user?.roleId;
      console.log("\u2705 [OAuth Callback] LOGIN SUCCESS");
      console.log("   \u2192 Session ID:", req.sessionID);
      console.log("   \u2192 User ID:", user?.id);
      console.log("   \u2192 Company ID:", user?.companyId);
      console.log("   \u2192 Role ID:", user?.roleId);
      console.log("   \u2192 SESSION SET:", {
        userId: req.session.userId,
        companyId: req.session.companyId,
        roleId: req.session.roleId
      });
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[OAuth Callback] Session save failed:", saveErr);
          return res.redirect("/api/login");
        }
        console.log("\u2705 [OAuth Callback] Session saved, redirecting to /");
        res.redirect("/");
      });
    });
  });
  app2.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`
        }).href
      );
    });
  });
}
var ensureLegacySessionFields = (req, res, next) => {
  const user = req.user;
  if (req.isAuthenticated() && user?.dbUser) {
    req.session.userId = user.dbUser.id;
    req.session.companyId = user.dbUser.companyId;
    req.session.roleId = user.dbUser.roleId;
  }
  next();
};
var isAuthenticated = async (req, res, next) => {
  const user = req.user;
  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const now = Math.floor(Date.now() / 1e3);
  if (now <= user.expires_at) {
    return next();
  }
  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};

// server/routes.ts
init_schema();
init_auth();
import { z as z2 } from "zod";
import { fromZodError } from "zod-validation-error";

// server/middleware/auth.ts
init_storage();
function toSafeUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}
async function requireAuth(req, res, next) {
  try {
    if (!req.session || !req.session.userId) {
      res.status(401).json({ error: "Authentication required. Please log in." });
      return;
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      req.session.userId = void 0;
      res.status(401).json({ error: "Invalid or inactive user. Please log in again." });
      return;
    }
    req.user = user;
    req.userId = req.session.userId;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}
async function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.userCategory !== "team") {
    res.status(403).json({ error: "Admin access required - team members only" });
    return;
  }
  if (!req.user.roleId) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  const role = await storage.getUserRole(req.user.roleId);
  if (!role || !role.name.toLowerCase().includes("admin")) {
    res.status(403).json({ error: "Admin role required" });
    return;
  }
  next();
}
function requirePermission(permissionKey, action) {
  return async (req, res, next) => {
    if (process.env.NODE_ENV === "development") {
      next();
      return;
    }
    if (!req.user || !req.user.roleId) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    try {
      const rolePermissions2 = await storage.getRolePermissions(req.user.roleId);
      for (const rp of rolePermissions2) {
        const permission = await storage.getPermission(rp.permissionId);
        if (permission && permission.key === permissionKey) {
          const allowedActions = Array.isArray(rp.allowedActions) ? rp.allowedActions : [];
          if (allowedActions.includes(action)) {
            next();
            return;
          }
        }
      }
      res.status(403).json({
        error: `Insufficient permissions: ${permissionKey}:${action} required`
      });
    } catch (error) {
      res.status(500).json({ error: "Permission check failed" });
    }
  };
}
function requireTeamMember(req, res, next) {
  if (process.env.NODE_ENV === "development") {
    next();
    return;
  }
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (req.user.userCategory !== "team") {
    res.status(403).json({ error: "Team member access required" });
    return;
  }
  next();
}

// server/routes.ts
import multer from "multer";

// server/messaging/socket.ts
init_storage();
import { Server } from "socket.io";
function setupMessagingSocket(httpServer, sessionMiddleware2) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : false : "http://localhost:5000",
      credentials: true
    },
    path: "/socket.io/"
  });
  io.engine.use(sessionMiddleware2);
  io.use(async (socket, next) => {
    try {
      const req = socket.request;
      const session2 = req.session;
      if (!session2 || !session2.userId) {
        return next(new Error("Authentication required - no valid session"));
      }
      const user = await storage.getUser(session2.userId);
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
  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.userId}`);
    socket.on("join_channel", async (channelId) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some((m) => m.userId === userId);
        if (!isMember) {
          socket.emit("error", { message: "Not a member of this channel" });
          return;
        }
        socket.join(`channel:${channelId}`);
        console.log(`User ${userId} joined channel ${channelId}`);
        socket.to(`channel:${channelId}`).emit("user_joined", {
          channelId,
          userId
        });
      } catch (error) {
        console.error("Error joining channel:", error);
        socket.emit("error", { message: "Failed to join channel" });
      }
    });
    socket.on("leave_channel", (channelId) => {
      socket.leave(`channel:${channelId}`);
      console.log(`User ${socket.data.userId} left channel ${channelId}`);
      socket.to(`channel:${channelId}`).emit("user_left", {
        channelId,
        userId: socket.data.userId
      });
    });
    socket.on("send_message", async (data) => {
      try {
        const { channelId, content, mentions } = data;
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some((m) => m.userId === userId);
        if (!isMember) {
          socket.emit("error", { message: "Not authorized to send messages to this channel" });
          return;
        }
        const message = await storage.createMessage({
          channelId,
          userId,
          content,
          mentions: mentions || []
        });
        io.to(`channel:${channelId}`).emit("new_message", message);
        await storage.updateChannelMemberLastRead(channelId, userId);
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });
    socket.on("typing_start", async (channelId) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) return;
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some((m) => m.userId === userId);
        if (!isMember) return;
        socket.to(`channel:${channelId}`).emit("user_typing", {
          channelId,
          userId
        });
      } catch (error) {
      }
    });
    socket.on("typing_stop", async (channelId) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) return;
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some((m) => m.userId === userId);
        if (!isMember) return;
        socket.to(`channel:${channelId}`).emit("user_stopped_typing", {
          channelId,
          userId
        });
      } catch (error) {
      }
    });
    socket.on("mark_read", async (channelId) => {
      try {
        const userId = socket.data.userId;
        const companyId = socket.data.companyId;
        const channel = await storage.getChannel(channelId, companyId);
        if (!channel) {
          socket.emit("error", { message: "Channel not found or access denied" });
          return;
        }
        const members = await storage.getChannelMembers(channelId);
        const isMember = members.some((m) => m.userId === userId);
        if (!isMember) {
          return;
        }
        await storage.updateChannelMemberLastRead(channelId, userId);
        socket.to(`channel:${channelId}`).emit("messages_read", {
          channelId,
          userId
        });
      } catch (error) {
        console.error("Error marking messages as read:", error);
      }
    });
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.userId}`);
    });
  });
  return io;
}

// server/routes.ts
async function registerRoutes(app2) {
  await setupAuth(app2);
  app2.use("/api", ensureLegacySessionFields);
  app2.use("/api", (req, res, next) => {
    const path3 = req.path;
    if (path3.startsWith("/auth/")) {
      return next();
    }
    if (/^\/invitations\/by-token\/[^/]+$/.test(path3) || /^\/invitations\/[^/]+\/accept$/.test(path3)) {
      return next();
    }
    if (process.env.NODE_ENV === "development") {
      return next();
    }
    return requireAuth(req, res, next);
  });
  app2.get("/api/notes", async (req, res) => {
    try {
      const { projectId } = req.query;
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const notes2 = await storage.getNotes(projectId, companyId);
      res.json(notes2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });
  app2.get("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user;
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
  app2.post("/api/notes", async (req, res) => {
    try {
      const validationResult = insertNoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const noteData = {
        ...validationResult.data,
        companyId,
        ownerId: user?.id,
        ownerName: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}`.trim() : user?.email || "Unknown User",
        author: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}`.trim() : user?.email || "Unknown User"
        // Legacy field
      };
      const note = await storage.createNote(noteData);
      res.status(201).json(note);
    } catch (error) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });
  app2.patch("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user;
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
      const currentNote = await storage.getNote(req.params.id, companyId);
      if (!currentNote) {
        return res.status(404).json({ error: "Note not found" });
      }
      if (validationResult.data.pinned === true) {
        const allNotes = await storage.getNotes(currentNote.projectId || void 0, companyId);
        const pinnedCount = allNotes.filter((n) => n.pinned && n.id !== req.params.id).length;
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
  app2.delete("/api/notes/:id", async (req, res) => {
    try {
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
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
  app2.get("/api/tasks", async (req, res) => {
    try {
      const { projectId, status, businessTasks } = req.query;
      const tasks = await storage.getTasks(
        projectId,
        status,
        businessTasks === "true"
      );
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });
  app2.get("/api/tasks/user", async (req, res) => {
    try {
      const user = req.user;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const tasks = await storage.getTasksByUser(user.id, user.companyId);
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user tasks" });
    }
  });
  app2.get("/api/tasks/:id", async (req, res) => {
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
  app2.post("/api/tasks", requireAuth, async (req, res) => {
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
  app2.patch("/api/tasks/:id", async (req, res) => {
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
  app2.patch("/api/tasks/:id/status", async (req, res) => {
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
  app2.delete("/api/tasks/:id", async (req, res) => {
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
  app2.get("/api/defects", async (req, res) => {
    try {
      const { projectId } = req.query;
      const defects2 = await storage.getDefects(projectId);
      res.json(defects2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defects" });
    }
  });
  app2.get("/api/defects/:id", async (req, res) => {
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
  app2.post("/api/defects", async (req, res) => {
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
  app2.patch("/api/defects/:id", async (req, res) => {
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
  app2.delete("/api/defects/:id", async (req, res) => {
    try {
      await storage.deleteDefect(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete defect" });
    }
  });
  app2.get("/api/minutes", async (req, res) => {
    try {
      const { projectId } = req.query;
      const minutes2 = await storage.getMinutes(projectId);
      res.json(minutes2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch minutes" });
    }
  });
  app2.get("/api/minutes/:id", async (req, res) => {
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
  app2.post("/api/minutes", async (req, res) => {
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
  app2.patch("/api/minutes/:id", async (req, res) => {
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
  app2.delete("/api/minutes/:id", async (req, res) => {
    try {
      await storage.deleteMinute(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete minute" });
    }
  });
  app2.post("/api/minutes/:id/summarize", async (req, res) => {
    try {
      const minute = await storage.getMinute(req.params.id);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
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
            content: `Please summarize the following meeting minutes:

Title: ${minute.title}
Date: ${new Date(minute.meetingDate).toLocaleDateString()}
Attendees: ${minute.attendees?.join(", ") || "Not specified"}

Content:
${minute.contentText || ""}`
          }
        ]
      });
      const summary = completion.choices[0]?.message?.content || "";
      const updatedMinute = await storage.updateMinute(req.params.id, { aiSummary: summary });
      res.json({ summary, minute: updatedMinute });
    } catch (error) {
      console.error("Failed to generate summary:", error);
      res.status(500).json({ error: "Failed to generate AI summary" });
    }
  });
  const recordingUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024
      // 25MB limit (OpenAI Whisper limit)
    },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/m4a",
        "audio/webm",
        "video/mp4",
        "video/mpeg",
        "video/webm"
      ];
      if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Invalid file type. Please upload an audio or video file."));
      }
    }
  });
  app2.post("/api/minutes/:id/transcribe", recordingUpload.single("recording"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const minute = await storage.getMinute(req.params.id);
      if (!minute) {
        return res.status(404).json({ error: "Minute not found" });
      }
      await storage.updateMinute(req.params.id, {
        transcriptionStatus: "processing",
        recordingFileName: req.file.originalname
      });
      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      });
      const file = new File([req.file.buffer], req.file.originalname, { type: req.file.mimetype });
      const transcription = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        language: "en"
      });
      const updatedMinute = await storage.updateMinute(req.params.id, {
        transcription: transcription.text,
        transcriptionStatus: "completed",
        contentText: transcription.text
        // Pre-fill content with transcription
      });
      res.json({
        transcription: transcription.text,
        minute: updatedMinute
      });
    } catch (error) {
      console.error("Failed to transcribe audio:", error);
      await storage.updateMinute(req.params.id, { transcriptionStatus: "failed" });
      res.status(500).json({ error: "Failed to transcribe audio" });
    }
  });
  app2.get("/api/custom-field-defs", async (req, res) => {
    try {
      const fieldDefs = await storage.getCustomFieldDefs();
      res.json(fieldDefs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field definitions" });
    }
  });
  app2.get("/api/custom-field-defs/:id", async (req, res) => {
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
  app2.post("/api/custom-field-defs", async (req, res) => {
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
  app2.patch("/api/custom-field-defs/:id", async (req, res) => {
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
  app2.delete("/api/custom-field-defs/:id", async (req, res) => {
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
  app2.get("/api/custom-field-defs/:fieldDefId/options", async (req, res) => {
    try {
      const options = await storage.getCustomFieldOptions(req.params.fieldDefId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch custom field options" });
    }
  });
  app2.get("/api/custom-field-options/:id", async (req, res) => {
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
  app2.post("/api/custom-field-options", async (req, res) => {
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
  app2.patch("/api/custom-field-options/:id", async (req, res) => {
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
  app2.delete("/api/custom-field-options/:id", async (req, res) => {
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
  app2.get("/api/field-categories", async (req, res) => {
    try {
      const categories = await storage.getFieldCategories();
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
  app2.get("/api/field-categories/by-key/:key", async (req, res) => {
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
  app2.get("/api/field-categories/:id", async (req, res) => {
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
  app2.post("/api/field-categories", requireAuth, requireTeamMember, requirePermission("admin.company", "add"), async (req, res) => {
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
  app2.patch("/api/field-categories/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
    try {
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
  app2.delete("/api/field-categories/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "delete"), async (req, res) => {
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
  app2.get("/api/field-categories/:categoryId/options", async (req, res) => {
    try {
      const options = await storage.getFieldOptions(req.params.categoryId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch field options" });
    }
  });
  app2.get("/api/field-options/:id", async (req, res) => {
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
  app2.post("/api/field-options", requireAuth, requireTeamMember, requirePermission("admin.company", "add"), async (req, res) => {
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
  app2.patch("/api/field-options/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
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
  app2.delete("/api/field-options/:id", requireAuth, requireTeamMember, requirePermission("admin.company", "delete"), async (req, res) => {
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
  app2.post("/api/field-categories/:id/options/batch", requireAuth, requireTeamMember, requirePermission("admin.company", "edit"), async (req, res) => {
    try {
      const batchSchema = z2.array(z2.object({
        id: z2.string().optional(),
        key: z2.string(),
        name: z2.string(),
        color: z2.string().nullable().optional(),
        isActive: z2.boolean().optional(),
        isDefault: z2.boolean().optional(),
        sortOrder: z2.number().optional(),
        createdAt: z2.date().optional()
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
  app2.get("/api/note-templates", async (req, res) => {
    try {
      const { ownerId } = req.query;
      const templates = await storage.getNoteTemplates(ownerId);
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch note templates" });
    }
  });
  app2.get("/api/note-templates/:id", async (req, res) => {
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
  app2.post("/api/note-templates", async (req, res) => {
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
  app2.patch("/api/note-templates/:id", async (req, res) => {
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
  app2.delete("/api/note-templates/:id", async (req, res) => {
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
  app2.get("/api/clients", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.json([]);
      }
      const allClients = await storage.getClients();
      const companyClients = allClients.filter((c) => c.companyId === user.companyId);
      res.json(companyClients);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });
  app2.post("/api/clients", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }
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
        isActive: true
      };
      const client2 = await storage.createClient(clientData);
      res.status(201).json(client2);
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });
  app2.patch("/api/clients/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }
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
      const client2 = await storage.updateClient(req.params.id, validationResult.data);
      res.json(client2);
    } catch (error) {
      res.status(500).json({ error: "Failed to update client" });
    }
  });
  app2.delete("/api/clients/:id", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.status(403).json({ error: "User must belong to a company" });
      }
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
  app2.get("/api/projects", async (req, res) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user || !user.companyId) {
        return res.json([]);
      }
      const allProjects = await storage.getProjects();
      const companyProjects = allProjects.filter((p) => p.companyId === user.companyId);
      res.json(companyProjects);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });
  app2.get("/api/projects/:id", async (req, res) => {
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
  app2.post("/api/projects", async (req, res) => {
    try {
      const userId = req.session.userId;
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
      const projectData = {
        ...validationResult.data,
        companyId: user.companyId,
        ownerId: userId
      };
      const project = await storage.createProject(projectData);
      try {
        const channelName = project.name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").substring(0, 50);
        const channel = await storage.createChannel({
          name: channelName,
          type: "channel",
          projectId: project.id,
          description: `Project channel for ${project.name}`,
          companyId: user.companyId
        });
        await storage.addChannelMember({
          channelId: channel.id,
          userId
        });
        console.log(`Auto-created channel ${channel.name} for project ${project.name}`);
      } catch (channelError) {
        console.error("Error creating project channel:", channelError);
      }
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });
  app2.patch("/api/projects/:id", async (req, res) => {
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
  app2.delete("/api/projects/:id", async (req, res) => {
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
  app2.get("/api/projects/:projectId/team", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const teamMembers = await storage.getProjectTeamMembers(req.params.projectId);
      const safeTeamMembers = teamMembers.map((user) => toSafeUser(user));
      res.json(safeTeamMembers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project team members" });
    }
  });
  app2.post("/api/projects/:projectId/team/:userId", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.delete("/api/projects/:projectId/team/:userId", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.get("/api/task-views", async (req, res) => {
    try {
      const { ownerId } = req.query;
      const taskViews2 = await storage.getTaskViews(ownerId);
      res.json(taskViews2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task views" });
    }
  });
  app2.get("/api/task-views/:id", async (req, res) => {
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
  app2.post("/api/task-views", async (req, res) => {
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
  app2.patch("/api/task-views/:id", async (req, res) => {
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
  app2.delete("/api/task-views/:id", async (req, res) => {
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
  app2.get("/api/tasks/:id/subtasks", async (req, res) => {
    try {
      const subtasks = await storage.getSubtasks(req.params.id);
      res.json(subtasks);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subtasks" });
    }
  });
  app2.post("/api/tasks/:id/subtasks", async (req, res) => {
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
  app2.get("/api/estimates", async (req, res) => {
    try {
      const { projectId } = req.query;
      const estimates2 = await storage.getEstimates(projectId);
      res.json(estimates2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimates" });
    }
  });
  app2.get("/api/estimates/:id", async (req, res) => {
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
  app2.post("/api/estimates", async (req, res) => {
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
    } catch (error) {
      console.error("Error creating estimate:", error.message, error.stack);
      res.status(500).json({ error: "Failed to create estimate", details: error.message });
    }
  });
  app2.patch("/api/estimates/:id", async (req, res) => {
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
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate" });
    }
  });
  app2.delete("/api/estimates/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      res.status(204).send();
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate" });
    }
  });
  app2.get("/api/estimates/:id/items", async (req, res) => {
    try {
      const items = await storage.getEstimateItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate items" });
    }
  });
  app2.get("/api/estimate-items/:id", async (req, res) => {
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
  app2.post("/api/estimates/:id/items", async (req, res) => {
    try {
      const estimateId = req.params.id;
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      const unitCostExTaxCents = req.body.unitCostExTax ? Math.round(req.body.unitCostExTax * 100) : 0;
      const quantityCents = req.body.quantity ? Math.round(req.body.quantity * 100) : 100;
      const markupPercent = req.body.markupPercent ?? null;
      const builderCostExTax = Math.round(unitCostExTaxCents * quantityCents / 100);
      const effectiveMarkupPercent = markupPercent ?? 0;
      const markupAmount = Math.round(builderCostExTax * effectiveMarkupPercent / 100);
      const clientPriceExTax = builderCostExTax + markupAmount;
      const taxRate = estimate.taxRate ?? 10;
      const taxAmount = Math.round(clientPriceExTax * taxRate / 100);
      const clientPriceIncTax = clientPriceExTax + taxAmount;
      const itemData = {
        ...req.body,
        estimateId,
        unitCostExTax: unitCostExTaxCents,
        quantity: quantityCents,
        markupPercent,
        taxAmount,
        priceIncTax: clientPriceIncTax
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
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate item" });
    }
  });
  app2.post("/api/estimates/:id/items/import", async (req, res) => {
    try {
      const { items } = req.body;
      const estimateId = req.params.id;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Items array is required and must not be empty" });
      }
      const estimate = await storage.getEstimate(estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      const companyCostCodes = await storage.getCostCodes();
      const costCodeMap = /* @__PURE__ */ new Map();
      for (const cc of companyCostCodes) {
        costCodeMap.set(cc.code.toLowerCase().trim(), cc.code);
      }
      const existingGroups = await storage.getEstimateGroups(estimateId);
      const groupMap = /* @__PURE__ */ new Map();
      for (const group of existingGroups) {
        groupMap.set(group.name.toLowerCase().trim(), group.id);
      }
      console.log(
        "[IMPORT] Existing groups for matching:",
        Array.from(groupMap.entries()).map(([name, id]) => `${name} -> ${id}`)
      );
      const uniqueGroupNames = /* @__PURE__ */ new Set();
      items.forEach((item) => {
        if (item.group && item.group.trim()) {
          uniqueGroupNames.add(item.group.trim());
        }
      });
      for (const groupName of Array.from(uniqueGroupNames)) {
        const normalizedName = groupName.toLowerCase().trim();
        if (!groupMap.has(normalizedName)) {
          console.log(`[IMPORT] Creating new group: "${groupName}"`);
          const newGroup = await storage.createEstimateGroup({
            estimateId,
            name: groupName,
            description: void 0,
            order: 0,
            isCollapsed: false,
            parentGroupId: void 0
          });
          groupMap.set(normalizedName, newGroup.id);
          console.log(`[IMPORT] Created group "${groupName}" with ID ${newGroup.id}`);
        }
      }
      console.log(
        "[IMPORT] Final group map:",
        Array.from(groupMap.entries()).map(([name, id]) => `${name} -> ${id}`)
      );
      const validatedItems = [];
      const itemCostCodes = /* @__PURE__ */ new Map();
      const errors = [];
      items.forEach((item, index2) => {
        console.log(`[Import] Processing item ${index2}:`, {
          name: item.name,
          costCode: item.costCode,
          rawQuantity: item.quantity,
          rawUnitCostExTax: item.unitCostExTax,
          rawMarkupPercent: item.markupPercent
        });
        let costCodeToStore = null;
        if (item.costCode) {
          let codeToMatch = item.costCode.trim();
          if (codeToMatch.includes(" - ")) {
            codeToMatch = codeToMatch.split(" - ")[0].trim();
          }
          const matchedCostCode = companyCostCodes.find(
            (cc) => cc.code.toLowerCase() === codeToMatch.toLowerCase()
          );
          if (matchedCostCode) {
            costCodeToStore = matchedCostCode.id;
            console.log(`[IMPORT] Item "${item.name}" - Matched cost code "${item.costCode}" to ID ${matchedCostCode.id}`);
          } else {
            console.log(`[IMPORT] Item "${item.name}" - No match for cost code "${item.costCode}"`);
          }
        }
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
        const unitCostExTaxCents = item.unitCostExTax ? Math.round(item.unitCostExTax * 100) : 0;
        const quantity = item.quantity ? Math.round(item.quantity * 100) : 100;
        const markupPercent = item.markupPercent ?? null;
        const builderCostExTax = Math.round(unitCostExTaxCents * quantity / 100);
        const effectiveMarkupPercent = markupPercent ?? estimate.projectMarkupPercent ?? 0;
        const markupAmount = Math.round(builderCostExTax * effectiveMarkupPercent / 100);
        const clientPriceExTax = builderCostExTax + markupAmount;
        const taxRate = estimate.taxRate ?? 10;
        const taxAmount = Math.round(clientPriceExTax * taxRate / 100);
        const clientPriceIncTax = clientPriceExTax + taxAmount;
        const itemData = {
          estimateId,
          name: item.name,
          type: item.type || "Material",
          groupId: groupIdToStore || null,
          parentItemId: void 0,
          costCode: costCodeToStore || void 0,
          allowance: item.allowance || "None",
          allowanceStatus: "pending",
          pcMarkupPercent: void 0,
          quantity,
          unitType: item.unitType || "each",
          status: item.status || "incomplete",
          unitCostExTax: unitCostExTaxCents,
          markupPercent,
          taxAmount,
          priceIncTax: clientPriceIncTax,
          description: item.description || void 0,
          notes: item.notes || void 0,
          attachmentUrl: void 0,
          requestForQuote: false,
          isSelection: false,
          proposalVisible: item.proposalVisible !== void 0 ? item.proposalVisible : true,
          shownAs: item.shownAs || void 0,
          trackLabourHours: false,
          order: 0
        };
        const validationResult = insertEstimateItemSchema.safeParse(itemData);
        if (!validationResult.success) {
          errors.push({
            row: index2 + 1,
            errors: validationResult.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`)
          });
        } else {
          if (validationResult.data.estimateId !== estimateId) {
            errors.push({
              row: index2 + 1,
              errors: ["Estimate ID mismatch"]
            });
          } else {
            validatedItems.push(validationResult.data);
          }
        }
      });
      if (errors.length > 0) {
        return res.status(400).json({
          error: "Validation failed",
          errors,
          validCount: validatedItems.length,
          errorCount: errors.length
        });
      }
      console.log(`[Import] Creating ${validatedItems.length} items for estimate ${estimateId}`);
      console.log("[Import] Sample item:", validatedItems[0]);
      const createdItems = await storage.bulkCreateEstimateItems(validatedItems);
      console.log(`[Import] Successfully created ${createdItems.length} items`);
      console.log("[Import] Sample created item:", createdItems[0]);
      res.status(201).json({
        success: true,
        count: createdItems.length,
        items: createdItems
      });
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || "Failed to import estimate items" });
    }
  });
  app2.post("/api/projects/:projectId/estimates/import", async (req, res) => {
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
      const estimateData = {
        projectId,
        name,
        description: `Imported estimate with ${groups.length} groups and ${items.length} items`,
        projectMarkupPercent: 0,
        // Can be updated later
        taxRate: 10,
        // Default GST
        isLocked: false
      };
      const estimate = await storage.createEstimate(estimateData);
      const createdGroups = [];
      const groupNameToId = /* @__PURE__ */ new Map();
      const pendingGroups = [...groups];
      const maxIterations = groups.length + 1;
      let iteration = 0;
      const normalizeName = (name2) => name2.trim().toLowerCase();
      while (pendingGroups.length > 0 && iteration < maxIterations) {
        iteration++;
        const groupsToCreate = [];
        for (const group of pendingGroups) {
          if (!group.parentGroupName) {
            groupsToCreate.push(group);
          } else {
            const parentGroupId = groupNameToId.get(normalizeName(group.parentGroupName));
            if (parentGroupId) {
              groupsToCreate.push(group);
            }
          }
        }
        if (groupsToCreate.length === 0) {
          console.warn(
            `[IMPORT] Could not create ${pendingGroups.length} groups due to missing parents:`,
            pendingGroups.map((g) => `"${g.name}" (parent: "${g.parentGroupName}")`)
          );
          break;
        }
        for (const group of groupsToCreate) {
          const parentGroupId = group.parentGroupName ? groupNameToId.get(normalizeName(group.parentGroupName)) : void 0;
          const groupData = {
            estimateId: estimate.id,
            name: group.name,
            parentGroupId,
            order: group.sortOrder ?? createdGroups.length
          };
          const createdGroup = await storage.createEstimateGroup(groupData);
          createdGroups.push(createdGroup);
          groupNameToId.set(normalizeName(group.name), createdGroup.id);
          const index2 = pendingGroups.indexOf(group);
          if (index2 > -1) {
            pendingGroups.splice(index2, 1);
          }
        }
      }
      const createdItems = [];
      const errors = [];
      for (let index2 = 0; index2 < items.length; index2++) {
        const item = items[index2];
        try {
          const groupId = groupNameToId.get(item.groupName);
          if (!groupId) {
            errors.push({
              row: index2 + 1,
              errors: [`Group "${item.groupName}" not found`]
            });
            continue;
          }
          const unitCostExTaxCents = Math.round((item.unitCostExTax || 0) * 100);
          const quantityCents = Math.round((item.quantity || 1) * 100);
          const markupPercent = item.markupPercent ?? 0;
          const builderCostExTax = Math.round(unitCostExTaxCents * quantityCents / 100);
          const markupAmount = Math.round(builderCostExTax * markupPercent / 100);
          const clientPriceExTax = builderCostExTax + markupAmount;
          const taxRate = estimate.taxRate ?? 10;
          const taxAmount = Math.round(clientPriceExTax * taxRate / 100);
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
            sortOrder: index2
          };
          const createdItem = await storage.createEstimateItem(itemData);
          createdItems.push(createdItem);
        } catch (error) {
          errors.push({
            row: index2 + 1,
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
        errors: errors.length > 0 ? errors : void 0
      });
    } catch (error) {
      console.error("Error importing full estimate:", error);
      res.status(500).json({ error: error.message || "Failed to import estimate" });
    }
  });
  app2.patch("/api/estimate-items/:id", async (req, res) => {
    try {
      const existingItem = await storage.getEstimateItem(req.params.id);
      if (!existingItem) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      const estimate = await storage.getEstimate(existingItem.estimateId);
      if (!estimate) {
        return res.status(404).json({ error: "Estimate not found" });
      }
      const updateData = { ...req.body };
      const unitCostExTaxCents = updateData.unitCostExTax !== void 0 ? Math.round(updateData.unitCostExTax * 100) : existingItem.unitCostExTax;
      const quantityCents = updateData.quantity !== void 0 ? Math.round(updateData.quantity * 100) : existingItem.quantity;
      const markupPercent = updateData.markupPercent !== void 0 ? updateData.markupPercent : existingItem.markupPercent;
      const builderCostExTax = Math.round(unitCostExTaxCents * quantityCents / 100);
      const effectiveMarkupPercent = markupPercent ?? 0;
      const markupAmount = Math.round(builderCostExTax * effectiveMarkupPercent / 100);
      const clientPriceExTax = builderCostExTax + markupAmount;
      const taxRate = estimate.taxRate ?? 10;
      const taxAmount = Math.round(clientPriceExTax * taxRate / 100);
      const clientPriceIncTax = clientPriceExTax + taxAmount;
      updateData.unitCostExTax = unitCostExTaxCents;
      if (updateData.quantity !== void 0) {
        updateData.quantity = quantityCents;
      }
      if (updateData.markupPercent !== void 0) {
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
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate item" });
    }
  });
  app2.delete("/api/estimate-items/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimateItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate item not found" });
      }
      res.status(204).send();
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate item" });
    }
  });
  app2.post("/api/estimate-items/:id/duplicate", async (req, res) => {
    try {
      const newItem = await storage.duplicateEstimateItem(req.params.id);
      if (!newItem) {
        return res.status(404).json({ error: "Failed to duplicate item" });
      }
      res.status(201).json(newItem);
    } catch (error) {
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
  app2.post("/api/estimate-items/:id/copy", async (req, res) => {
    try {
      const requestSchema = z2.object({
        targetEstimateId: z2.string().min(1, "targetEstimateId is required")
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
    } catch (error) {
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
  app2.patch("/api/estimate-items/reorder", async (req, res) => {
    try {
      const { items } = req.body;
      console.log("[REORDER] Received reorder request with items:", JSON.stringify(items, null, 2));
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }
      for (const item of items) {
        if (!item.id || typeof item.order !== "number") {
          return res.status(400).json({ error: "Each item must have id and order" });
        }
      }
      const results = await Promise.all(
        items.map(async ({ id, order, groupId }) => {
          const updateData = { order };
          if (groupId !== void 0) {
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
    } catch (error) {
      console.error("[REORDER] Error:", error.message);
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message?.includes("Estimate item not found")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reorder items" });
    }
  });
  app2.get("/api/estimates/:id/groups", async (req, res) => {
    try {
      const groups = await storage.getEstimateGroups(req.params.id);
      res.json(groups);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch estimate groups" });
    }
  });
  app2.post("/api/estimates/:id/groups", async (req, res) => {
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
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate group" });
    }
  });
  app2.patch("/api/estimate-groups/reorder", async (req, res) => {
    try {
      const { groups } = req.body;
      console.log("[REORDER] Received reorder request for groups:", JSON.stringify(groups, null, 2));
      if (!Array.isArray(groups)) {
        return res.status(400).json({ error: "Groups must be an array" });
      }
      for (const group of groups) {
        if (!group.id || typeof group.order !== "number") {
          return res.status(400).json({ error: "Each group must have id and order" });
        }
      }
      const results = await Promise.all(
        groups.map(async ({ id, order }) => {
          console.log(`[REORDER] Updating group ${id} to order ${order}`);
          const existingGroup = await storage.getEstimateGroup(id);
          console.log(`[REORDER] Existing group ${id}:`, existingGroup ? "found" : "NOT FOUND");
          const updated = await storage.updateEstimateGroup(id, { order });
          if (!updated) {
            console.log(`[REORDER] Failed to update group ${id}`);
            throw new Error(`Failed to update group ${id}`);
          }
          console.log(`[REORDER] Successfully updated group ${id}`);
          return updated;
        })
      );
      console.log("[REORDER] All groups updated successfully");
      res.json({ success: true, count: results.length });
    } catch (error) {
      console.error("[REORDER] Error:", error.message);
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      if (error.message?.includes("Failed to update")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to reorder groups" });
    }
  });
  app2.patch("/api/estimate-groups/:id", async (req, res) => {
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
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update estimate group" });
    }
  });
  app2.delete("/api/estimate-groups/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteEstimateGroup(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Estimate group not found" });
      }
      res.status(204).send();
    } catch (error) {
      if (error.message?.includes("locked estimate")) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete estimate group" });
    }
  });
  app2.post("/api/estimate-groups/:id/duplicate", async (req, res) => {
    try {
      const newGroup = await storage.duplicateEstimateGroup(req.params.id);
      if (!newGroup) {
        return res.status(404).json({ error: "Failed to duplicate group" });
      }
      res.status(201).json(newGroup);
    } catch (error) {
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
  app2.post("/api/estimate-groups/:id/copy", async (req, res) => {
    try {
      const requestSchema = z2.object({
        targetEstimateId: z2.string().min(1, "targetEstimateId is required")
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
    } catch (error) {
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
  app2.get("/api/projects/:projectId/cost-codes", async (req, res) => {
    try {
      const costCodes2 = await storage.getCostCodes();
      res.json(costCodes2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cost codes" });
    }
  });
  app2.post("/api/projects/:projectId/cost-codes", async (req, res) => {
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
  app2.patch("/api/cost-codes/:id", async (req, res) => {
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
  app2.delete("/api/cost-codes/:id", async (req, res) => {
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
  app2.post("/api/estimates/:id/version", async (req, res) => {
    try {
      const newVersion = await storage.createEstimateVersion(req.params.id, req.body);
      res.status(201).json(newVersion);
    } catch (error) {
      if (error.message === "Estimate not found") {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create estimate version" });
    }
  });
  app2.post("/api/estimates/:id/lock", async (req, res) => {
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
  app2.post("/api/estimates/:id/unlock", async (req, res) => {
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
  app2.get("/api/estimates/:id/summary", async (req, res) => {
    try {
      const summary = await storage.getEstimateSummary(req.params.id);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: "Failed to calculate estimate summary" });
    }
  });
  app2.get("/api/estimates/:id/full", async (req, res) => {
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
  app2.get("/api/projects/:projectId/scope", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getScopeItems(req.params.projectId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching scope items:", error);
      res.status(500).json({ error: "Failed to fetch scope items" });
    }
  });
  app2.get("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/projects/:projectId/scope", requireAuth, requireTeamMember, async (req, res) => {
    try {
      console.log("POST /api/projects/:projectId/scope - req.params:", req.params);
      console.log("POST /api/projects/:projectId/scope - req.body:", req.body);
      console.log("POST /api/projects/:projectId/scope - req.user:", req.user);
      const validationResult = insertScopeItemSchema.omit({ projectId: true, companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const newItem = await storage.createScopeItem({
        ...validationResult.data,
        projectId: req.params.projectId,
        companyId
      });
      res.status(201).json(newItem);
    } catch (error) {
      console.error("Error creating scope item:", error);
      res.status(500).json({ error: "Failed to create scope item" });
    }
  });
  app2.post("/api/projects/:projectId/scope/bulk", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Items must be an array" });
      }
      const companyId = req.user.companyId;
      const itemsWithProject = items.map((item) => ({
        ...item,
        projectId: req.params.projectId,
        companyId
      }));
      const newItems = await storage.bulkCreateScopeItems(itemsWithProject);
      res.status(201).json(newItems);
    } catch (error) {
      console.error("Error bulk creating scope items:", error);
      res.status(500).json({ error: "Failed to bulk create scope items" });
    }
  });
  app2.patch("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.delete("/api/scope/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/scope/reorder", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.get("/api/projects/:projectId/scope-stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const stages = await storage.getScopeStages(req.params.projectId);
      res.json(stages);
    } catch (error) {
      console.error("Error fetching scope stages:", error);
      res.status(500).json({ error: "Failed to fetch scope stages" });
    }
  });
  app2.post("/api/projects/:projectId/scope-stages", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertScopeStageSchema.omit({ projectId: true, companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const newStage = await storage.createScopeStage({
        ...validationResult.data,
        projectId: req.params.projectId,
        companyId
      });
      res.status(201).json(newStage);
    } catch (error) {
      console.error("Error creating scope stage:", error);
      res.status(500).json({ error: "Failed to create scope stage" });
    }
  });
  app2.patch("/api/scope-stages/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.delete("/api/scope-stages/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/scope-stages/reorder", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/projects/:projectId/scope-stages/initialize", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const projectId = req.params.projectId;
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
  app2.get("/api/scope-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const templates = await storage.getScopeTemplates(companyId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching scope templates:", error);
      res.status(500).json({ error: "Failed to fetch scope templates" });
    }
  });
  app2.get("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
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
  app2.post("/api/scope-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const validationResult = insertScopeTemplateSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const newTemplate = await storage.createScopeTemplate({
        ...validationResult.data,
        companyId
      });
      res.status(201).json(newTemplate);
    } catch (error) {
      console.error("Error creating scope template:", error);
      res.status(500).json({ error: "Failed to create scope template" });
    }
  });
  app2.patch("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
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
  app2.delete("/api/scope-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
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
  app2.post("/api/scope-templates/:id/apply", requireAuth, requireTeamMember, async (req, res) => {
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
  const gearPhotoUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, "uploads/gear-photos/");
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + "-" + file.originalname);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
    // 10MB limit
  });
  app2.get("/api/scope/:scopeItemId/gear-photos", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const photos = await storage.getScopeGearPhotos(req.params.scopeItemId);
      res.json(photos);
    } catch (error) {
      console.error("Error fetching gear photos:", error);
      res.status(500).json({ error: "Failed to fetch gear photos" });
    }
  });
  app2.post("/api/scope/:scopeItemId/gear-photos", requireAuth, requireTeamMember, gearPhotoUpload.single("photo"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No photo uploaded" });
      }
      const companyId = req.user.companyId;
      const photoData = {
        scopeItemId: req.params.scopeItemId,
        photoUrl: `/uploads/gear-photos/${req.file.filename}`,
        gearItemName: req.body.gearItemName || "Unnamed Item",
        companyId
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
  app2.delete("/api/gear-photos/:id", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/scope/push-to-estimate", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { scopeItemIds, estimateId } = req.body;
      if (!scopeItemIds || !Array.isArray(scopeItemIds)) {
        return res.status(400).json({ error: "Scope item IDs must be an array" });
      }
      if (!estimateId) {
        return res.status(400).json({ error: "Estimate ID is required" });
      }
      const estimateItems2 = await storage.pushScopeToEstimate(scopeItemIds, estimateId);
      res.status(201).json(estimateItems2);
    } catch (error) {
      console.error("Error pushing scope to estimate:", error);
      res.status(500).json({ error: "Failed to push scope to estimate" });
    }
  });
  app2.post("/api/scope/create-rfq", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/scope/create-po", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/scope/:scopeItemId/link-schedule", requireAuth, requireTeamMember, async (req, res) => {
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
  app2.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name, companyName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (!name || !companyName) {
        return res.status(400).json({ message: "Name and company name are required" });
      }
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(" ") || "";
      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        userCategory: "team"
      });
      const company = await storage.createCompany({
        name: companyName
      }, user.id);
      await storage.updateUser(user.id, {
        companyId: company.id
      });
      const updatedUser = await storage.getUser(user.id);
      if (!updatedUser) {
        return res.status(500).json({ message: "Failed to retrieve updated user" });
      }
      req.session.userId = user.id;
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
  app2.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
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
  app2.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
  app2.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const user = req.user.dbUser;
      if (!user) {
        console.error("\u274C [GET /api/auth/user] No dbUser found in session!");
        return res.status(404).json({ message: "User not found" });
      }
      const safeUser = toSafeUser(user);
      console.log("\u2705 [GET /api/auth/user] Returning user:", {
        id: safeUser.id,
        email: safeUser.email,
        companyId: safeUser.companyId,
        roleId: safeUser.roleId
      });
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });
  const getRedirectUri = () => {
    if (process.env.REPLIT_DOMAINS) {
      const domain = process.env.REPLIT_DOMAINS.split(",")[0];
      return `https://${domain}/api/auth/google/callback`;
    }
    return "http://localhost:5000/api/auth/google/callback";
  };
  const oauth2Client = new google2.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
  app2.get("/api/auth/google/initiate", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const state = randomBytes2(32).toString("hex");
      req.session.googleOAuthUserId = userId;
      req.session.googleOAuthState = state;
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/calendar"],
        prompt: "consent",
        // Force consent to get refresh token
        state
        // CSRF protection
      });
      res.redirect(authUrl);
    } catch (error) {
      console.error("Error initiating Google OAuth:", error);
      res.status(500).json({ message: "Failed to initiate OAuth" });
    }
  });
  app2.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query;
      const userId = req.session?.googleOAuthUserId;
      const storedState = req.session?.googleOAuthState;
      if (oauthError) {
        console.error("OAuth error from Google:", oauthError);
        delete req.session.googleOAuthUserId;
        delete req.session.googleOAuthState;
        return res.redirect(`/profile?error=oauth_denied`);
      }
      if (!code) {
        console.error("No authorization code received");
        delete req.session.googleOAuthUserId;
        delete req.session.googleOAuthState;
        return res.redirect("/profile?error=no_code");
      }
      if (!userId) {
        console.error("No userId in session");
        delete req.session.googleOAuthUserId;
        delete req.session.googleOAuthState;
        return res.redirect("/profile?error=session_expired");
      }
      if (!state || !storedState || state !== storedState) {
        console.error("State mismatch - CSRF protection triggered");
        delete req.session.googleOAuthUserId;
        delete req.session.googleOAuthState;
        return res.redirect("/profile?error=invalid_state");
      }
      const { tokens } = await oauth2Client.getToken(code);
      if (!tokens.access_token) {
        console.error("No access token received from Google");
        delete req.session.googleOAuthUserId;
        delete req.session.googleOAuthState;
        return res.redirect("/profile?error=no_token");
      }
      oauth2Client.setCredentials(tokens);
      const oauth2 = google2.oauth2({ version: "v2", auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      await storage.updateUser(userId, {
        googleCalendarAccessToken: tokens.access_token,
        googleCalendarRefreshToken: tokens.refresh_token || null,
        googleCalendarEmail: data.email || null,
        googleCalendarTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleCalendarConnectedAt: /* @__PURE__ */ new Date()
      });
      delete req.session.googleOAuthUserId;
      delete req.session.googleOAuthState;
      res.redirect("/profile?success=calendar_connected");
    } catch (error) {
      console.error("Error in Google OAuth callback:", error);
      delete req.session.googleOAuthUserId;
      delete req.session.googleOAuthState;
      res.redirect("/profile?error=oauth_failed");
    }
  });
  app2.post("/api/auth/google/disconnect", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.googleCalendarAccessToken) {
        try {
          await oauth2Client.revokeToken(user.googleCalendarAccessToken);
        } catch (revokeError) {
          console.error("Error revoking Google token:", revokeError);
        }
      }
      await storage.updateUser(userId, {
        googleCalendarAccessToken: null,
        googleCalendarRefreshToken: null,
        googleCalendarEmail: null,
        googleCalendarTokenExpiry: null,
        googleCalendarConnectedAt: null
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting Google Calendar:", error);
      res.status(500).json({ message: "Failed to disconnect calendar" });
    }
  });
  app2.get("/api/google-calendar/status", async (req, res) => {
    try {
      const { getGoogleCalendarConnectionInfo: getGoogleCalendarConnectionInfo2 } = await Promise.resolve().then(() => (init_googleCalendar(), googleCalendar_exports));
      const info = await getGoogleCalendarConnectionInfo2();
      res.json(info);
    } catch (error) {
      console.error("Error getting Google Calendar status:", error);
      res.json({ connected: false, email: null, calendars: [] });
    }
  });
  app2.post("/api/google-calendar/connect", async (req, res) => {
    try {
      const { isGoogleCalendarConnected: isGoogleCalendarConnected2 } = await Promise.resolve().then(() => (init_googleCalendar(), googleCalendar_exports));
      const connected = await isGoogleCalendarConnected2();
      if (connected) {
        res.json({ success: true, connected: true });
      } else {
        res.status(400).json({
          success: false,
          message: "Please connect Google Calendar through the Replit integrations panel first."
        });
      }
    } catch (error) {
      console.error("Error connecting Google Calendar:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to connect Google Calendar"
      });
    }
  });
  app2.post("/api/google-calendar/disconnect", async (req, res) => {
    try {
      res.json({
        success: true,
        message: "Please disconnect Google Calendar through the Replit integrations panel."
      });
    } catch (error) {
      console.error("Error disconnecting Google Calendar:", error);
      res.status(500).json({ message: "Failed to disconnect calendar" });
    }
  });
  app2.get("/api/google-calendar/events", async (req, res) => {
    try {
      const { getUncachableGoogleCalendarClient: getUncachableGoogleCalendarClient2, isGoogleCalendarConnected: isGoogleCalendarConnected2 } = await Promise.resolve().then(() => (init_googleCalendar(), googleCalendar_exports));
      const connected = await isGoogleCalendarConnected2();
      if (!connected) {
        return res.json([]);
      }
      const calendar = await getUncachableGoogleCalendarClient2();
      const timeMin = /* @__PURE__ */ new Date();
      timeMin.setMonth(timeMin.getMonth() - 1);
      const timeMax = /* @__PURE__ */ new Date();
      timeMax.setMonth(timeMax.getMonth() + 3);
      const response = await calendar.events.list({
        calendarId: "primary",
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 250
      });
      const events = (response.data.items || []).map((event) => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        const isAllDay = !event.start?.dateTime;
        let endDate = end ? new Date(end) : /* @__PURE__ */ new Date();
        if (isAllDay && end) {
          endDate = new Date(end);
          endDate.setDate(endDate.getDate() - 1);
        }
        const extractTime = (dateTimeStr) => {
          if (!dateTimeStr) return null;
          try {
            const timePart = dateTimeStr.split("T")[1];
            if (!timePart) return null;
            const [hours, minutes2] = timePart.split(":");
            return `${hours}:${minutes2}`;
          } catch {
            return null;
          }
        };
        return {
          id: `google-${event.id}`,
          title: event.summary || "(No title)",
          startDate: start ? new Date(start) : /* @__PURE__ */ new Date(),
          endDate,
          startTime: isAllDay ? null : extractTime(event.start?.dateTime),
          endTime: isAllDay ? null : extractTime(event.end?.dateTime),
          type: "google-calendar",
          color: "#4285f4",
          // Google Calendar blue
          description: event.description || null,
          location: event.location || null,
          isCompleted: false
        };
      });
      res.json(events);
    } catch (error) {
      console.error("Error fetching Google Calendar events:", error);
      res.status(500).json({ message: "Failed to fetch Google Calendar events" });
    }
  });
  app2.post("/api/companies", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      if (user.companyId) {
        return res.status(400).json({ message: "User already belongs to a company" });
      }
      const company = await storage.createCompany(req.body, userId);
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ message: "Failed to create company" });
    }
  });
  app2.get("/api/user/can-approve-bills", async (req, res) => {
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
  app2.get("/api/users", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const { category } = req.query;
      const users2 = await storage.getUsers(category);
      const safeUsers = users2.map((user) => toSafeUser(user));
      res.json(safeUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  app2.get("/api/users/:id", requireTeamMember, requirePermission("admin.users", "view"), async (req, res) => {
    try {
      const user = await storage.getUserWithRole(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  app2.post("/api/users", requireTeamMember, requirePermission("admin.users", "add"), async (req, res) => {
    try {
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
      res.status(201).json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  app2.patch("/api/users/:id", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
    try {
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
      res.json(toSafeUser(user));
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app2.post("/api/users/:id/change-password", requireTeamMember, requirePermission("admin.users", "edit"), async (req, res) => {
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
    } catch (error) {
      if (error.message?.includes("Password validation failed")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to change password" });
    }
  });
  app2.get("/api/user-column-preferences/:pageKey", requireAuth, async (req, res) => {
    try {
      const preferences = await storage.getUserColumnPreferences(req.user.id, req.params.pageKey);
      res.json(preferences || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch column preferences" });
    }
  });
  app2.post("/api/user-column-preferences", requireAuth, async (req, res) => {
    try {
      const validationResult = insertUserColumnPreferencesSchema.safeParse({
        ...req.body,
        userId: req.user.id
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
  app2.get("/api/user-roles", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const { category } = req.query;
      const roles = await storage.getUserRoles(category, companyId);
      res.json(roles);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user roles" });
    }
  });
  app2.get("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const user = req.user;
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
  app2.post("/api/user-roles", requireAuth, requireTeamMember, requirePermission("admin.roles", "add"), async (req, res) => {
    try {
      const user = req.user;
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
  app2.patch("/api/user-roles/reorder", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const reorderSchema = z2.object({
        updates: z2.array(z2.object({
          id: z2.string(),
          displayOrder: z2.number().int()
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
  app2.patch("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const user = req.user;
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
  app2.delete("/api/user-roles/:id", requireAuth, requireTeamMember, requirePermission("admin.roles", "delete"), async (req, res) => {
    try {
      const user = req.user;
      const companyId = user?.companyId;
      if (!companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const role = await storage.getUserRole(req.params.id, companyId);
      if (!role) {
        return res.status(404).json({ error: "User role not found" });
      }
      if (role.isBuiltIn) {
        return res.status(400).json({ error: "Cannot delete built-in roles." });
      }
      const users2 = await storage.getUsers();
      const usersWithRole = users2.filter((user2) => user2.roleId === req.params.id && user2.isActive);
      if (usersWithRole.length > 0) {
        return res.status(400).json({ error: "Cannot delete role. Users are currently assigned to this role." });
      }
      const success = await storage.deleteUserRole(req.params.id, companyId);
      if (!success) {
        return res.status(400).json({ error: "Failed to delete user role" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete user role" });
    }
  });
  app2.get("/api/permissions", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const { category } = req.query;
      const permissions2 = await storage.getPermissions(category);
      res.json(permissions2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });
  app2.get("/api/permissions/:id", requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
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
  app2.post("/api/permissions", requireTeamMember, requirePermission("admin.roles", "add"), async (req, res) => {
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
  app2.get("/api/user-roles/:roleId/permissions", requireAuth, requireTeamMember, requirePermission("admin.roles", "view"), async (req, res) => {
    try {
      const rolePermissions2 = await storage.getRolePermissions(req.params.roleId);
      res.json(rolePermissions2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch role permissions" });
    }
  });
  app2.post("/api/user-roles/:roleId/permissions", requireAuth, requireTeamMember, requirePermission("admin.roles", "edit"), async (req, res) => {
    try {
      const { permissions: permissions2 } = req.body;
      if (!Array.isArray(permissions2)) {
        return res.status(400).json({ error: "Permissions must be an array" });
      }
      const permissionSchema = z2.object({
        permissionId: z2.string(),
        allowedActions: z2.array(z2.enum(["view", "add", "edit", "delete"]))
      });
      const validationResult = z2.array(permissionSchema).safeParse(permissions2);
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
  app2.get("/api/users/:userId/project-access", requireTeamMember, async (req, res) => {
    try {
      const projectAccess = await storage.getUserProjectAccess(req.params.userId);
      res.json(projectAccess);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user project access" });
    }
  });
  app2.post("/api/users/:userId/project-access", requireTeamMember, async (req, res) => {
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
      try {
        const user = await storage.getUser(access.grantedBy || "");
        if (user?.companyId && access.projectId) {
          const channels2 = await storage.getChannels(user.companyId);
          const projectChannel = channels2.find((c) => c.projectId === access.projectId);
          if (projectChannel) {
            const members = await storage.getChannelMembers(projectChannel.id);
            const isMember = members.some((m) => m.userId === req.params.userId);
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
        console.error("Error adding user to project channel:", channelError);
      }
      res.status(201).json(access);
    } catch (error) {
      res.status(500).json({ error: "Failed to grant project access" });
    }
  });
  app2.post("/api/project-access/grant", requireTeamMember, async (req, res) => {
    try {
      const { userId, projectId, accessLevel, grantedBy } = req.body;
      if (!userId || !projectId || !accessLevel || !grantedBy) {
        return res.status(400).json({
          error: "userId, projectId, accessLevel, and grantedBy are required"
        });
      }
      const access = await storage.grantProjectAccess(userId, projectId, accessLevel, grantedBy);
      try {
        const user = await storage.getUser(grantedBy);
        if (user?.companyId) {
          const channels2 = await storage.getChannels(user.companyId);
          const projectChannel = channels2.find((c) => c.projectId === projectId);
          if (projectChannel) {
            const members = await storage.getChannelMembers(projectChannel.id);
            const isMember = members.some((m) => m.userId === userId);
            if (!isMember) {
              await storage.addChannelMember({
                channelId: projectChannel.id,
                userId
              });
              console.log(`Auto-added user ${userId} to project channel ${projectChannel.name}`);
            }
          }
        }
      } catch (channelError) {
        console.error("Error adding user to project channel:", channelError);
      }
      res.status(201).json(access);
    } catch (error) {
      res.status(500).json({ error: "Failed to grant project access" });
    }
  });
  app2.get("/api/invitations", requireTeamMember, requirePermission("admin.suppliers", "view"), async (req, res) => {
    try {
      const { status } = req.query;
      const invitations = await storage.getUserInvitations(status);
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitations" });
    }
  });
  app2.get("/api/invitations/:id", requireTeamMember, requirePermission("admin.suppliers", "view"), async (req, res) => {
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
  app2.post("/api/invitations", requireTeamMember, requirePermission("admin.suppliers", "add"), async (req, res) => {
    try {
      const validationResult = insertUserInvitationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const invitation = await storage.createUserInvitation(validationResult.data);
      res.status(201).json({
        ...invitation,
        inviteUrl: `${req.get("host")}/accept-invite/${invitation.inviteToken}`
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create invitation" });
    }
  });
  app2.get("/api/invitations/by-token/:token", async (req, res) => {
    try {
      const invitation = await storage.getUserInvitationByToken(req.params.token);
      if (!invitation) {
        return res.status(404).json({ error: "Invitation not found or expired" });
      }
      if (invitation.status !== "pending" || invitation.expiresAt < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ error: "Invitation has expired or already been used" });
      }
      res.json(invitation);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invitation" });
    }
  });
  app2.post("/api/invitations/:token/accept", async (req, res) => {
    try {
      const { username, password, firstName, lastName } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
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
      const { password: _, ...safeUser } = result.user;
      res.status(201).json({
        user: safeUser,
        invitation: result.invitation,
        message: "Account created successfully"
      });
    } catch (error) {
      if (error.message?.includes("Password validation failed")) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });
  app2.get("/api/selections", async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const selections2 = await storage.getSelections(projectId);
      res.json(selections2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch selections" });
    }
  });
  app2.get("/api/selections/:id", async (req, res) => {
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
  app2.post("/api/selections", async (req, res) => {
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
  app2.patch("/api/selections/:id", async (req, res) => {
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
  app2.delete("/api/selections/:id", async (req, res) => {
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
  app2.get("/api/selections/:selectionId/options", async (req, res) => {
    try {
      const options = await storage.getSelectionOptions(req.params.selectionId);
      res.json(options);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch selection options" });
    }
  });
  app2.post("/api/selections/:selectionId/options", async (req, res) => {
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
  app2.patch("/api/selection-options/:id", async (req, res) => {
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
  app2.delete("/api/selection-options/:id", async (req, res) => {
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
  app2.get("/api/client-selections", async (req, res) => {
    try {
      const { projectId } = req.query;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const clientSelections2 = await storage.getClientSelections(projectId);
      res.json(clientSelections2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client selections" });
    }
  });
  app2.post("/api/client-selections", async (req, res) => {
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
  app2.get("/api/suppliers", async (req, res) => {
    try {
      const { projectId } = req.query;
      const suppliers2 = await storage.getSuppliers(projectId);
      res.json(suppliers2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch suppliers" });
    }
  });
  app2.get("/api/suppliers/:id", async (req, res) => {
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
  app2.post("/api/suppliers", async (req, res) => {
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
  app2.patch("/api/suppliers/:id", async (req, res) => {
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
  app2.delete("/api/suppliers/:id", async (req, res) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete supplier" });
    }
  });
  app2.get("/api/contacts", async (req, res) => {
    try {
      const { contactType } = req.query;
      const contacts2 = await storage.getContacts(contactType);
      res.json(contacts2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });
  app2.get("/api/contacts/:id", async (req, res) => {
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
  app2.post("/api/contacts", async (req, res) => {
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
  app2.patch("/api/contacts/:id", async (req, res) => {
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
  app2.post("/api/contacts/:id/archive", async (req, res) => {
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
  app2.post("/api/contacts/:id/restore", async (req, res) => {
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
  app2.get("/api/rfqs", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { projectId } = req.query;
      const companyId = req.user.companyId;
      const rfqs2 = await storage.getRFQs(companyId, projectId);
      res.json(rfqs2);
    } catch (error) {
      console.error("Error fetching RFQs:", error);
      res.status(500).json({ error: "Failed to fetch RFQs" });
    }
  });
  app2.get("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfq = await storage.getRFQ(req.params.id);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      res.json(rfq);
    } catch (error) {
      console.error("Error fetching RFQ:", error);
      res.status(500).json({ error: "Failed to fetch RFQ" });
    }
  });
  app2.post("/api/rfqs", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const project = await storage.getProject(validationResult.data.projectId);
      const existingRFQs = await storage.getRFQs(companyId, validationResult.data.projectId);
      const rfqCount = existingRFQs.length + 1;
      const rfqNumber = `${project?.name.substring(0, 4).toUpperCase() || "PROJ"}-RFQ-${String(rfqCount).padStart(3, "0")}`;
      const rfqData = {
        ...validationResult.data,
        companyId,
        rfqNumber,
        createdBy: req.user.id,
        createdByName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
        status: "draft"
      };
      const rfq = await storage.createRFQ(rfqData);
      res.status(201).json(rfq);
    } catch (error) {
      console.error("Error creating RFQ:", error);
      res.status(500).json({ error: "Failed to create RFQ", details: error.message });
    }
  });
  app2.patch("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingRFQ = await storage.getRFQ(req.params.id);
      if (!existingRFQ) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (existingRFQ.companyId !== req.user.companyId) {
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
    } catch (error) {
      console.error("Error updating RFQ:", error);
      res.status(500).json({ error: "Failed to update RFQ" });
    }
  });
  app2.delete("/api/rfqs/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingRFQ = await storage.getRFQ(req.params.id);
      if (!existingRFQ) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (existingRFQ.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteRFQ(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting RFQ:", error);
      res.status(500).json({ error: "Failed to delete RFQ" });
    }
  });
  app2.get("/api/rfqs/:rfqId/items", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getRFQItems(req.params.rfqId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching RFQ items:", error);
      res.status(500).json({ error: "Failed to fetch RFQ items" });
    }
  });
  app2.post("/api/rfq-items", requireAuth, requireTeamMember, async (req, res) => {
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
    } catch (error) {
      console.error("Error creating RFQ item:", error);
      res.status(500).json({ error: "Failed to create RFQ item", details: error.message });
    }
  });
  app2.delete("/api/rfq-items/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const deleted = await storage.deleteRFQItem(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ item not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting RFQ item:", error);
      res.status(500).json({ error: "Failed to delete RFQ item" });
    }
  });
  app2.get("/api/rfqs/:rfqId/quotes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfq = await storage.getRFQ(req.params.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quotes = await storage.getRFQQuotes(req.params.rfqId);
      res.json(quotes);
    } catch (error) {
      console.error("Error fetching RFQ quotes:", error);
      res.status(500).json({ error: "Failed to fetch RFQ quotes" });
    }
  });
  app2.post("/api/rfq-quotes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqQuoteSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const rfq = await storage.getRFQ(validationResult.data.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quoteData = {
        ...validationResult.data,
        uploadedBy: req.user.id
      };
      const quote = await storage.createRFQQuote(quoteData);
      res.status(201).json(quote);
    } catch (error) {
      console.error("Error creating RFQ quote:", error);
      res.status(500).json({ error: "Failed to create RFQ quote", details: error.message });
    }
  });
  app2.patch("/api/rfq-quotes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqQuoteSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      if (validationResult.data.rfqId) {
        return res.status(400).json({
          error: "Cannot change rfqId of an existing quote"
        });
      }
      const existingQuote = await storage.getRFQQuote(req.params.id);
      if (!existingQuote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const rfq = await storage.getRFQ(existingQuote.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const quote = await storage.updateRFQQuote(req.params.id, validationResult.data);
      res.json(quote);
    } catch (error) {
      console.error("Error updating RFQ quote:", error);
      res.status(500).json({ error: "Failed to update RFQ quote", details: error.message });
    }
  });
  app2.delete("/api/rfq-quotes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingQuote = await storage.getRFQQuote(req.params.id);
      if (!existingQuote) {
        return res.status(404).json({ error: "Quote not found" });
      }
      const rfq = await storage.getRFQ(existingQuote.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteRFQQuote(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Quote not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting RFQ quote:", error);
      res.status(500).json({ error: "Failed to delete RFQ quote" });
    }
  });
  app2.get("/api/rfqs/:rfqId/follow-ups", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const rfq = await storage.getRFQ(req.params.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const followUps = await storage.getRFQFollowUps(req.params.rfqId);
      res.json(followUps);
    } catch (error) {
      console.error("Error fetching RFQ follow-ups:", error);
      res.status(500).json({ error: "Failed to fetch RFQ follow-ups" });
    }
  });
  app2.post("/api/rfq-follow-ups", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqFollowUpSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const rfq = await storage.getRFQ(validationResult.data.rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const followUp = await storage.createRFQFollowUp(validationResult.data);
      res.status(201).json(followUp);
    } catch (error) {
      console.error("Error creating RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to create RFQ follow-up", details: error.message });
    }
  });
  app2.patch("/api/rfq-follow-ups/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertRfqFollowUpSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      if (validationResult.data.rfqId) {
        return res.status(400).json({
          error: "Cannot change rfqId of an existing follow-up"
        });
      }
      const existingFollowUp = await db.select().from(schema.rfqFollowUps).where(eq(schema.rfqFollowUps.id, req.params.id)).limit(1);
      if (!existingFollowUp.length) {
        return res.status(404).json({ error: "Follow-up not found" });
      }
      const rfq = await storage.getRFQ(existingFollowUp[0].rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const followUp = await storage.updateRFQFollowUp(req.params.id, validationResult.data);
      res.json(followUp);
    } catch (error) {
      console.error("Error updating RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to update RFQ follow-up", details: error.message });
    }
  });
  app2.delete("/api/rfq-follow-ups/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const existingFollowUp = await db.select().from(schema.rfqFollowUps).where(eq(schema.rfqFollowUps.id, req.params.id)).limit(1);
      if (!existingFollowUp.length) {
        return res.status(404).json({ error: "Follow-up not found" });
      }
      const rfq = await storage.getRFQ(existingFollowUp[0].rfqId);
      if (!rfq) {
        return res.status(404).json({ error: "RFQ not found" });
      }
      if (rfq.companyId !== req.user.companyId) {
        return res.status(403).json({ error: "Access denied" });
      }
      const deleted = await storage.deleteRFQFollowUp(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "RFQ follow-up not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting RFQ follow-up:", error);
      res.status(500).json({ error: "Failed to delete RFQ follow-up" });
    }
  });
  app2.get("/api/bills", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const bills2 = await storage.getBills(
        projectId,
        status
      );
      res.json(bills2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });
  app2.get("/api/bills/:id", async (req, res) => {
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
  app2.post("/api/bills", async (req, res) => {
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
  app2.patch("/api/bills/:id", async (req, res) => {
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
  app2.delete("/api/bills/:id", async (req, res) => {
    try {
      await storage.deleteBill(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill" });
    }
  });
  app2.get("/api/bills/:id/line-items", async (req, res) => {
    try {
      const lineItems = await storage.getBillLineItems(req.params.id);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill line items" });
    }
  });
  app2.post("/api/bills/:billId/line-items", async (req, res) => {
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
  app2.patch("/api/bills/:billId/line-items/:id", async (req, res) => {
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
  app2.delete("/api/bills/:billId/line-items/:id", async (req, res) => {
    try {
      await storage.deleteBillLineItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill line item" });
    }
  });
  app2.get("/api/bills/:billId/line-item-allowances", async (req, res) => {
    try {
      const allowances = await storage.getBillLineItemAllowancesByBillId(req.params.billId);
      res.json(allowances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill line item allowances" });
    }
  });
  app2.post("/api/bill-line-item-allowances", async (req, res) => {
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
  app2.patch("/api/bill-line-item-allowances/:id", async (req, res) => {
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
  app2.delete("/api/bill-line-item-allowances/:id", async (req, res) => {
    try {
      await storage.deleteBillLineItemAllowance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete bill line item allowance" });
    }
  });
  app2.get("/api/bills/:id/approvals", async (req, res) => {
    try {
      const approvals = await storage.getBillApprovals(req.params.id);
      res.json(approvals);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch bill approvals" });
    }
  });
  app2.post("/api/bills/:id/approve", async (req, res) => {
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
        comments: req.body.comments || null
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
      if (req.body.comments && req.body.comments.trim()) {
        try {
          const bill = await storage.getBillById(req.params.id);
          if (bill) {
            const userName = req.user.firstName && req.user.lastName ? `${req.user.firstName} ${req.user.lastName}` : req.user.username || "User";
            const billName = bill.billNumber || `Bill #${bill.id.slice(0, 8)}`;
            await storage.createActivity({
              projectId: bill.projectId,
              userId: req.user.id,
              userName,
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
  app2.post("/api/bills/:id/reject", async (req, res) => {
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
        comments: req.body.comments || null
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
      if (req.body.comments && req.body.comments.trim()) {
        try {
          const bill = await storage.getBillById(req.params.id);
          if (bill) {
            const userName = req.user.firstName && req.user.lastName ? `${req.user.firstName} ${req.user.lastName}` : req.user.username || "User";
            const billName = bill.billNumber || `Bill #${bill.id.slice(0, 8)}`;
            await storage.createActivity({
              projectId: bill.projectId,
              userId: req.user.id,
              userName,
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
  app2.get("/api/variations", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const variations2 = await storage.getVariations(
        projectId,
        status
      );
      res.json(variations2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch variations" });
    }
  });
  app2.get("/api/variations/:id", async (req, res) => {
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
  app2.post("/api/variations", async (req, res) => {
    try {
      const validationResult = insertVariationSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      let variationNumber = validationResult.data.variationNumber;
      if (!variationNumber || variationNumber === "Auto-generated") {
        const projectId = validationResult.data.projectId;
        const existingVariations = await storage.getVariations(projectId);
        const projectPrefix = Math.floor(1e3 + Math.random() * 9e3);
        const variationCount = existingVariations.length + 1;
        variationNumber = `${projectPrefix}-VO-${String(variationCount).padStart(3, "0")}`;
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
  app2.patch("/api/variations/:id", async (req, res) => {
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
  app2.delete("/api/variations/:id", async (req, res) => {
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
  app2.get("/api/variations/:id/items", async (req, res) => {
    try {
      const items = await storage.getVariationItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch variation items" });
    }
  });
  app2.post("/api/variations/:id/items", async (req, res) => {
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
  app2.patch("/api/variation-items/:id", async (req, res) => {
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
  app2.delete("/api/variation-items/:id", async (req, res) => {
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
  app2.get("/api/client-invoices", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const invoices = await storage.getClientInvoices(
        projectId,
        status
      );
      res.json(invoices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoices" });
    }
  });
  app2.get("/api/client-invoices/:id", async (req, res) => {
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
  app2.post("/api/client-invoices", async (req, res) => {
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
  app2.patch("/api/client-invoices/:id", async (req, res) => {
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
  app2.delete("/api/client-invoices/:id", async (req, res) => {
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
  app2.get("/api/client-invoices/:id/items", async (req, res) => {
    try {
      const items = await storage.getClientInvoiceItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoice items" });
    }
  });
  app2.post("/api/client-invoices/:id/items", async (req, res) => {
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
  app2.patch("/api/client-invoice-items/:id", async (req, res) => {
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
  app2.delete("/api/client-invoice-items/:id", async (req, res) => {
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
  app2.get("/api/client-invoices/:id/payments", async (req, res) => {
    try {
      const payments = await storage.getClientInvoicePayments(req.params.id);
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch client invoice payments" });
    }
  });
  app2.post("/api/client-invoices/:id/payments", async (req, res) => {
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
  app2.delete("/api/client-invoice-payments/:id", async (req, res) => {
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
  app2.get("/api/client-invoices/:id/estimates", async (req, res) => {
    try {
      const estimates2 = await storage.getInvoiceEstimates(req.params.id);
      res.json(estimates2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice estimates" });
    }
  });
  app2.post("/api/client-invoices/:id/estimates", async (req, res) => {
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
  app2.delete("/api/invoice-estimates/:id", async (req, res) => {
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
  app2.get("/api/client-invoices/:id/variations", async (req, res) => {
    try {
      const variations2 = await storage.getInvoiceVariations(req.params.id);
      res.json(variations2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice variations" });
    }
  });
  app2.post("/api/client-invoices/:id/variations", async (req, res) => {
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
  app2.delete("/api/invoice-variations/:id", async (req, res) => {
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
  app2.get("/api/client-invoices/:id/bills", async (req, res) => {
    try {
      const bills2 = await storage.getInvoiceBills(req.params.id);
      res.json(bills2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch invoice bills" });
    }
  });
  app2.post("/api/client-invoices/:id/bills", async (req, res) => {
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
  app2.delete("/api/invoice-bills/:id", async (req, res) => {
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
  app2.get("/api/proposals", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const proposals2 = await storage.getProposals(
        projectId,
        status
      );
      res.json(proposals2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposals" });
    }
  });
  app2.get("/api/proposals/:id", async (req, res) => {
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
  app2.post("/api/proposals", async (req, res) => {
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
  app2.patch("/api/proposals/:id", async (req, res) => {
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
  app2.delete("/api/proposals/:id", async (req, res) => {
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
  app2.get("/api/proposals/:id/sections", async (req, res) => {
    try {
      const sections = await storage.getProposalSections(req.params.id);
      res.json(sections);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal sections" });
    }
  });
  app2.post("/api/proposals/:id/sections", async (req, res) => {
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
  app2.patch("/api/proposal-sections/:id", async (req, res) => {
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
  app2.delete("/api/proposal-sections/:id", async (req, res) => {
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
  app2.get("/api/proposals/:id/items", async (req, res) => {
    try {
      const items = await storage.getProposalItems(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal items" });
    }
  });
  app2.post("/api/proposals/:id/items", async (req, res) => {
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
  app2.patch("/api/proposal-items/:id", async (req, res) => {
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
  app2.delete("/api/proposal-items/:id", async (req, res) => {
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
  app2.get("/api/proposals/:id/acceptances", async (req, res) => {
    try {
      const acceptances = await storage.getProposalAcceptances(req.params.id);
      res.json(acceptances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch proposal acceptances" });
    }
  });
  app2.post("/api/proposals/:id/acceptances", async (req, res) => {
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
  app2.get("/api/proposals/:id/latest-acceptance", async (req, res) => {
    try {
      const acceptance = await storage.getLatestProposalAcceptance(req.params.id);
      res.json(acceptance || null);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest proposal acceptance" });
    }
  });
  app2.post("/api/proposals/:id/send", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      if (existing.status !== "draft") {
        return res.status(400).json({ error: "Only draft proposals can be sent" });
      }
      const { sentTo, sentBy, sentAt } = req.body;
      const proposal = await storage.updateProposal(req.params.id, {
        status: "sent",
        sentAt: sentAt || /* @__PURE__ */ new Date(),
        sentBy: sentBy || null,
        sentTo: sentTo || null
      });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to send proposal" });
    }
  });
  app2.post("/api/proposals/:id/accept", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      if (existing.status !== "sent") {
        return res.status(400).json({ error: "Only sent proposals can be accepted" });
      }
      const { acceptedBy, signatureData, notes: notes2 } = req.body;
      const acceptance = await storage.createProposalAcceptance({
        proposalId: req.params.id,
        acceptedBy: acceptedBy || null,
        signatureData: signatureData || null,
        notes: notes2 || null
      });
      const proposal = await storage.updateProposal(req.params.id, {
        status: "accepted",
        acceptedAt: acceptance.acceptedAt
      });
      res.json({ proposal, acceptance });
    } catch (error) {
      res.status(500).json({ error: "Failed to accept proposal" });
    }
  });
  app2.post("/api/proposals/:id/reject", async (req, res) => {
    try {
      const existing = await storage.getProposal(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      if (existing.status !== "sent") {
        return res.status(400).json({ error: "Only sent proposals can be rejected" });
      }
      const { rejectedBy, notes: notes2 } = req.body;
      const proposal = await storage.updateProposal(req.params.id, {
        status: "rejected",
        rejectedAt: /* @__PURE__ */ new Date(),
        rejectedBy: rejectedBy || null,
        rejectionNotes: notes2 || null
      });
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject proposal" });
    }
  });
  app2.post("/api/proposals/:id/convert-to-invoice", async (req, res) => {
    try {
      const proposal = await storage.getProposal(req.params.id);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      if (proposal.status !== "accepted") {
        return res.status(400).json({ error: "Only accepted proposals can be converted to invoices" });
      }
      const items = await storage.getProposalItems(req.params.id);
      const invoice = await storage.createClientInvoice({
        projectId: proposal.projectId,
        invoiceNumber: `INV-${Date.now()}`,
        // Generate invoice number
        issueDate: /* @__PURE__ */ new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
        // 30 days from now
        status: "draft",
        subtotal: proposal.totalAmount,
        taxAmount: proposal.taxAmount,
        total: proposal.totalAmount + proposal.taxAmount,
        notes: `Converted from proposal: ${proposal.title}`,
        termsAndConditions: proposal.termsAndConditions
      });
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
      await storage.updateProposal(req.params.id, {
        convertedToInvoiceAt: /* @__PURE__ */ new Date(),
        invoiceId: invoice.id
      });
      res.json({ invoice, proposal });
    } catch (error) {
      console.error("Error converting proposal to invoice:", error);
      res.status(500).json({ error: "Failed to convert proposal to invoice" });
    }
  });
  app2.get("/api/company-settings", requireAuth, requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getCompanySettings();
      res.json(settings || {});
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company settings" });
    }
  });
  app2.patch("/api/company-settings", requireAuth, requireAdmin, async (req, res) => {
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
  app2.get(
    "/api/system-configuration",
    ...process.env.NODE_ENV !== "development" ? [requireAuth, requireAdmin] : [],
    async (req, res) => {
      try {
        const config = await storage.getSystemConfiguration();
        res.json(config || {});
      } catch (error) {
        res.status(500).json({ error: "Failed to fetch system configuration" });
      }
    }
  );
  app2.put(
    "/api/system-configuration",
    ...process.env.NODE_ENV !== "development" ? [requireAuth, requireAdmin] : [],
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
    }
  );
  app2.post("/api/ocr/process-invoice", async (req, res) => {
    try {
      const { getOCRService: getOCRService2 } = await Promise.resolve().then(() => (init_ocr(), ocr_exports));
      const ocrService2 = getOCRService2();
      const { fileData, fileName } = req.body;
      if (!fileData || !fileName) {
        return res.status(400).json({ error: "File data and file name are required" });
      }
      const result = await ocrService2.processInvoiceFromBase64(fileData, fileName);
      res.json(result);
    } catch (error) {
      console.error("OCR processing error:", error);
      res.status(500).json({ error: error.message || "Failed to process invoice with OCR" });
    }
  });
  const upload = multer({ storage: multer.memoryStorage() });
  app2.post("/api/webhooks/email-invoice", upload.any(), async (req, res) => {
    try {
      console.log("Email webhook received:", {
        hasBody: !!req.body,
        hasFiles: !!req.files,
        fileCount: req.files?.length || 0,
        bodyKeys: Object.keys(req.body || {})
      });
      const { getEmailParserService: getEmailParserService2 } = await Promise.resolve().then(() => (init_emailParser(), emailParser_exports));
      const { getAutoBillCreatorService: getAutoBillCreatorService2 } = await Promise.resolve().then(() => (init_autoBillCreator(), autoBillCreator_exports));
      const emailParser = getEmailParserService2();
      const autoBillCreator = getAutoBillCreatorService2();
      if (!req.body || !req.body.from && !req.body.subject) {
        return res.status(400).json({
          error: "Invalid email data",
          message: "Request must contain email metadata (from, subject, etc.)",
          received: { body: req.body, files: req.files?.length || 0 }
        });
      }
      const parsedEmail = emailParser.parseSendGridEmail(req.body, req.files);
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
        attachmentCount: parsedEmail.attachments.length
      });
      const users2 = await storage.getUsers("team");
      const defaultUser = users2.find((u) => u.username === "admin") || users2[0];
      if (!defaultUser) {
        return res.status(500).json({ error: "No system user found" });
      }
      const results = await autoBillCreator.processEmailInvoices(parsedEmail, {
        defaultUserId: defaultUser.id,
        autoMatch: true
        // Auto-match suppliers and projects
      });
      console.log("Email processing complete:", {
        processedCount: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length
      });
      res.json({
        success: true,
        message: `Processed ${results.length} invoice(s)`,
        results
      });
    } catch (error) {
      console.error("Email-to-bill webhook error:", error);
      res.status(500).json({
        error: error.message || "Failed to process email invoice",
        stack: process.env.NODE_ENV === "development" ? error.stack : void 0
      });
    }
  });
  app2.get("/api/activities", async (req, res) => {
    try {
      const projectId = req.query.projectId;
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      if (!projectId) {
        return res.status(400).json({ error: "projectId is required" });
      }
      const activities2 = await storage.getActivities(projectId, limit);
      res.json(activities2);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  app2.post("/api/activities", async (req, res) => {
    try {
      const activityData = insertActivitySchema.parse(req.body);
      const activity = await storage.createActivity(activityData);
      res.json(activity);
    } catch (error) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid activity data", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/site-diary-templates", async (req, res) => {
    try {
      const templates = await storage.getSiteDiaryTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch site diary templates",
        details: error.message
      });
    }
  });
  app2.get("/api/site-diary-templates/:id", async (req, res) => {
    try {
      const template = await storage.getSiteDiaryTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch template",
        details: error.message
      });
    }
  });
  app2.post("/api/site-diary-templates", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create template",
        details: error.message
      });
    }
  });
  app2.patch("/api/site-diary-templates/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update template",
        details: error.message
      });
    }
  });
  app2.delete("/api/site-diary-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteSiteDiaryTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete template",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/site-diary-entries", async (req, res) => {
    try {
      const entries = await storage.getSiteDiaryEntries(req.params.projectId);
      res.json(entries);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch site diary entries",
        details: error.message
      });
    }
  });
  app2.get("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getSiteDiaryEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch entry",
        details: error.message
      });
    }
  });
  app2.post("/api/site-diary-entries", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryEntrySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const template = await storage.getSiteDiaryTemplate(validationResult.data.templateId);
      if (!template) {
        return res.status(400).json({ error: "Template not found" });
      }
      const project = await storage.getProject(validationResult.data.projectId);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }
      const entry = await storage.createSiteDiaryEntry(validationResult.data);
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create entry",
        details: error.message
      });
    }
  });
  app2.patch("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const validationResult = insertSiteDiaryEntrySchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      if (validationResult.data.templateId) {
        const template = await storage.getSiteDiaryTemplate(validationResult.data.templateId);
        if (!template) {
          return res.status(400).json({ error: "Template not found" });
        }
      }
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update entry",
        details: error.message
      });
    }
  });
  app2.delete("/api/site-diary-entries/:id", async (req, res) => {
    try {
      const success = await storage.deleteSiteDiaryEntry(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete entry",
        details: error.message
      });
    }
  });
  app2.get("/api/cost-categories", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const categories = await storage.getCostCategories(req.user.companyId);
      res.json(categories);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch cost categories",
        details: error.message
      });
    }
  });
  app2.get("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const category = await storage.getCostCategory(req.params.id, req.user.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch cost category",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-categories", requireAuth, requireTeamMember, async (req, res) => {
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
        companyId: req.user.companyId
      });
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create cost category",
        details: error.message
      });
    }
  });
  app2.patch("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCategorySchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const category = await storage.updateCostCategory(req.params.id, validationResult.data, req.user.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update cost category",
        details: error.message
      });
    }
  });
  app2.delete("/api/cost-categories/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCostCategory(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete cost category",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-categories/:id/archive", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const category = await storage.archiveCostCategory(req.params.id, req.user.companyId);
      if (!category) {
        return res.status(404).json({ error: "Cost category not found" });
      }
      res.json(category);
    } catch (error) {
      res.status(500).json({
        error: "Failed to archive cost category",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-categories/merge", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = z2.object({
        sourceId: z2.string().uuid(),
        targetId: z2.string().uuid()
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
      const companyId = req.user.companyId;
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
      if (!targetCategory.isActive) {
        return res.status(400).json({ error: "Cannot merge into an archived category" });
      }
      await storage.mergeCostCategories(sourceId, targetId, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to merge cost categories",
        details: error.message
      });
    }
  });
  app2.get("/api/cost-codes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const codes = await storage.getCostCodes(req.user.companyId);
      res.json(codes);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch cost codes",
        details: error.message
      });
    }
  });
  app2.get("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const code = await storage.getCostCode(req.params.id, req.user.companyId);
      if (!code) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(code);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch cost code",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-codes", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCodeSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create cost code",
        details: error.message
      });
    }
  });
  app2.patch("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertCostCodeSchema.omit({ companyId: true }).partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update cost code",
        details: error.message
      });
    }
  });
  app2.delete("/api/cost-codes/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCostCode(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete cost code",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-codes/:id/archive", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const code = await storage.archiveCostCode(req.params.id, req.user.companyId);
      if (!code) {
        return res.status(404).json({ error: "Cost code not found" });
      }
      res.json(code);
    } catch (error) {
      res.status(500).json({
        error: "Failed to archive cost code",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-codes/merge", requireAuth, requireTeamMember, async (req, res) => {
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
      const companyId = req.user.companyId;
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to merge cost codes",
        details: error.message
      });
    }
  });
  app2.post("/api/cost-codes/import", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          error: "Items array is required"
        });
      }
      const companyId = req.user.companyId;
      const categoryMap = /* @__PURE__ */ new Map();
      let categoriesCreated = 0;
      let codesCreated = 0;
      const existingCategories = await storage.getCostCategories(companyId);
      for (const cat of existingCategories) {
        categoryMap.set(cat.code, cat.id);
      }
      for (const item of items) {
        let categoryId = null;
        if (item.categoryCode && item.categoryTitle) {
          if (!categoryMap.has(item.categoryCode)) {
            const newCategory = await storage.createCostCategory({
              code: item.categoryCode,
              title: item.categoryTitle,
              companyId
            });
            categoryMap.set(item.categoryCode, newCategory.id);
            categoriesCreated++;
            categoryId = newCategory.id;
          } else {
            categoryId = categoryMap.get(item.categoryCode);
          }
        }
        if (item.costCode && item.costCodeTitle) {
          await storage.createCostCode({
            code: item.costCode,
            title: item.costCodeTitle,
            categoryId,
            availableInTimesheets: true,
            companyId
          });
          codesCreated++;
        }
      }
      res.json({
        categoriesCreated,
        codesCreated,
        totalProcessed: items.length
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to import cost codes",
        details: error.message
      });
    }
  });
  app2.get("/api/task-tags", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const tags = await storage.getTaskTags(req.user.companyId);
      res.json(tags);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch task tags",
        details: error.message
      });
    }
  });
  app2.get("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const tag = await storage.getTaskTag(req.params.id, req.user.companyId);
      if (!tag) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.json(tag);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch task tag",
        details: error.message
      });
    }
  });
  app2.post("/api/task-tags", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTagSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const existingTags = await storage.getTaskTags(companyId);
      const maxOrder = existingTags.reduce((max, tag2) => Math.max(max, tag2.displayOrder), 0);
      const tag = await storage.createTaskTag({
        ...validationResult.data,
        companyId,
        displayOrder: maxOrder + 1
      });
      res.status(201).json(tag);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create task tag",
        details: error.message
      });
    }
  });
  app2.patch("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
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
        req.user.companyId
      );
      if (!tag) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.json(tag);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update task tag",
        details: error.message
      });
    }
  });
  app2.delete("/api/task-tags/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteTaskTag(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Task tag not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete task tag",
        details: error.message
      });
    }
  });
  app2.post("/api/task-tags/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({
          error: "Updates array is required"
        });
      }
      await storage.updateTaskTagsOrder(updates, req.user.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to reorder task tags",
        details: error.message
      });
    }
  });
  app2.get("/api/task-template-statuses", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const statuses = await storage.getTaskTemplateStatuses(req.user.companyId);
      res.json(statuses);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch task template statuses",
        details: error.message
      });
    }
  });
  app2.get("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const status = await storage.getTaskTemplateStatus(req.params.id, req.user.companyId);
      if (!status) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch task template status",
        details: error.message
      });
    }
  });
  app2.post("/api/task-template-statuses", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateStatusSchema.omit({ companyId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const existingStatuses = await storage.getTaskTemplateStatuses(companyId);
      const maxOrder = existingStatuses.reduce((max, status2) => Math.max(max, status2.displayOrder), 0);
      const status = await storage.createTaskTemplateStatus({
        ...validationResult.data,
        companyId,
        displayOrder: maxOrder + 1
      });
      res.status(201).json(status);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create task template status",
        details: error.message
      });
    }
  });
  app2.patch("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
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
        req.user.companyId
      );
      if (!status) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update task template status",
        details: error.message
      });
    }
  });
  app2.delete("/api/task-template-statuses/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteTaskTemplateStatus(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Task template status not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete task template status",
        details: error.message
      });
    }
  });
  app2.post("/api/task-template-statuses/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { updates } = req.body;
      if (!updates || !Array.isArray(updates)) {
        return res.status(400).json({
          error: "Updates array is required"
        });
      }
      await storage.updateTaskTemplateStatusesOrder(updates, req.user.companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to reorder task template statuses",
        details: error.message
      });
    }
  });
  app2.get("/api/checklist-templates", async (req, res) => {
    try {
      const templates = await storage.getChecklistTemplates();
      res.json(templates);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch checklist templates",
        details: error.message
      });
    }
  });
  app2.get("/api/checklist-templates/:id", async (req, res) => {
    try {
      const template = await storage.getChecklistTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch template",
        details: error.message
      });
    }
  });
  app2.post("/api/checklist-templates", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create template",
        details: error.message
      });
    }
  });
  app2.patch("/api/checklist-templates/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update template",
        details: error.message
      });
    }
  });
  app2.delete("/api/checklist-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete template",
        details: error.message
      });
    }
  });
  app2.post("/api/checklist-templates/:id/duplicate", async (req, res) => {
    let duplicateTemplate = null;
    try {
      const { id } = req.params;
      const templates = await storage.getChecklistTemplates();
      const originalTemplate = templates.find((t) => t.id === id);
      if (!originalTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }
      duplicateTemplate = await storage.createChecklistTemplate({
        name: `${originalTemplate.name} (Copy)`,
        description: originalTemplate.description,
        type: originalTemplate.type
      });
      const groups = await storage.getChecklistTemplateGroups(id);
      for (const group of groups) {
        const duplicateGroup = await storage.createChecklistTemplateGroup({
          templateId: duplicateTemplate.id,
          name: group.name,
          order: group.order
        });
        const items = await storage.getChecklistTemplateItems(group.id);
        for (const item of items) {
          await storage.createChecklistTemplateItem({
            groupId: duplicateGroup.id,
            description: item.description,
            order: item.order
          });
        }
      }
      res.json(duplicateTemplate);
    } catch (error) {
      if (duplicateTemplate) {
        try {
          await storage.hardDeleteChecklistTemplate(duplicateTemplate.id);
        } catch (cleanupError) {
          console.error("Failed to cleanup duplicate template after error:", cleanupError);
        }
      }
      res.status(500).json({ error: error.message });
    }
  });
  app2.get("/api/checklist-templates/:templateId/groups", async (req, res) => {
    try {
      const groups = await storage.getChecklistTemplateGroups(req.params.templateId);
      res.json(groups);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch groups",
        details: error.message
      });
    }
  });
  app2.post("/api/checklist-template-groups", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create group",
        details: error.message
      });
    }
  });
  app2.patch("/api/checklist-template-groups/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update group",
        details: error.message
      });
    }
  });
  app2.delete("/api/checklist-template-groups/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplateGroup(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Group not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete group",
        details: error.message
      });
    }
  });
  app2.get("/api/checklist-template-groups/:groupId/items", async (req, res) => {
    try {
      const items = await storage.getChecklistTemplateItems(req.params.groupId);
      res.json(items);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch items",
        details: error.message
      });
    }
  });
  app2.post("/api/checklist-template-items", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create item",
        details: error.message
      });
    }
  });
  app2.patch("/api/checklist-template-items/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update item",
        details: error.message
      });
    }
  });
  app2.delete("/api/checklist-template-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteChecklistTemplateItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete item",
        details: error.message
      });
    }
  });
  app2.post("/api/checklist-templates/import", async (req, res) => {
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
      const templateMap = /* @__PURE__ */ new Map();
      for (const row of items) {
        if (!row.templateName || !row.type) {
          continue;
        }
        const templateKey = row.templateName.trim();
        if (!templateMap.has(templateKey)) {
          templateMap.set(templateKey, {
            name: row.templateName,
            description: row.templateDescription || null,
            type: row.type,
            groups: /* @__PURE__ */ new Map()
          });
        }
        const template = templateMap.get(templateKey);
        if (row.groupName) {
          const groupKey = row.groupName.trim();
          if (!template.groups.has(groupKey)) {
            template.groups.set(groupKey, []);
          }
          if (row.itemDescription && row.itemDescription.trim()) {
            template.groups.get(groupKey).push({
              description: row.itemDescription,
              order: template.groups.get(groupKey).length
            });
          }
        }
      }
      for (const [, templateData] of Array.from(templateMap)) {
        const template = await storage.createChecklistTemplate({
          name: templateData.name,
          description: templateData.description,
          type: templateData.type
        });
        templatesCreated++;
        let groupOrder = 0;
        for (const [groupName, groupItems] of Array.from(templateData.groups)) {
          const group = await storage.createChecklistTemplateGroup({
            templateId: template.id,
            name: groupName,
            order: groupOrder++
          });
          groupsCreated++;
          for (const item of groupItems) {
            await storage.createChecklistTemplateItem({
              groupId: group.id,
              description: item.description,
              order: item.order
            });
            itemsCreated++;
          }
        }
      }
      res.json({
        templatesCreated,
        groupsCreated,
        itemsCreated,
        totalProcessed: items.length
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to import checklist templates",
        details: error.message
      });
    }
  });
  app2.get("/api/checklist-templates/export", async (req, res) => {
    try {
      const templates = await storage.getChecklistTemplates();
      const exportData = [];
      for (const template of templates) {
        const groups = await storage.getChecklistTemplateGroups(template.id);
        if (groups.length === 0) {
          exportData.push({
            templateName: template.name,
            templateDescription: template.description || "",
            type: template.type,
            groupName: "",
            itemDescription: ""
          });
        } else {
          for (const group of groups) {
            const items = await storage.getChecklistTemplateItems(group.id);
            if (items.length === 0) {
              exportData.push({
                templateName: template.name,
                templateDescription: template.description || "",
                type: template.type,
                groupName: group.name,
                itemDescription: ""
              });
            } else {
              for (const item of items) {
                exportData.push({
                  templateName: template.name,
                  templateDescription: template.description || "",
                  type: template.type,
                  groupName: group.name,
                  itemDescription: item.description
                });
              }
            }
          }
        }
      }
      res.json(exportData);
    } catch (error) {
      res.status(500).json({
        error: "Failed to export checklist templates",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/budget", async (req, res) => {
    try {
      const budget = await storage.getBudget(req.params.projectId);
      if (!budget) {
        const newBudget = await storage.calculateBudget(req.params.projectId);
        return res.json(newBudget);
      }
      res.json(budget);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch budget",
        details: error.message
      });
    }
  });
  app2.post("/api/projects/:projectId/budget/calculate", async (req, res) => {
    try {
      const budget = await storage.calculateBudget(req.params.projectId);
      res.json(budget);
    } catch (error) {
      res.status(500).json({
        error: "Failed to calculate budget",
        details: error.message
      });
    }
  });
  app2.patch("/api/budgets/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update budget",
        details: error.message
      });
    }
  });
  app2.delete("/api/budgets/:id", async (req, res) => {
    try {
      const success = await storage.deleteBudget(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Budget not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete budget",
        details: error.message
      });
    }
  });
  app2.get("/api/budgets/:budgetId/line-items", async (req, res) => {
    try {
      const lineItems = await storage.getBudgetLineItems(req.params.budgetId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch budget line items",
        details: error.message
      });
    }
  });
  app2.post("/api/budgets/:budgetId/line-items/recalculate", async (req, res) => {
    try {
      const lineItems = await storage.recalculateBudgetLineItems(req.params.budgetId);
      res.json(lineItems);
    } catch (error) {
      res.status(500).json({
        error: "Failed to recalculate budget line items",
        details: error.message
      });
    }
  });
  app2.patch("/api/budget-line-items/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update budget line item",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/labour-hours-budget", async (req, res) => {
    try {
      const labourHours = await storage.getLabourHoursBudget(req.params.projectId);
      res.json(labourHours);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch labour hours budget",
        details: error.message
      });
    }
  });
  app2.post("/api/projects/:projectId/labour-hours-budget/recalculate", async (req, res) => {
    try {
      const labourHours = await storage.recalculateLabourHoursBudget(req.params.projectId);
      res.json(labourHours);
    } catch (error) {
      res.status(500).json({
        error: "Failed to recalculate labour hours budget",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/allowances", async (req, res) => {
    try {
      const allowances = await storage.getProjectAllowances(req.params.projectId);
      res.json(allowances);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch allowances",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/timesheets", async (req, res) => {
    try {
      const timesheets2 = await storage.getTimesheets(req.params.projectId);
      res.json(timesheets2);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get project timesheets",
        details: error.message
      });
    }
  });
  app2.get("/api/timesheets", async (req, res) => {
    try {
      const { projectId, userId, startDate, endDate, status, costCodeId, invoiced } = req.query;
      const timesheets2 = await storage.getTimesheets(
        projectId,
        {
          userId,
          startDate: startDate ? new Date(startDate) : void 0,
          endDate: endDate ? new Date(endDate) : void 0,
          status,
          costCodeId,
          invoiced: invoiced ? invoiced === "true" : void 0
        }
      );
      res.json(timesheets2);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get timesheets",
        details: error.message
      });
    }
  });
  app2.get("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.getTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get timesheet",
        details: error.message
      });
    }
  });
  app2.post("/api/timesheets", async (req, res) => {
    try {
      const timesheet = await storage.createTimesheet(req.body);
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create timesheet",
        details: error.message
      });
    }
  });
  app2.patch("/api/timesheets/:id", async (req, res) => {
    try {
      const timesheet = await storage.updateTimesheet(req.params.id, req.body);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update timesheet",
        details: error.message
      });
    }
  });
  app2.delete("/api/timesheets/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTimesheet(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete timesheet",
        details: error.message
      });
    }
  });
  app2.post("/api/timesheets/:id/submit", async (req, res) => {
    try {
      const timesheet = await storage.submitTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to submit timesheet",
        details: error.message
      });
    }
  });
  app2.post("/api/timesheets/:id/approve", async (req, res) => {
    try {
      const timesheet = await storage.approveTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to approve timesheet",
        details: error.message
      });
    }
  });
  app2.post("/api/timesheets/:id/reject", async (req, res) => {
    try {
      const timesheet = await storage.rejectTimesheet(req.params.id);
      if (!timesheet) {
        return res.status(404).json({ error: "Timesheet not found" });
      }
      res.json(timesheet);
    } catch (error) {
      res.status(500).json({
        error: "Failed to reject timesheet",
        details: error.message
      });
    }
  });
  app2.get("/api/timesheets/:timesheetId/cost-codes", async (req, res) => {
    try {
      const costCodes2 = await storage.getTimesheetCostCodes(req.params.timesheetId);
      res.json(costCodes2);
    } catch (error) {
      res.status(500).json({
        error: "Failed to get timesheet cost codes",
        details: error.message
      });
    }
  });
  app2.post("/api/timesheets/:timesheetId/cost-codes", async (req, res) => {
    try {
      const costCode = await storage.createTimesheetCostCode({
        ...req.body,
        timesheetId: req.params.timesheetId
      });
      res.json(costCode);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create timesheet cost code",
        details: error.message
      });
    }
  });
  app2.patch("/api/timesheets/cost-codes/:id", async (req, res) => {
    try {
      const costCode = await storage.updateTimesheetCostCode(req.params.id, req.body);
      if (!costCode) {
        return res.status(404).json({ error: "Timesheet cost code not found" });
      }
      res.json(costCode);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update timesheet cost code",
        details: error.message
      });
    }
  });
  app2.delete("/api/timesheets/cost-codes/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTimesheetCostCode(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Timesheet cost code not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete timesheet cost code",
        details: error.message
      });
    }
  });
  app2.get("/api/timesheets/active", async (req, res) => {
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
  app2.post("/api/timesheets/clock-in", async (req, res) => {
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
  app2.post("/api/timesheets/clock-out", async (req, res) => {
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
  app2.get("/api/timesheets/:timesheetId/allowances", async (req, res) => {
    try {
      const allowances = await storage.getTimesheetAllowances(req.params.timesheetId);
      res.json(allowances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch timesheet allowances" });
    }
  });
  app2.post("/api/timesheet-allowances", async (req, res) => {
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
  app2.patch("/api/timesheet-allowances/:id", async (req, res) => {
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
  app2.delete("/api/timesheet-allowances/:id", async (req, res) => {
    try {
      await storage.deleteTimesheetAllowance(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete timesheet allowance" });
    }
  });
  app2.get("/api/estimate-items/:estimateItemId/allowance-items", async (req, res) => {
    try {
      const items = await storage.getAllowanceItems(req.params.estimateItemId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch allowance items" });
    }
  });
  app2.post("/api/allowance-items", async (req, res) => {
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
  app2.patch("/api/allowance-items/:id", async (req, res) => {
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
  app2.delete("/api/allowance-items/:id", async (req, res) => {
    try {
      await storage.deleteAllowanceItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete allowance item" });
    }
  });
  app2.get("/api/projects/:projectId/schedule", async (req, res) => {
    try {
      const schedule = await storage.getSchedule(req.params.projectId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule",
        details: error.message
      });
    }
  });
  app2.post("/api/schedules", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create schedule",
        details: error.message
      });
    }
  });
  app2.patch("/api/schedules/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update schedule",
        details: error.message
      });
    }
  });
  app2.put("/api/schedules/:id/status", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update schedule status",
        details: error.message
      });
    }
  });
  app2.delete("/api/schedules/:id", async (req, res) => {
    try {
      const success = await storage.deleteSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete schedule",
        details: error.message
      });
    }
  });
  app2.get("/api/schedules/:scheduleId/items", async (req, res) => {
    try {
      const items = await storage.getScheduleItems(req.params.scheduleId);
      res.json(items);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule items",
        details: error.message
      });
    }
  });
  app2.get("/api/projects/:projectId/schedule-items", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const items = await storage.getScheduleItemsByProject(req.params.projectId);
      res.json(items);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule items",
        details: error.message
      });
    }
  });
  app2.get("/api/schedule-items/all", async (req, res) => {
    try {
      const user = req.user;
      if (!user?.companyId) {
        return res.status(401).json({ error: "Unauthorized - no company context" });
      }
      const items = await storage.getAllScheduleItems(user.companyId);
      res.json(items);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch all schedule items",
        details: error.message
      });
    }
  });
  app2.get("/api/schedule-items/:id", async (req, res) => {
    try {
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule item",
        details: error.message
      });
    }
  });
  app2.post("/api/schedule-items", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create schedule item",
        details: error.message
      });
    }
  });
  app2.patch("/api/schedule-items/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update schedule item",
        details: error.message
      });
    }
  });
  app2.post("/api/schedule-items/bulk", async (req, res) => {
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: "Expected items array" });
      }
      const updatedItems = await storage.bulkUpdateScheduleItems(items);
      res.json(updatedItems);
    } catch (error) {
      res.status(500).json({
        error: "Failed to bulk update schedule items",
        details: error.message
      });
    }
  });
  app2.delete("/api/schedule-items/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete schedule item",
        details: error.message
      });
    }
  });
  app2.post("/api/schedule-items/:id/dependencies", async (req, res) => {
    try {
      const { predecessorId, type = "FS" } = req.body;
      if (!predecessorId) {
        return res.status(400).json({ error: "predecessorId is required" });
      }
      if (!["FS", "SS", "FF", "SF"].includes(type)) {
        return res.status(400).json({ error: "Invalid dependency type. Must be FS, SS, FF, or SF" });
      }
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      const dependencies = item.dependencies || [];
      const existingDep = dependencies.find((d) => d.id === predecessorId);
      if (existingDep) {
        return res.status(400).json({ error: "Dependency already exists" });
      }
      const predecessor = await storage.getScheduleItem(predecessorId);
      if (!predecessor) {
        return res.status(404).json({ error: "Predecessor item not found" });
      }
      if (predecessorId === req.params.id) {
        return res.status(400).json({ error: "Item cannot depend on itself" });
      }
      const wouldCreateCycle = (startId, targetId, visited = /* @__PURE__ */ new Set()) => {
        if (startId === targetId) return true;
        if (visited.has(startId)) return false;
        visited.add(startId);
        const predDeps = predecessor.dependencies || [];
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
      const updatedDependencies = [...dependencies, { id: predecessorId, type }];
      const updatedItem = await storage.updateScheduleItem(req.params.id, {
        dependencies: updatedDependencies
      });
      res.json(updatedItem);
    } catch (error) {
      res.status(500).json({
        error: "Failed to add dependency",
        details: error.message
      });
    }
  });
  app2.delete("/api/schedule-items/:id/dependencies/:predecessorId", async (req, res) => {
    try {
      const item = await storage.getScheduleItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Schedule item not found" });
      }
      const dependencies = item.dependencies || [];
      const updatedDependencies = dependencies.filter((d) => d.id !== req.params.predecessorId);
      const updatedItem = await storage.updateScheduleItem(req.params.id, {
        dependencies: updatedDependencies
      });
      res.json(updatedItem);
    } catch (error) {
      res.status(500).json({
        error: "Failed to remove dependency",
        details: error.message
      });
    }
  });
  app2.post("/api/activity-notes/batch-counts", requireAuth, async (req, res) => {
    try {
      const { scheduleItemIds } = req.body;
      if (!Array.isArray(scheduleItemIds)) {
        return res.status(400).json({ error: "scheduleItemIds must be an array" });
      }
      const counts = await storage.getBatchActivityNoteCounts(scheduleItemIds);
      res.json(counts);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch batch activity note counts",
        details: error.message
      });
    }
  });
  app2.get("/api/schedule-items/:scheduleItemId/activity-notes", requireAuth, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const offset = parseInt(req.query.offset) || 0;
      const [notes2, totalCount] = await Promise.all([
        storage.getActivityNotes(req.params.scheduleItemId, limit, offset),
        storage.getActivityNoteCount(req.params.scheduleItemId)
      ]);
      res.json({
        notes: notes2,
        totalCount,
        hasMore: offset + notes2.length < totalCount
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch activity notes",
        details: error.message
      });
    }
  });
  app2.post("/api/schedule-items/:scheduleItemId/activity-notes", requireAuth, async (req, res) => {
    try {
      const validationResult = insertActivityNoteSchema.safeParse({
        ...req.body,
        scheduleItemId: req.params.scheduleItemId,
        userId: req.user.id,
        userName: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim() || req.user.email
      });
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).message
        });
      }
      const newNote = await storage.createActivityNote(validationResult.data);
      res.status(201).json(newNote);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create activity note",
        details: error.message
      });
    }
  });
  app2.patch("/api/activity-notes/:id", requireAuth, async (req, res) => {
    try {
      const canEdit = await storage.canEditActivityNote(req.params.id, req.user.id);
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update activity note",
        details: error.message
      });
    }
  });
  app2.delete("/api/activity-notes/:id", requireAuth, async (req, res) => {
    try {
      const canDelete = await storage.canEditActivityNote(req.params.id, req.user.id);
      const isAdmin = req.user.roleName === "Admin" || req.user.roleName === "Owner";
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete activity note",
        details: error.message
      });
    }
  });
  app2.get("/api/schedule-templates", async (req, res) => {
    try {
      const category = req.query.category;
      const templates = await storage.getScheduleTemplates(category);
      res.json(templates);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule templates",
        details: error.message
      });
    }
  });
  app2.get("/api/schedule-templates/:id", async (req, res) => {
    try {
      const template = await storage.getScheduleTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Schedule template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch schedule template",
        details: error.message
      });
    }
  });
  app2.post("/api/schedule-templates", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to create schedule template",
        details: error.message
      });
    }
  });
  app2.patch("/api/schedule-templates/:id", async (req, res) => {
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
    } catch (error) {
      res.status(500).json({
        error: "Failed to update schedule template",
        details: error.message
      });
    }
  });
  app2.delete("/api/schedule-templates/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleTemplate(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule template not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete schedule template",
        details: error.message
      });
    }
  });
  app2.get("/api/calendar-views", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { calendarType } = req.query;
      if (!calendarType || calendarType !== "personal" && calendarType !== "business") {
        return res.status(400).json({ error: "Invalid calendar type. Must be 'personal' or 'business'" });
      }
      const views = await storage.getCalendarViews(
        req.user.id,
        calendarType,
        req.user.companyId
      );
      res.json(views);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch calendar views",
        details: error.message
      });
    }
  });
  app2.get("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const view = await storage.getCalendarView(req.params.id, req.user.companyId);
      if (!view) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.json(view);
    } catch (error) {
      res.status(500).json({
        error: "Failed to fetch calendar view",
        details: error.message
      });
    }
  });
  app2.post("/api/calendar-views", requireAuth, requireTeamMember, async (req, res) => {
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
        userId: req.user.id,
        companyId: req.user.companyId
      });
      res.status(201).json(view);
    } catch (error) {
      res.status(500).json({
        error: "Failed to create calendar view",
        details: error.message
      });
    }
  });
  app2.patch("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
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
        req.user.companyId
      );
      if (!view) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.json(view);
    } catch (error) {
      res.status(500).json({
        error: "Failed to update calendar view",
        details: error.message
      });
    }
  });
  app2.delete("/api/calendar-views/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const success = await storage.deleteCalendarView(req.params.id, req.user.companyId);
      if (!success) {
        return res.status(404).json({ error: "Calendar view not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({
        error: "Failed to delete calendar view",
        details: error.message
      });
    }
  });
  app2.post("/api/calendar-views/cleanup-duplicates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const { calendarType } = req.body;
      if (!calendarType || calendarType !== "personal" && calendarType !== "business") {
        return res.status(400).json({ error: "Invalid calendar type" });
      }
      const views = await storage.getCalendarViews(
        req.user.userId,
        req.user.companyId,
        calendarType
      );
      const defaultViews = views.filter((v) => v.isDefault && v.name === "All Events");
      if (defaultViews.length <= 1) {
        return res.json({ message: "No duplicates found", deleted: 0 });
      }
      const toDelete = defaultViews.slice(1);
      let deletedCount = 0;
      for (const view of toDelete) {
        const success = await storage.deleteCalendarView(view.id, req.user.companyId);
        if (success) deletedCount++;
      }
      res.json({ message: "Duplicates cleaned up", deleted: deletedCount });
    } catch (error) {
      res.status(500).json({
        error: "Failed to cleanup duplicates",
        details: error.message
      });
    }
  });
  app2.get("/api/defects", async (req, res) => {
    try {
      const { projectId, status } = req.query;
      const defects2 = await storage.getDefects(
        projectId,
        status
      );
      res.json(defects2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch defects" });
    }
  });
  app2.get("/api/defects/:id", async (req, res) => {
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
  app2.post("/api/defects", async (req, res) => {
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
  app2.patch("/api/defects/:id", async (req, res) => {
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
  app2.delete("/api/defects/:id", async (req, res) => {
    try {
      await storage.deleteDefect(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete defect" });
    }
  });
  app2.get("/api/systems/folders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { parentId } = req.query;
      const folders = await storage.getSystemFolders(
        companyId,
        parentId === "null" ? null : parentId
      );
      res.json(folders);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch system folders" });
    }
  });
  app2.get("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const folder = await storage.getSystemFolder(req.params.id, companyId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch folder" });
    }
  });
  app2.post("/api/systems/folders", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemFolderSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const createdBy = req.user.id;
      const createdByName = `${req.user.firstName} ${req.user.lastName}`;
      const folder = await storage.createSystemFolder({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName
      });
      res.status(201).json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to create folder" });
    }
  });
  app2.patch("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemFolderSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const folder = await storage.updateSystemFolder(req.params.id, validationResult.data, companyId);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      res.status(500).json({ error: "Failed to update folder" });
    }
  });
  app2.delete("/api/systems/folders/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      await storage.deleteSystemFolder(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete folder" });
    }
  });
  app2.post("/api/systems/folders/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { updates } = req.body;
      await storage.updateSystemFoldersOrder(updates, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder folders" });
    }
  });
  app2.get("/api/systems/documents", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { folderId } = req.query;
      const documents = await storage.getSystemDocuments(
        companyId,
        folderId === "null" ? null : folderId
      );
      res.json(documents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });
  app2.get("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const document = await storage.getSystemDocument(req.params.id, companyId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });
  app2.post("/api/systems/documents", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemDocumentSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const createdBy = req.user.id;
      const createdByName = `${req.user.firstName} ${req.user.lastName}`;
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
        taskTemplateName
      });
      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to create document" });
    }
  });
  app2.patch("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertSystemDocumentSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const updatedBy = req.user.id;
      const updatedByName = `${req.user.firstName} ${req.user.lastName}`;
      let taskTemplateName = validationResult.data.taskTemplateName;
      if (validationResult.data.taskTemplateId) {
        const template = await storage.getTaskTemplate(validationResult.data.taskTemplateId, companyId);
        if (template) {
          taskTemplateName = template.title;
        }
      } else if (validationResult.data.taskTemplateId === null) {
        taskTemplateName = null;
      }
      const document = await storage.updateSystemDocument(req.params.id, {
        ...validationResult.data,
        updatedBy,
        updatedByName,
        taskTemplateName
      }, companyId);
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      res.status(500).json({ error: "Failed to update document" });
    }
  });
  app2.delete("/api/systems/documents/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      await storage.deleteSystemDocument(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });
  app2.post("/api/systems/documents/reorder", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { updates } = req.body;
      await storage.updateSystemDocumentsOrder(updates, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to reorder documents" });
    }
  });
  app2.get("/api/systems/task-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { isActive } = req.query;
      const templates = await storage.getTaskTemplates(
        companyId,
        isActive === "true" ? true : isActive === "false" ? false : void 0
      );
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task templates" });
    }
  });
  app2.get("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const template = await storage.getTaskTemplate(req.params.id, companyId);
      if (!template) {
        return res.status(404).json({ error: "Task template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch task template" });
    }
  });
  app2.post("/api/systems/task-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const createdBy = req.user.id;
      const createdByName = `${req.user.firstName} ${req.user.lastName}`;
      const template = await storage.createTaskTemplate({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create task template" });
    }
  });
  app2.patch("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertTaskTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const template = await storage.updateTaskTemplate(req.params.id, validationResult.data, companyId);
      if (!template) {
        return res.status(404).json({ error: "Task template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update task template" });
    }
  });
  app2.delete("/api/systems/task-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      await storage.deleteTaskTemplate(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete task template" });
    }
  });
  app2.post("/api/systems/task-templates/generate-recurring", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const result = await storage.generateRecurringTasks(companyId);
      res.json(result);
    } catch (error) {
      console.error("Failed to generate recurring tasks:", error);
      res.status(500).json({ error: "Failed to generate recurring tasks" });
    }
  });
  app2.post("/api/systems/task-templates/:id/regenerate", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const result = await storage.clearAndRegenerateTemplateTask(req.params.id, companyId);
      res.json(result);
    } catch (error) {
      console.error("Failed to clear and regenerate template tasks:", error);
      res.status(500).json({ error: "Failed to clear and regenerate template tasks" });
    }
  });
  app2.get("/api/systems/workflow-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const { isActive } = req.query;
      const templates = await storage.getWorkflowTemplates(
        companyId,
        isActive === "true" ? true : isActive === "false" ? false : void 0
      );
      res.json(templates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow templates" });
    }
  });
  app2.get("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const template = await storage.getWorkflowTemplate(req.params.id, companyId);
      if (!template) {
        return res.status(404).json({ error: "Workflow template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch workflow template" });
    }
  });
  app2.post("/api/systems/workflow-templates", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertWorkflowTemplateSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const createdBy = req.user.id;
      const createdByName = `${req.user.firstName} ${req.user.lastName}`;
      const template = await storage.createWorkflowTemplate({
        ...validationResult.data,
        companyId,
        createdBy,
        createdByName
      });
      res.status(201).json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to create workflow template" });
    }
  });
  app2.patch("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const validationResult = insertWorkflowTemplateSchema.partial().safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const companyId = req.user.companyId;
      const template = await storage.updateWorkflowTemplate(req.params.id, validationResult.data, companyId);
      if (!template) {
        return res.status(404).json({ error: "Workflow template not found" });
      }
      res.json(template);
    } catch (error) {
      res.status(500).json({ error: "Failed to update workflow template" });
    }
  });
  app2.delete("/api/systems/workflow-templates/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      await storage.deleteWorkflowTemplate(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete workflow template" });
    }
  });
  app2.get("/api/projects/:projectId/workflows", requireAuth, async (req, res) => {
    try {
      const workflows = await storage.getProjectWorkflows(req.params.projectId);
      res.json(workflows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch project workflows" });
    }
  });
  app2.get("/api/project-workflows/:id", requireAuth, async (req, res) => {
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
  app2.post("/api/project-workflows", requireAuth, async (req, res) => {
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
  app2.patch("/api/project-workflows/:id", requireAuth, async (req, res) => {
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
  app2.delete("/api/project-workflows/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteProjectWorkflow(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete project workflow" });
    }
  });
  app2.get("/api/channels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const userId = req.user.id;
      const channels2 = await storage.getChannels(companyId, userId);
      res.json(channels2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });
  app2.get("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const channel = await storage.getChannel(req.params.id, companyId);
      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }
      res.json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channel" });
    }
  });
  app2.post("/api/channels", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const userId = req.user.id;
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
      await storage.addChannelMember({
        channelId: channel.id,
        userId,
        role: "owner"
      });
      res.status(201).json(channel);
    } catch (error) {
      res.status(500).json({ error: "Failed to create channel" });
    }
  });
  app2.patch("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
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
  app2.delete("/api/channels/:id", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      await storage.deleteChannel(req.params.id, companyId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });
  app2.post("/api/channels/dm", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const userId = req.user.id;
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
  app2.post("/api/channels/seed-sample", requireAuth, requireTeamMember, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const userId = req.user.id;
      const existingChannels = await storage.getChannels(companyId);
      const hasGeneral = existingChannels.some((c) => c.name === "general");
      const hasRandom = existingChannels.some((c) => c.name === "random");
      const hasProjectUpdates = existingChannels.some((c) => c.name === "project-updates");
      if (hasGeneral && hasRandom && hasProjectUpdates) {
        return res.status(409).json({ error: "Sample channels already exist" });
      }
      const createdChannels = [];
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
  app2.get("/api/channels/:channelId/members", requireAuth, async (req, res) => {
    try {
      const members = await storage.getChannelMembers(req.params.channelId);
      res.json(members);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch channel members" });
    }
  });
  app2.post("/api/channels/:channelId/members", requireAuth, async (req, res) => {
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
  app2.delete("/api/channels/:channelId/members/:userId", requireAuth, async (req, res) => {
    try {
      await storage.removeChannelMember(req.params.channelId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove channel member" });
    }
  });
  app2.post("/api/channels/:channelId/read", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      await storage.updateChannelMemberLastRead(req.params.channelId, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to update last read" });
    }
  });
  app2.get("/api/channels/unread/counts", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const companyId = req.user.companyId;
      const unreadCounts = await storage.getUnreadCounts(userId, companyId);
      res.json(unreadCounts);
    } catch (error) {
      console.error("Failed to get unread counts:", error);
      res.status(500).json({ error: "Failed to get unread counts" });
    }
  });
  app2.get("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    try {
      const { limit, before } = req.query;
      const messages2 = await storage.getMessages(
        req.params.channelId,
        limit ? parseInt(limit) : void 0,
        before
      );
      res.json(messages2);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });
  app2.get("/api/messages/recent", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const companyId = req.user.companyId;
      const channels2 = await storage.getUserChannels(userId, companyId);
      const allMessages = [];
      for (const channel of channels2) {
        const messages2 = await storage.getMessages(channel.id, 5);
        for (const msg of messages2) {
          const sender = await storage.getUserById(msg.userId);
          allMessages.push({
            ...msg,
            channelName: channel.name,
            senderName: sender ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() || sender.email : "Unknown"
          });
        }
      }
      const recentMessages = allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
      res.json(recentMessages);
    } catch (error) {
      console.error("Failed to get recent messages:", error);
      res.status(500).json({ error: "Failed to get recent messages" });
    }
  });
  app2.get("/api/messages/:id", requireAuth, async (req, res) => {
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
  app2.post("/api/channels/:channelId/messages", requireAuth, async (req, res) => {
    try {
      const userId = req.user.id;
      const validationResult = insertMessageSchema.omit({ channelId: true, userId: true }).safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: fromZodError(validationResult.error).toString()
        });
      }
      const content = validationResult.data.content;
      const mentionRegex = /@(\w+)/g;
      const mentions = [];
      let match;
      while ((match = mentionRegex.exec(content)) !== null) {
        mentions.push(match[1]);
      }
      const hasCommand = content.startsWith("/");
      const commandType = hasCommand ? content.split(" ")[0].substring(1) : void 0;
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
  app2.patch("/api/messages/:id", requireAuth, async (req, res) => {
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
  app2.delete("/api/messages/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteMessage(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });
  app2.post("/api/seed/task-management", requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = req.user.companyId;
      const existingTags = await storage.getTaskTags(companyId);
      const existingStatuses = await storage.getTaskTemplateStatuses(companyId);
      let tagsCreated = 0;
      let statusesCreated = 0;
      if (existingTags.length === 0) {
        const defaultTags = [
          { name: "System", color: "#3b82f6", displayOrder: 0 },
          { name: "Project Management", color: "#22c55e", displayOrder: 1 },
          { name: "Schedule", color: "#f97316", displayOrder: 2 }
        ];
        for (const tag of defaultTags) {
          await storage.createTaskTag({ ...tag, companyId, isActive: true });
          tagsCreated++;
        }
      }
      if (existingStatuses.length === 0) {
        const defaultStatuses = [
          { name: "Active", color: "#22c55e", displayOrder: 0 },
          { name: "Draft", color: "#6b7280", displayOrder: 1 },
          { name: "Archived", color: "#ef4444", displayOrder: 2 }
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
        statusesAlreadyExisted: existingStatuses.length
      });
    } catch (error) {
      console.error("Failed to seed task management data:", error);
      res.status(500).json({
        error: "Failed to seed task management data",
        details: error.message
      });
    }
  });
  const httpServer = createServer(app2);
  setupMessagingSocket(httpServer, sessionMiddleware);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-src 'self' blob:; object-src 'self' blob:;"
  );
  next();
});
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable must be set in production");
}
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
