import { 
  type User, type InsertUser, 
  type Note, type InsertNote,
  type Task, type InsertTask,
  type CustomFieldDef, type InsertCustomFieldDef,
  type CustomFieldOption, type InsertCustomFieldOption,
  type NoteTemplate, type InsertNoteTemplate,
  type NoteTemplateField, type InsertNoteTemplateField,
  type Project, type InsertProject,
  type TaskView, type InsertTaskView,
  type Estimate, type InsertEstimate,
  type EstimateItem, type InsertEstimateItem,
  type EstimateGroup, type InsertEstimateGroup,
  type EstimateNote, type InsertEstimateNote,
  type UserRole, type InsertUserRole,
  type Permission, type InsertPermission,
  type RolePermission, type InsertRolePermission,
  type UserProjectAccess, type InsertUserProjectAccess,
  type UserInvitation, type InsertUserInvitation,
  type UserWithRole, type PermissionAction, type UserCategory,
  type CompanySettings, type InsertCompanySettings,
  type SystemConfiguration, type InsertSystemConfiguration,
  type CostCategory, type InsertCostCategory,
  type CostCode, type InsertCostCode,
  type FieldCategory, type InsertFieldCategory,
  type FieldOption, type InsertFieldOption,
  type FieldCategoryWithOptions,
  type Selection, type InsertSelection,
  type SelectionOption, type InsertSelectionOption,
  type OptionAttachment, type InsertOptionAttachment,
  type ClientSelection, type InsertClientSelection,
  type SelectionWithOptions,
  type Supplier, type InsertSupplier,
  type Contact, type InsertContact,
  type Rfq, type InsertRfq,
  type RfqItem, type InsertRfqItem,
  type RfqQuote, type InsertRfqQuote,
  type RfqFollowUp, type InsertRfqFollowUp,
  type RfqPortalToken, type InsertRfqPortalToken,
  type Rfi, type InsertRfi,
  type RfiComment, type InsertRfiComment,
  type Bill, type InsertBill,
  type BillLineItem, type InsertBillLineItem,
  type BillApproval, type InsertBillApproval,
  type Variation, type InsertVariation,
  type VariationItem, type InsertVariationItem,
  type ClientInvoice, type InsertClientInvoice,
  type ClientInvoiceItem, type InsertClientInvoiceItem,
  type ClientInvoicePayment, type InsertClientInvoicePayment,
  type InvoiceEstimate, type InsertInvoiceEstimate,
  type InvoiceVariation, type InsertInvoiceVariation,
  type InvoiceBill, type InsertInvoiceBill,
  type SiteDiaryTemplate, type InsertSiteDiaryTemplate,
  type SiteDiaryEntry, type InsertSiteDiaryEntry,
  type ChecklistTemplate, type InsertChecklistTemplate,
  type ChecklistTemplateGroup, type InsertChecklistTemplateGroup,
  type ChecklistTemplateItem, type InsertChecklistTemplateItem,
  type ChecklistInstance, type InsertChecklistInstance,
  type ChecklistInstanceGroup, type InsertChecklistInstanceGroup,
  type ChecklistInstanceItem, type InsertChecklistInstanceItem,
  type ChecklistAuditLog, type InsertChecklistAuditLog,
  type ChecklistStatusTrigger, type InsertChecklistStatusTrigger,
  type Budget, type InsertBudget,
  type BudgetLineItem, type InsertBudgetLineItem,
  type LabourHoursBudget, type InsertLabourHoursBudget,
  type Schedule, type InsertSchedule,
  type ScheduleItem, type InsertScheduleItem,
  type ScheduleTemplate, type InsertScheduleTemplate,
  type EstimateTemplate, type InsertEstimateTemplate,
  type SelectionTemplate, type InsertSelectionTemplate,
  type ActivityNote, type InsertActivityNote,
  type CalendarView, type InsertCalendarView,
  type Proposal, type InsertProposal,
  type ProposalSection, type InsertProposalSection,
  type ProposalItem, type InsertProposalItem,
  type ProposalAcceptance, type InsertProposalAcceptance,
  type Minute, type InsertMinute,
  type SystemFolder, type InsertSystemFolder,
  type SystemDocument, type InsertSystemDocument,
  type TaskTemplate, type InsertTaskTemplate,
  type TaskTag, type InsertTaskTag,
  type TaskTemplateStatus, type InsertTaskTemplateStatus,
  type WorkflowTemplate, type InsertWorkflowTemplate,
  type ProjectWorkflow, type InsertProjectWorkflow,
  type Channel, type InsertChannel,
  type ChannelMember, type InsertChannelMember,
  type Message, type InsertMessage,
  type ScopeItem, type InsertScopeItem,
  type ScopeStage, type InsertScopeStage,
  type ScopeTemplate, type InsertScopeTemplate,
  type ScopeGearPhoto, type InsertScopeGearPhoto,
  type PurchaseOrder, type InsertPurchaseOrder,
  type PurchaseOrderItem, type InsertPurchaseOrderItem,
  type PurchaseOrderAttachment, type InsertPurchaseOrderAttachment,
  type PurchaseOrderSignature, type InsertPurchaseOrderSignature,
  type PurchaseOrderTemplate, type InsertPurchaseOrderTemplate,
  type FavoriteSupplier, type InsertFavoriteSupplier,
  type FavoriteCostCode, type InsertFavoriteCostCode,
  type RfqTemplate, type InsertRfqTemplate,
  type RfiTemplate, type InsertRfiTemplate,
  type TemplateCategory, type InsertTemplateCategory
} from "@shared/schema";
import { randomUUID } from "crypto";
import { PasswordUtils } from "./utils/auth";
import { generateRecurringTaskInstances, getRecurringTaskKey, generateNextRecurringInstance } from "./utils/recurringTasks";
import { db } from "./db";
import { eq, or, and, desc, asc, gte, lte, sql, inArray, isNull, gt, not } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Timesheet, InsertTimesheet, TimesheetCostCode, InsertTimesheetCostCode } from "@shared/schema";
import type { Defect, InsertDefect } from "@shared/schema";
import type { UserColumnPreferences, InsertUserColumnPreferences } from "@shared/schema";
import type { UserViewPreferences, InsertUserViewPreferences } from "@shared/schema";
import type { SupplierLabel, InsertSupplierLabel, SupplierLabelAssignment, InsertSupplierLabelAssignment } from "@shared/schema";
import type { SupplierInsurance, InsertSupplierInsurance, SupplierContact, InsertSupplierContact } from "@shared/schema";
import type { ContactInsurance, InsertContactInsurance } from "@shared/schema";
import { contactInsurances as contactInsurancesTable } from "@shared/schema";
import type { PriceListCategory, InsertPriceListCategory, PriceListItem, InsertPriceListItem, BillLineItemPriceLink, InsertBillLineItemPriceLink } from "@shared/schema";
import type { DashboardView, InsertDashboardView, DashboardViewPermission, InsertDashboardViewPermission, UserDashboardPreference } from "@shared/schema";
import type { NoteGroup, InsertNoteGroup } from "@shared/schema";
import type { Notification as InAppNotification, InsertNotification } from "@shared/schema";
import type { PaymentTermsOption, InsertPaymentTermsOption } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  validateUserCredentials(username: string, plainPassword: string): Promise<User | undefined>;
  getUserWithRole(id: string): Promise<UserWithRole | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: import("@shared/schema").UpsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  changeUserPassword(id: string, newPassword: string): Promise<User | undefined>;
  linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined>;
  updateUserLastLogin(userId: string): Promise<void>;
  getUsers(category?: UserCategory): Promise<UserWithRole[]>;
  getUsersByCompanyWithRoles(companyId: string, category?: UserCategory): Promise<UserWithRole[]>;

  // User column preferences
  getUserColumnPreferences(userId: string, pageKey: string): Promise<UserColumnPreferences | undefined>;
  saveUserColumnPreferences(preferences: InsertUserColumnPreferences): Promise<UserColumnPreferences>;

  // User view preferences
  getUserViewPreferences(userId: string, viewKey: string): Promise<UserViewPreferences | undefined>;
  saveUserViewPreferences(preferences: InsertUserViewPreferences): Promise<UserViewPreferences>;

  // User Role operations  
  getUserRoles(category?: UserCategory, companyId?: string): Promise<UserRole[]>;
  getUserRole(id: string, companyId?: string): Promise<UserRole | undefined>;
  createUserRole(role: InsertUserRole): Promise<UserRole>;
  updateUserRole(id: string, role: Partial<InsertUserRole>, companyId?: string): Promise<UserRole | undefined>;
  deleteUserRole(id: string, companyId?: string): Promise<boolean>;
  updateUserRolesOrder(updates: Array<{id: string, displayOrder: number}>, companyId?: string): Promise<void>;
  seedDefaultRolesForCompany(companyId: string): Promise<string>;

  // Permission operations
  getPermissions(category?: string): Promise<Permission[]>;
  getPermission(id: string): Promise<Permission | undefined>;
  createPermission(permission: InsertPermission): Promise<Permission>;
  updatePermission(id: string, permission: Partial<InsertPermission>): Promise<Permission | undefined>;
  deletePermission(id: string): Promise<boolean>;

  // Role Permission operations (permissions matrix)
  getRolePermissions(roleId: string): Promise<RolePermission[]>;
  createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission>;
  updateRolePermission(id: string, rolePermission: Partial<InsertRolePermission>): Promise<RolePermission | undefined>;
  deleteRolePermission(id: string): Promise<boolean>;
  setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[], viewScope?: string, viewableRoleIds?: string[] }[]): Promise<void>;
  getUserTimesheetViewScope(userId: string): Promise<{ viewScope: string; viewableRoleIds: string[] }>;
  checkUserPermission(userId: string, permissionKey: string, action: string): Promise<boolean>;

  // User Project Access operations
  getUserProjectAccess(userId: string): Promise<UserProjectAccess[]>;
  getProjectTeamMembers(projectId: string): Promise<UserWithRole[]>;
  createUserProjectAccess(access: InsertUserProjectAccess): Promise<UserProjectAccess>;
  updateUserProjectAccess(id: string, access: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined>;
  deleteUserProjectAccess(id: string): Promise<boolean>;
  revokeProjectAccess(userId: string, projectId: string): Promise<boolean>;
  grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess>;

  // User Invitation operations
  getUserInvitations(status?: string): Promise<UserInvitation[]>;
  getUserInvitationsByCompany(companyId: string, status?: string): Promise<UserInvitation[]>;
  getUserInvitation(id: string): Promise<UserInvitation | undefined>;
  getUserInvitationByToken(token: string): Promise<UserInvitation | undefined>;
  createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;
  updateUserInvitation(id: string, invitation: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined>;
  deleteUserInvitation(id: string): Promise<boolean>;
  acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined>;
  
  // Password Reset Token operations
  createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date; requestedBy?: string }): Promise<void>;
  
  // Notes CRUD operations
  getNotes(projectId?: string | null, companyId?: string, userId?: string, includeArchived?: boolean): Promise<Note[]>;
  getNote(id: string, companyId?: string): Promise<Note | undefined>;
  getPersonalNotesByUser(userId: string, companyId: string): Promise<Note[]>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, note: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: string): Promise<boolean>;
  archiveNote(id: string, userId: string): Promise<Note | undefined>;
  unarchiveNote(id: string): Promise<Note | undefined>;
  
  // Note Groups CRUD operations
  getNoteGroups(companyId: string, projectId?: string | null): Promise<NoteGroup[]>;
  getNoteGroup(id: string, companyId: string): Promise<NoteGroup | undefined>;
  createNoteGroup(group: InsertNoteGroup): Promise<NoteGroup>;
  updateNoteGroup(id: string, group: Partial<InsertNoteGroup>, companyId: string): Promise<NoteGroup | undefined>;
  deleteNoteGroup(id: string, companyId: string): Promise<boolean>;
  reorderNoteGroups(companyId: string, projectId: string | null, groupIds: string[]): Promise<NoteGroup[]>;

  // Tasks CRUD operations (specific to type="task")
  getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }): Promise<Task[]>;
  getTasksByUser(userId: string, companyId: string): Promise<Task[]>;
  getTasksByCompany(companyId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;
  updateTaskStatus(id: string, status: "todo" | "in-progress" | "done"): Promise<Task | undefined>;

  // Custom Field Definitions CRUD (max 4 active)
  getCustomFieldDefs(): Promise<CustomFieldDef[]>;
  getCustomFieldDef(id: string): Promise<CustomFieldDef | undefined>;
  createCustomFieldDef(fieldDef: InsertCustomFieldDef): Promise<CustomFieldDef>;
  updateCustomFieldDef(id: string, fieldDef: Partial<InsertCustomFieldDef>): Promise<CustomFieldDef | undefined>;
  deleteCustomFieldDef(id: string): Promise<boolean>;

  // Custom Field Options CRUD
  getCustomFieldOptions(fieldDefId: string): Promise<CustomFieldOption[]>;
  getCustomFieldOption(id: string): Promise<CustomFieldOption | undefined>;
  createCustomFieldOption(option: InsertCustomFieldOption): Promise<CustomFieldOption>;
  updateCustomFieldOption(id: string, option: Partial<InsertCustomFieldOption>): Promise<CustomFieldOption | undefined>;
  deleteCustomFieldOption(id: string): Promise<boolean>;

  // Note Templates CRUD
  getNoteTemplates(companyId: string): Promise<NoteTemplate[]>;
  getNoteTemplate(id: string, companyId: string): Promise<NoteTemplate | undefined>;
  getNoteTemplateWithFields(id: string, companyId: string): Promise<{ template: NoteTemplate; fields: NoteTemplateField[] } | undefined>;
  createNoteTemplate(template: InsertNoteTemplate): Promise<NoteTemplate>;
  updateNoteTemplate(id: string, template: Partial<InsertNoteTemplate>, companyId: string): Promise<NoteTemplate | undefined>;
  deleteNoteTemplate(id: string, companyId: string): Promise<boolean>;
  
  // Note Template Fields CRUD
  getNoteTemplateFields(templateId: string): Promise<NoteTemplateField[]>;
  createNoteTemplateField(field: InsertNoteTemplateField): Promise<NoteTemplateField>;
  updateNoteTemplateField(id: string, field: Partial<InsertNoteTemplateField>): Promise<NoteTemplateField | undefined>;
  deleteNoteTemplateField(id: string): Promise<boolean>;
  reorderNoteTemplateFields(templateId: string, fieldIds: string[]): Promise<NoteTemplateField[]>;

  // Projects CRUD
  getProjects(ownerId?: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Task Views CRUD
  getTaskViews(companyId: string, userId?: string): Promise<TaskView[]>;
  getTaskView(id: string, companyId: string): Promise<TaskView | undefined>;
  createTaskView(view: InsertTaskView, userId: string, companyId: string): Promise<TaskView>;
  updateTaskView(id: string, view: Partial<InsertTaskView>, companyId: string): Promise<TaskView | undefined>;
  deleteTaskView(id: string, companyId: string): Promise<boolean>;
  reorderTaskViews(viewIds: string[], companyId: string): Promise<void>;

  // Subtasks operations
  getSubtasks(parentTaskId: string): Promise<Task[]>;
  createSubtask(parentTaskId: string, subtask: InsertTask): Promise<Task>;

  // Estimates CRUD
  getEstimates(projectId?: string): Promise<Estimate[]>;
  getEstimate(id: string): Promise<Estimate | undefined>;
  createEstimate(estimate: InsertEstimate): Promise<Estimate>;
  updateEstimate(id: string, estimate: Partial<InsertEstimate>): Promise<Estimate | undefined>;
  deleteEstimate(id: string): Promise<boolean>;

  // Estimate Items CRUD
  getEstimateItems(estimateId: string): Promise<EstimateItem[]>;
  getEstimateItem(id: string): Promise<EstimateItem | undefined>;
  createEstimateItem(item: InsertEstimateItem): Promise<EstimateItem>;
  bulkCreateEstimateItems(items: InsertEstimateItem[]): Promise<EstimateItem[]>;
  updateEstimateItem(id: string, item: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined>;
  deleteEstimateItem(id: string): Promise<boolean>;
  getProjectAllowances(projectId: string): Promise<any[]>;
  
  // Security helpers for multi-level company scoping
  verifyEstimateItemsOwnership(itemIds: string[], companyId: string): Promise<{ authorized: boolean; invalidItemId?: string }>;

  // Estimate Groups CRUD
  getEstimateGroups(estimateId: string): Promise<EstimateGroup[]>;
  getEstimateGroup(id: string): Promise<EstimateGroup | undefined>;
  createEstimateGroup(group: InsertEstimateGroup): Promise<EstimateGroup>;
  updateEstimateGroup(id: string, group: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined>;
  deleteEstimateGroup(id: string): Promise<boolean>;
  duplicateEstimateGroup(id: string): Promise<EstimateGroup>;
  copyGroupToEstimate(groupId: string, targetEstimateId: string): Promise<EstimateGroup>;
  
  // Estimate Notes CRUD
  getEstimateNotes(estimateId: string): Promise<EstimateNote[]>;
  createEstimateNote(note: InsertEstimateNote): Promise<EstimateNote>;
  deleteEstimateNote(id: string): Promise<boolean>;
  
  // Estimate Items Duplication and Copying
  duplicateEstimateItem(id: string): Promise<EstimateItem>;
  copyItemToEstimate(itemId: string, targetEstimateId: string): Promise<EstimateItem>;

  // Cost Categories CRUD (company-specific)
  getCostCategories(companyId: string): Promise<CostCategory[]>;
  getCostCategory(id: string, companyId: string): Promise<CostCategory | undefined>;
  createCostCategory(category: InsertCostCategory): Promise<CostCategory>;
  updateCostCategory(id: string, category: Partial<InsertCostCategory>, companyId: string): Promise<CostCategory | undefined>;
  deleteCostCategory(id: string, companyId: string): Promise<boolean>;
  archiveCostCategory(id: string, companyId: string): Promise<CostCategory | undefined>;
  mergeCostCategories(sourceId: string, targetId: string, companyId: string): Promise<void>;

  // Payment Terms Options CRUD (company-specific)
  getPaymentTermsOptions(companyId: string): Promise<PaymentTermsOption[]>;
  getPaymentTermsOption(id: string, companyId: string): Promise<PaymentTermsOption | undefined>;
  createPaymentTermsOption(option: InsertPaymentTermsOption): Promise<PaymentTermsOption>;
  updatePaymentTermsOption(id: string, option: Partial<InsertPaymentTermsOption>, companyId: string): Promise<PaymentTermsOption | undefined>;
  deletePaymentTermsOption(id: string, companyId: string): Promise<boolean>;
  setPaymentTermsDefault(id: string, type: 'bill' | 'invoice', companyId: string): Promise<void>;

  // Cost Codes CRUD (company-specific)
  getCostCodes(companyId: string): Promise<CostCode[]>;
  getCostCode(id: string, companyId: string): Promise<CostCode | undefined>;
  createCostCode(costCode: InsertCostCode): Promise<CostCode>;
  updateCostCode(id: string, costCode: Partial<InsertCostCode>, companyId: string): Promise<CostCode | undefined>;
  deleteCostCode(id: string, companyId: string): Promise<boolean>;
  archiveCostCode(id: string, companyId: string): Promise<CostCode | undefined>;
  mergeCostCodes(sourceId: string, targetId: string, companyId: string): Promise<boolean>;

  // Task Tags CRUD (company-specific)
  getTaskTags(companyId: string): Promise<TaskTag[]>;
  getTaskTag(id: string, companyId: string): Promise<TaskTag | undefined>;
  createTaskTag(tag: InsertTaskTag): Promise<TaskTag>;
  updateTaskTag(id: string, tag: Partial<InsertTaskTag>, companyId: string): Promise<TaskTag | undefined>;
  deleteTaskTag(id: string, companyId: string): Promise<boolean>;
  updateTaskTagsOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void>;

  // Task Template Statuses CRUD (company-specific)
  getTaskTemplateStatuses(companyId: string): Promise<TaskTemplateStatus[]>;
  getTaskTemplateStatus(id: string, companyId: string): Promise<TaskTemplateStatus | undefined>;
  createTaskTemplateStatus(status: InsertTaskTemplateStatus): Promise<TaskTemplateStatus>;
  updateTaskTemplateStatus(id: string, status: Partial<InsertTaskTemplateStatus>, companyId: string): Promise<TaskTemplateStatus | undefined>;
  deleteTaskTemplateStatus(id: string, companyId: string): Promise<boolean>;
  updateTaskTemplateStatusesOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void>;

  // Versioning and Locking
  createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate>;
  lockEstimate(estimateId: string): Promise<Estimate | undefined>;
  unlockEstimate(estimateId: string): Promise<Estimate | undefined>;
  
  // Summary calculations
  getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    builderCostTotal: number;
    markupAmount: number;
    subtotalWithMarkup: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }>;

  // Scope Items CRUD (the DNA of every job)
  getScopeItems(projectId: string): Promise<ScopeItem[]>;
  getScopeItem(id: string): Promise<ScopeItem | undefined>;
  createScopeItem(item: InsertScopeItem): Promise<ScopeItem>;
  bulkCreateScopeItems(items: InsertScopeItem[]): Promise<ScopeItem[]>;
  updateScopeItem(id: string, item: Partial<InsertScopeItem>): Promise<ScopeItem | undefined>;
  deleteScopeItem(id: string): Promise<boolean>;
  reorderScopeItems(updates: Array<{id: string, displayOrder: number, parentId?: string | null}>): Promise<void>;
  
  // Scope Stages CRUD (editable stage categories)
  getScopeStages(projectId: string): Promise<ScopeStage[]>;
  getScopeStage(id: string): Promise<ScopeStage | undefined>;
  createScopeStage(stage: InsertScopeStage): Promise<ScopeStage>;
  updateScopeStage(id: string, stage: Partial<InsertScopeStage>): Promise<ScopeStage | undefined>;
  deleteScopeStage(id: string): Promise<boolean>;
  reorderScopeStages(updates: Array<{id: string, displayOrder: number, parentId?: string | null}>): Promise<void>;
  initializeDefaultStages(projectId: string, companyId: string): Promise<ScopeStage[]>;
  
  // Scope Templates CRUD
  getScopeTemplates(companyId: string): Promise<ScopeTemplate[]>;
  getScopeTemplate(id: string, companyId: string): Promise<ScopeTemplate | undefined>;
  createScopeTemplate(template: InsertScopeTemplate): Promise<ScopeTemplate>;
  updateScopeTemplate(id: string, template: Partial<InsertScopeTemplate>, companyId: string): Promise<ScopeTemplate | undefined>;
  deleteScopeTemplate(id: string, companyId: string): Promise<boolean>;
  applyScopeTemplate(templateId: string, projectId: string): Promise<ScopeItem[]>;
  addItemToScopeTemplate(templateId: string, scopeItem: any, companyId: string): Promise<ScopeTemplate | undefined>;
  
  // Scope Gear Photos CRUD
  getScopeGearPhotos(scopeItemId: string): Promise<ScopeGearPhoto[]>;
  createScopeGearPhoto(photo: InsertScopeGearPhoto): Promise<ScopeGearPhoto>;
  deleteScopeGearPhoto(id: string): Promise<boolean>;
  
  // Scope Integration Helpers
  pushScopeToEstimate(scopeItemIds: string[], estimateId: string): Promise<EstimateItem[]>;
  createRfqFromScope(scopeItemIds: string[], projectId: string): Promise<import("@shared/schema").Rfq>;
  createPoFromScope(scopeItemIds: string[], projectId: string): Promise<import("@shared/schema").PurchaseOrder>;
  linkScopeToScheduleItem(scopeItemId: string, scheduleItemId: string): Promise<ScopeItem | undefined>;

  // Company CRUD
  getCompany(id: string): Promise<import("@shared/schema").Company | undefined>;
  createCompany(company: import("@shared/schema").InsertCompany, ownerId: string): Promise<import("@shared/schema").Company>;
  updateCompany(id: string, company: Partial<import("@shared/schema").InsertCompany>): Promise<import("@shared/schema").Company | undefined>;
  
  // Company Settings
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined>;

  // System Configuration
  getSystemConfiguration(): Promise<SystemConfiguration | undefined>;
  updateSystemConfiguration(config: Partial<InsertSystemConfiguration>): Promise<SystemConfiguration | undefined>;

  // Field Categories CRUD (Buildern-style)
  getFieldCategories(): Promise<FieldCategory[]>;
  getFieldCategory(id: string): Promise<FieldCategory | undefined>;
  getFieldCategoryByKey(key: string): Promise<FieldCategory | undefined>;
  getFieldCategoryWithOptions(key: string): Promise<FieldCategoryWithOptions | undefined>;
  seedMissingBuiltInCategories(): Promise<{ addedCategories: string[]; addedOptions: string[] }>;
  createFieldCategory(category: InsertFieldCategory): Promise<FieldCategory>;
  updateFieldCategory(id: string, category: Partial<InsertFieldCategory>): Promise<FieldCategory | undefined>;
  deleteFieldCategory(id: string): Promise<boolean>;

  // Field Options CRUD
  getFieldOptions(categoryId: string): Promise<FieldOption[]>;
  getFieldOption(id: string): Promise<FieldOption | undefined>;
  createFieldOption(option: InsertFieldOption): Promise<FieldOption>;
  updateFieldOption(id: string, option: Partial<InsertFieldOption>): Promise<FieldOption | undefined>;
  deleteFieldOption(id: string): Promise<boolean>;
  setCategoryOptions(categoryId: string, options: Array<Partial<FieldOption> & { key: string; name: string }>): Promise<FieldOption[]>;

  // Selections CRUD
  getSelections(projectId: string): Promise<Selection[]>;
  getSelection(id: string): Promise<Selection | undefined>;
  getSelectionWithOptions(id: string): Promise<SelectionWithOptions | undefined>;
  createSelection(selection: InsertSelection): Promise<Selection>;
  updateSelection(id: string, selection: Partial<InsertSelection>): Promise<Selection | undefined>;
  deleteSelection(id: string): Promise<boolean>;

  // Selection Options CRUD
  getSelectionOptions(selectionId: string): Promise<SelectionOption[]>;
  getSelectionOption(id: string): Promise<SelectionOption | undefined>;
  createSelectionOption(option: InsertSelectionOption): Promise<SelectionOption>;
  updateSelectionOption(id: string, option: Partial<InsertSelectionOption>): Promise<SelectionOption | undefined>;
  deleteSelectionOption(id: string): Promise<boolean>;

  // Option Attachments CRUD
  getOptionAttachments(optionId: string): Promise<OptionAttachment[]>;
  createOptionAttachment(attachment: InsertOptionAttachment): Promise<OptionAttachment>;
  deleteOptionAttachment(id: string): Promise<boolean>;

  // Client Selections CRUD  
  getClientSelections(projectId: string): Promise<ClientSelection[]>;
  createClientSelection(selection: InsertClientSelection): Promise<ClientSelection>;
  deleteClientSelection(id: string): Promise<boolean>;

  // Suppliers CRUD
  getSuppliers(companyId: string, supplierType?: "supplier" | "trade"): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | null>;
  createSupplier(supplier: InsertSupplier & { companyId: string }): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  // Supplier Labels CRUD
  getSupplierLabels(companyId: string): Promise<SupplierLabel[]>;
  createSupplierLabel(label: InsertSupplierLabel & { companyId: string }): Promise<SupplierLabel>;
  updateSupplierLabel(id: string, label: Partial<InsertSupplierLabel>): Promise<SupplierLabel>;
  deleteSupplierLabel(id: string): Promise<void>;
  getSupplierLabelAssignments(supplierId: string): Promise<SupplierLabelAssignment[]>;
  setSupplierLabels(supplierId: string, labelIds: string[]): Promise<void>;

  // Supplier Insurances CRUD
  getSupplierInsurances(supplierId: string): Promise<SupplierInsurance[]>;
  createSupplierInsurance(insurance: InsertSupplierInsurance): Promise<SupplierInsurance>;
  updateSupplierInsurance(id: string, insurance: Partial<InsertSupplierInsurance>): Promise<SupplierInsurance>;
  deleteSupplierInsurance(id: string): Promise<void>;
  getExpiringInsurances(companyId: string, daysAhead: number): Promise<(SupplierInsurance & { supplier: Supplier })[]>;

  // Contact Insurances CRUD (for contacts with contactType='supplier')
  getContactInsurances(contactId: string): Promise<ContactInsurance[]>;
  createContactInsurance(insurance: InsertContactInsurance): Promise<ContactInsurance>;
  updateContactInsurance(id: string, insurance: Partial<InsertContactInsurance>): Promise<ContactInsurance>;
  deleteContactInsurance(id: string): Promise<void>;
  getExpiringContactInsurances(companyId: string, daysAhead: number): Promise<(ContactInsurance & { contact: Contact })[]>;

  // Supplier Contacts CRUD
  getSupplierContacts(supplierId: string): Promise<SupplierContact[]>;
  createSupplierContact(contact: InsertSupplierContact): Promise<SupplierContact>;
  updateSupplierContact(id: string, contact: Partial<InsertSupplierContact>): Promise<SupplierContact>;
  deleteSupplierContact(id: string): Promise<void>;

  // Contacts CRUD
  getContacts(contactType?: "team" | "supplier" | "client"): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  archiveContact(id: string): Promise<Contact | undefined>;
  restoreContact(id: string): Promise<Contact | undefined>;
  deleteArchivedContactsOlderThan(date: Date): Promise<number>;
  deleteContact(id: string, companyId: string): Promise<void>;
  mergeContacts(sourceId: string, targetId: string, companyId: string): Promise<{ success: boolean; transferredCounts: Record<string, number> }>;

  // RFQ (Request for Quote) CRUD
  getRFQs(companyId: string, projectId?: string): Promise<Rfq[]>;
  getRFQ(id: string): Promise<Rfq | undefined>;
  createRFQ(rfq: InsertRfq): Promise<Rfq>;
  updateRFQ(id: string, rfq: Partial<InsertRfq>): Promise<Rfq | undefined>;
  deleteRFQ(id: string): Promise<boolean>;

  // RFQ Items CRUD
  getRFQItems(rfqId: string): Promise<RfqItem[]>;
  createRFQItem(item: InsertRfqItem): Promise<RfqItem>;
  updateRFQItem(id: string, item: Partial<InsertRfqItem>): Promise<RfqItem | undefined>;
  deleteRFQItem(id: string): Promise<boolean>;

  // RFQ Quotes CRUD
  getRFQQuotes(rfqId: string): Promise<RfqQuote[]>;
  getRFQQuote(id: string): Promise<RfqQuote | undefined>;
  createRFQQuote(quote: InsertRfqQuote): Promise<RfqQuote>;
  updateRFQQuote(id: string, quote: Partial<InsertRfqQuote>): Promise<RfqQuote | undefined>;
  deleteRFQQuote(id: string): Promise<boolean>;

  // RFQ Follow-ups CRUD
  getRFQFollowUps(rfqId: string): Promise<RfqFollowUp[]>;
  createRFQFollowUp(followUp: InsertRfqFollowUp): Promise<RfqFollowUp>;
  updateRFQFollowUp(id: string, followUp: Partial<InsertRfqFollowUp>): Promise<RfqFollowUp>;
  deleteRFQFollowUp(id: string): Promise<boolean>;

  // RFQ Portal Tokens CRUD
  getRFQPortalTokens(rfqId: string): Promise<RfqPortalToken[]>;
  getRFQPortalTokenByToken(token: string): Promise<RfqPortalToken | undefined>;
  createRFQPortalToken(portalToken: InsertRfqPortalToken): Promise<RfqPortalToken>;
  updateRFQPortalToken(id: string, portalToken: Partial<InsertRfqPortalToken>): Promise<RfqPortalToken | undefined>;
  deleteRFQPortalToken(id: string): Promise<boolean>;

  // RFI (Request for Information) CRUD
  getRFIs(companyId: string, projectId?: string): Promise<Rfi[]>;
  getRFI(id: string): Promise<Rfi | undefined>;
  createRFI(rfi: InsertRfi, companyId: string, userId: string, userName: string): Promise<Rfi>;
  updateRFI(id: string, rfi: Partial<InsertRfi>): Promise<Rfi | undefined>;
  deleteRFI(id: string): Promise<boolean>;
  getNextRFINumber(companyId: string, projectId: string): Promise<string>;

  // RFI Comments CRUD
  getRFIComments(rfiId: string): Promise<RfiComment[]>;
  createRFIComment(comment: InsertRfiComment): Promise<RfiComment>;
  updateRFIComment(id: string, comment: Partial<InsertRfiComment>): Promise<RfiComment | undefined>;
  deleteRFIComment(id: string): Promise<boolean>;

  // Bills CRUD
  getBills(projectId?: string, status?: string): Promise<Bill[]>;
  getBillById(id: string): Promise<Bill | null>;
  getNextBillNumber(): Promise<string>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: string, bill: Partial<InsertBill>): Promise<Bill>;
  deleteBill(id: string): Promise<void>;
  
  // Bill Line Items CRUD
  getBillLineItems(billId: string): Promise<BillLineItem[]>;
  getUnlinkedBillLineItems(companyId: string): Promise<any[]>;
  createBillLineItem(item: InsertBillLineItem): Promise<BillLineItem>;
  updateBillLineItem(id: string, item: Partial<InsertBillLineItem>): Promise<BillLineItem>;
  deleteBillLineItem(id: string): Promise<void>;

  // Bill Line Item Allowances
  getBillLineItemAllowances(billLineItemId: string): Promise<BillLineItemAllowance[]>;
  getBillLineItemAllowancesByBillId(billId: string): Promise<BillLineItemAllowance[]>;
  createBillLineItemAllowance(allowance: InsertBillLineItemAllowance): Promise<BillLineItemAllowance>;
  updateBillLineItemAllowance(id: string, allowance: Partial<InsertBillLineItemAllowance>): Promise<BillLineItemAllowance | undefined>;
  deleteBillLineItemAllowance(id: string): Promise<void>;
  deleteBillLineItemAllowancesByLineItemId(billLineItemId: string): Promise<void>;

  // Timesheet Allowances
  getTimesheetAllowances(timesheetId: string): Promise<TimesheetAllowance[]>;
  getTimesheetAllowancesByProject(projectId: string): Promise<TimesheetAllowance[]>;
  createTimesheetAllowance(allowance: InsertTimesheetAllowance): Promise<TimesheetAllowance>;
  updateTimesheetAllowance(id: string, allowance: Partial<InsertTimesheetAllowance>): Promise<TimesheetAllowance | undefined>;
  deleteTimesheetAllowance(id: string): Promise<void>;
  deleteTimesheetAllowancesByTimesheetId(timesheetId: string): Promise<void>;

  // Allowance Items (custom lines for PS allowances)
  getAllowanceItems(estimateItemId: string): Promise<AllowanceItem[]>;
  createAllowanceItem(item: InsertAllowanceItem): Promise<AllowanceItem>;
  updateAllowanceItem(id: string, item: Partial<InsertAllowanceItem>): Promise<AllowanceItem | undefined>;
  deleteAllowanceItem(id: string): Promise<void>;
  deleteAllowanceItemsByEstimateItemId(estimateItemId: string): Promise<void>;

  // Bill Approvals
  getBillApprovals(billId: string): Promise<BillApproval[]>;
  createBillApproval(approval: InsertBillApproval): Promise<BillApproval>;
  canUserApproveBills(userId: string): Promise<boolean>;
  canUserApproveTimesheets(userId: string): Promise<boolean>;

  // Variations CRUD
  getVariations(projectId?: string, status?: string): Promise<Variation[]>;
  getVariation(id: string): Promise<Variation | undefined>;
  createVariation(variation: InsertVariation): Promise<Variation>;
  updateVariation(id: string, variation: Partial<InsertVariation>): Promise<Variation | undefined>;
  deleteVariation(id: string): Promise<boolean>;

  // Variation Items CRUD
  getVariationItems(variationId: string): Promise<VariationItem[]>;
  createVariationItem(item: InsertVariationItem): Promise<VariationItem>;
  updateVariationItem(id: string, item: Partial<InsertVariationItem>): Promise<VariationItem | undefined>;
  deleteVariationItem(id: string): Promise<boolean>;

  // Client Invoices CRUD
  getClientInvoices(projectId?: string, status?: string): Promise<ClientInvoice[]>;
  getClientInvoice(id: string): Promise<ClientInvoice | undefined>;
  createClientInvoice(invoice: InsertClientInvoice): Promise<ClientInvoice>;
  updateClientInvoice(id: string, invoice: Partial<InsertClientInvoice>): Promise<ClientInvoice | undefined>;
  deleteClientInvoice(id: string): Promise<boolean>;

  // Client Invoice Items CRUD
  getClientInvoiceItems(invoiceId: string): Promise<ClientInvoiceItem[]>;
  createClientInvoiceItem(item: InsertClientInvoiceItem): Promise<ClientInvoiceItem>;
  updateClientInvoiceItem(id: string, item: Partial<InsertClientInvoiceItem>): Promise<ClientInvoiceItem | undefined>;
  deleteClientInvoiceItem(id: string): Promise<boolean>;

  // Client Invoice Payments CRUD
  getClientInvoicePayments(invoiceId: string): Promise<ClientInvoicePayment[]>;
  createClientInvoicePayment(payment: InsertClientInvoicePayment): Promise<ClientInvoicePayment>;
  deleteClientInvoicePayment(id: string): Promise<boolean>;

  // Invoice-Estimate Junction Table
  getInvoiceEstimates(invoiceId: string): Promise<InvoiceEstimate[]>;
  createInvoiceEstimate(data: InsertInvoiceEstimate): Promise<InvoiceEstimate>;
  deleteInvoiceEstimate(id: string): Promise<boolean>;

  // Invoice-Variation Junction Table
  getInvoiceVariations(invoiceId: string): Promise<InvoiceVariation[]>;
  createInvoiceVariation(data: InsertInvoiceVariation): Promise<InvoiceVariation>;
  deleteInvoiceVariation(id: string): Promise<boolean>;

  // Invoice-Bill Junction Table
  getInvoiceBills(invoiceId: string): Promise<InvoiceBill[]>;
  createInvoiceBill(data: InsertInvoiceBill): Promise<InvoiceBill>;
  deleteInvoiceBill(id: string): Promise<boolean>;

  // Proposals CRUD
  getProposals(projectId?: string, status?: string): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  updateProposal(id: string, proposal: Partial<InsertProposal>): Promise<Proposal | undefined>;
  deleteProposal(id: string): Promise<boolean>;

  // Proposal Sections CRUD
  getProposalSections(proposalId: string): Promise<ProposalSection[]>;
  createProposalSection(section: InsertProposalSection): Promise<ProposalSection>;
  updateProposalSection(id: string, section: Partial<InsertProposalSection>): Promise<ProposalSection | undefined>;
  deleteProposalSection(id: string): Promise<boolean>;

  // Proposal Items CRUD
  getProposalItems(proposalId: string): Promise<ProposalItem[]>;
  createProposalItem(item: InsertProposalItem): Promise<ProposalItem>;
  updateProposalItem(id: string, item: Partial<InsertProposalItem>): Promise<ProposalItem | undefined>;
  deleteProposalItem(id: string): Promise<boolean>;

  // Proposal Acceptances CRUD
  getProposalAcceptances(proposalId: string): Promise<ProposalAcceptance[]>;
  createProposalAcceptance(acceptance: InsertProposalAcceptance): Promise<ProposalAcceptance>;
  getLatestProposalAcceptance(proposalId: string): Promise<ProposalAcceptance | undefined>;

  // Activity Feed CRUD
  getActivities(options: { projectId?: string; userId?: string; companyId?: string; limit?: number }): Promise<schema.Activity[]>;
  createActivity(activity: schema.InsertActivity): Promise<schema.Activity>;
  updateActivity(id: string, activity: Partial<schema.InsertActivity & { pinned?: boolean; pinnedAt?: Date; pinnedBy?: string }>): Promise<schema.Activity | undefined>;

  // Site Diary Templates CRUD (company-wide)
  getSiteDiaryTemplates(): Promise<schema.SiteDiaryTemplate[]>;
  getSiteDiaryTemplate(id: string): Promise<schema.SiteDiaryTemplate | undefined>;
  getDefaultSiteDiaryTemplate(companyId: string): Promise<schema.SiteDiaryTemplate | undefined>;
  setDefaultSiteDiaryTemplate(id: string, companyId: string): Promise<schema.SiteDiaryTemplate | undefined>;
  createSiteDiaryTemplate(template: schema.InsertSiteDiaryTemplate): Promise<schema.SiteDiaryTemplate>;
  updateSiteDiaryTemplate(id: string, template: Partial<schema.InsertSiteDiaryTemplate>): Promise<schema.SiteDiaryTemplate | undefined>;
  deleteSiteDiaryTemplate(id: string): Promise<boolean>;

  // Site Diary Entries CRUD (project-specific)
  getSiteDiaryEntries(projectId: string): Promise<schema.SiteDiaryEntry[]>;
  getSiteDiaryEntriesByCompany(companyId: string, date?: string): Promise<schema.SiteDiaryEntry[]>;
  getSiteDiaryEntryCountsByMonth(companyId: string, year: number, month: number): Promise<Record<string, number>>;
  getSiteDiaryEntry(id: string): Promise<schema.SiteDiaryEntry | undefined>;
  createSiteDiaryEntry(entry: schema.InsertSiteDiaryEntry): Promise<schema.SiteDiaryEntry>;
  updateSiteDiaryEntry(id: string, entry: Partial<schema.InsertSiteDiaryEntry>): Promise<schema.SiteDiaryEntry | undefined>;
  deleteSiteDiaryEntry(id: string): Promise<boolean>;

  // Checklist Templates CRUD
  getChecklistTemplates(): Promise<ChecklistTemplate[]>;
  getChecklistTemplate(id: string): Promise<ChecklistTemplate | undefined>;
  createChecklistTemplate(template: InsertChecklistTemplate): Promise<ChecklistTemplate>;
  updateChecklistTemplate(id: string, template: Partial<InsertChecklistTemplate>): Promise<ChecklistTemplate | undefined>;
  deleteChecklistTemplate(id: string): Promise<boolean>;
  hardDeleteChecklistTemplate(id: string): Promise<boolean>;

  // Checklist Template Groups CRUD
  getChecklistTemplateGroups(templateId: string): Promise<ChecklistTemplateGroup[]>;
  getChecklistTemplateGroup(id: string): Promise<ChecklistTemplateGroup | undefined>;
  createChecklistTemplateGroup(group: InsertChecklistTemplateGroup): Promise<ChecklistTemplateGroup>;
  updateChecklistTemplateGroup(id: string, group: Partial<InsertChecklistTemplateGroup>): Promise<ChecklistTemplateGroup | undefined>;
  deleteChecklistTemplateGroup(id: string): Promise<boolean>;

  // Checklist Template Items CRUD
  getChecklistTemplateItems(groupId: string): Promise<ChecklistTemplateItem[]>;
  getChecklistTemplateItem(id: string): Promise<ChecklistTemplateItem | undefined>;
  createChecklistTemplateItem(item: InsertChecklistTemplateItem): Promise<ChecklistTemplateItem>;
  updateChecklistTemplateItem(id: string, item: Partial<InsertChecklistTemplateItem>): Promise<ChecklistTemplateItem | undefined>;
  deleteChecklistTemplateItem(id: string): Promise<boolean>;

  // Checklist Instances CRUD (these are "Checklist Groups" in user terminology)
  getChecklistInstances(projectId?: string): Promise<ChecklistInstance[]>;
  getChecklistInstance(id: string): Promise<ChecklistInstance | undefined>;
  createChecklistInstance(instance: InsertChecklistInstance): Promise<ChecklistInstance>;
  updateChecklistInstance(id: string, instance: Partial<InsertChecklistInstance>): Promise<ChecklistInstance | undefined>;
  deleteChecklistInstance(id: string): Promise<boolean>;

  // Checklist Instance Groups CRUD (these are "Checklists" in user terminology)
  getChecklistInstanceGroups(instanceId: string): Promise<ChecklistInstanceGroup[]>;
  getChecklistInstanceGroup(id: string): Promise<ChecklistInstanceGroup | undefined>;
  createChecklistInstanceGroup(group: InsertChecklistInstanceGroup): Promise<ChecklistInstanceGroup>;
  updateChecklistInstanceGroup(id: string, group: Partial<InsertChecklistInstanceGroup>): Promise<ChecklistInstanceGroup | undefined>;
  deleteChecklistInstanceGroup(id: string): Promise<boolean>;

  // Checklist Instance Items CRUD
  getChecklistInstanceItems(instanceId: string): Promise<ChecklistInstanceItem[]>;
  getChecklistInstanceItemsByGroup(groupId: string): Promise<ChecklistInstanceItem[]>;
  getChecklistInstanceItem(id: string): Promise<ChecklistInstanceItem | undefined>;
  createChecklistInstanceItem(item: InsertChecklistInstanceItem): Promise<ChecklistInstanceItem>;
  updateChecklistInstanceItem(id: string, item: Partial<InsertChecklistInstanceItem>): Promise<ChecklistInstanceItem | undefined>;
  deleteChecklistInstanceItem(id: string): Promise<boolean>;

  // Checklist Audit Log
  createChecklistAuditEntry(entry: InsertChecklistAuditLog): Promise<ChecklistAuditLog>;
  getChecklistAuditLog(instanceId: string): Promise<ChecklistAuditLog[]>;

  // Checklist Status Triggers
  getChecklistStatusTriggers(companyId: string): Promise<ChecklistStatusTrigger[]>;
  createChecklistStatusTrigger(trigger: InsertChecklistStatusTrigger): Promise<ChecklistStatusTrigger>;
  updateChecklistStatusTrigger(id: string, trigger: Partial<InsertChecklistStatusTrigger>): Promise<ChecklistStatusTrigger | undefined>;
  deleteChecklistStatusTrigger(id: string): Promise<boolean>;

  // Budget CRUD
  getBudget(projectId: string): Promise<Budget | undefined>;
  createBudget(budget: InsertBudget): Promise<Budget>;
  updateBudget(id: string, budget: Partial<InsertBudget>): Promise<Budget | undefined>;
  deleteBudget(id: string): Promise<boolean>;
  calculateBudget(projectId: string): Promise<Budget | undefined>; // Recalculates from estimates, bills, variations

  // Budget Line Items CRUD
  getBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]>;
  getBudgetLineItem(id: string): Promise<BudgetLineItem | undefined>;
  createBudgetLineItem(item: InsertBudgetLineItem): Promise<BudgetLineItem>;
  updateBudgetLineItem(id: string, item: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem | undefined>;
  deleteBudgetLineItem(id: string): Promise<boolean>;
  recalculateBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]>; // Recalculates all line items

  // Labour Hours Budget CRUD
  getLabourHoursBudget(projectId: string): Promise<LabourHoursBudget[]>;
  recalculateLabourHoursBudget(projectId: string): Promise<LabourHoursBudget[]>; // Recalculates from flagged estimate items

  // Timesheets CRUD
  getTimesheets(projectId?: string, filters?: { userId?: string; startDate?: Date; endDate?: Date; status?: string; costCodeId?: string; invoiced?: boolean }): Promise<Timesheet[]>;
  getTimesheet(id: string): Promise<Timesheet | undefined>;
  createTimesheet(timesheet: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: string, timesheet: Partial<InsertTimesheet>): Promise<Timesheet | undefined>;
  deleteTimesheet(id: string): Promise<boolean>;
  approveTimesheet(id: string): Promise<Timesheet | undefined>; // Changes status from submitted to approved
  rejectTimesheet(id: string): Promise<Timesheet | undefined>; // Changes status from submitted to rejected
  getAllActiveTimesheets(): Promise<Timesheet[]>;

  // Timesheet Cost Codes (for split timesheets)
  getTimesheetCostCodes(timesheetId: string): Promise<TimesheetCostCode[]>;
  createTimesheetCostCode(costCode: InsertTimesheetCostCode): Promise<TimesheetCostCode>;
  updateTimesheetCostCode(id: string, costCode: Partial<InsertTimesheetCostCode>): Promise<TimesheetCostCode | undefined>;
  deleteTimesheetCostCode(id: string): Promise<boolean>;

  // Schedule CRUD
  getSchedule(projectId: string): Promise<Schedule | undefined>;
  getScheduleById(id: string): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;
  updateScheduleStatus(id: string, status: "offline" | "online" | "locked", userId?: string): Promise<Schedule | undefined>;

  // Schedule Items CRUD
  getScheduleItems(scheduleId: string): Promise<ScheduleItem[]>;
  getScheduleItemsByProject(projectId: string, pagination?: { limit?: number; offset?: number }): Promise<ScheduleItem[]>;
  getAllScheduleItems(companyId: string, dateRange?: { startDate?: string; endDate?: string }): Promise<ScheduleItem[]>;
  getScheduleItem(id: string): Promise<ScheduleItem | undefined>;
  createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem>;
  updateScheduleItem(id: string, item: Partial<InsertScheduleItem>): Promise<ScheduleItem | undefined>;
  deleteScheduleItem(id: string): Promise<boolean>;
  bulkUpdateScheduleItems(items: { id: string; updates: Partial<InsertScheduleItem> }[]): Promise<ScheduleItem[]>;

  // Schedule Templates CRUD
  getScheduleTemplates(companyId: string, category?: string): Promise<ScheduleTemplate[]>;
  getScheduleTemplate(id: string, companyId: string): Promise<ScheduleTemplate | undefined>;
  createScheduleTemplate(template: InsertScheduleTemplate): Promise<ScheduleTemplate>;
  updateScheduleTemplate(id: string, template: Partial<InsertScheduleTemplate>, companyId: string): Promise<ScheduleTemplate | undefined>;
  deleteScheduleTemplate(id: string, companyId: string): Promise<boolean>;

  // Estimate Templates CRUD
  getEstimateTemplates(companyId: string, category?: string): Promise<EstimateTemplate[]>;
  getEstimateTemplate(id: string, companyId: string): Promise<EstimateTemplate | undefined>;
  createEstimateTemplate(template: InsertEstimateTemplate): Promise<EstimateTemplate>;
  updateEstimateTemplate(id: string, template: Partial<InsertEstimateTemplate>, companyId: string): Promise<EstimateTemplate | undefined>;
  deleteEstimateTemplate(id: string, companyId: string): Promise<boolean>;

  // Selection Templates CRUD
  getSelectionTemplates(companyId: string, category?: string): Promise<SelectionTemplate[]>;
  getSelectionTemplate(id: string, companyId: string): Promise<SelectionTemplate | undefined>;
  createSelectionTemplate(template: InsertSelectionTemplate): Promise<SelectionTemplate>;
  updateSelectionTemplate(id: string, template: Partial<InsertSelectionTemplate>, companyId: string): Promise<SelectionTemplate | undefined>;
  deleteSelectionTemplate(id: string, companyId: string): Promise<boolean>;

  // RFQ Templates CRUD
  getRfqTemplates(companyId: string, category?: string): Promise<RfqTemplate[]>;
  getRfqTemplate(id: string, companyId: string): Promise<RfqTemplate | undefined>;
  createRfqTemplate(template: InsertRfqTemplate & { companyId: string }): Promise<RfqTemplate>;
  updateRfqTemplate(id: string, template: Partial<InsertRfqTemplate>, companyId: string): Promise<RfqTemplate | undefined>;
  deleteRfqTemplate(id: string, companyId: string): Promise<boolean>;

  // RFI Templates CRUD
  getRfiTemplates(companyId: string, category?: string): Promise<RfiTemplate[]>;
  getRfiTemplate(id: string, companyId: string): Promise<RfiTemplate | undefined>;
  createRfiTemplate(template: InsertRfiTemplate & { companyId: string }): Promise<RfiTemplate>;
  updateRfiTemplate(id: string, template: Partial<InsertRfiTemplate>, companyId: string): Promise<RfiTemplate | undefined>;
  deleteRfiTemplate(id: string, companyId: string): Promise<boolean>;

  // Template Categories CRUD (hierarchical categories for organizing templates)
  getTemplateCategories(companyId: string, templateType?: string): Promise<TemplateCategory[]>;
  getTemplateCategory(id: string, companyId: string): Promise<TemplateCategory | undefined>;
  createTemplateCategory(category: InsertTemplateCategory & { companyId: string }): Promise<TemplateCategory>;
  updateTemplateCategory(id: string, category: Partial<InsertTemplateCategory>, companyId: string): Promise<TemplateCategory | undefined>;
  deleteTemplateCategory(id: string, companyId: string): Promise<boolean>;

  // Calendar Views CRUD
  getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]>;
  getCalendarView(id: string, companyId: string): Promise<CalendarView | undefined>;
  createCalendarView(view: InsertCalendarView): Promise<CalendarView>;
  findOrCreateCalendarView(view: InsertCalendarView & { userId: string; companyId: string }): Promise<CalendarView>;
  updateCalendarView(id: string, view: Partial<InsertCalendarView>, companyId: string): Promise<CalendarView | undefined>;
  deleteCalendarView(id: string, companyId: string): Promise<boolean>;

  // Activity Notes CRUD
  getActivityNotes(scheduleItemId: string, limit?: number, offset?: number): Promise<ActivityNote[]>;
  getActivityNoteCount(scheduleItemId: string): Promise<number>;
  getBatchActivityNoteCounts(scheduleItemIds: string[]): Promise<Record<string, number>>;
  createActivityNote(note: InsertActivityNote): Promise<ActivityNote>;
  updateActivityNote(id: string, note: Partial<InsertActivityNote>): Promise<ActivityNote | undefined>;
  deleteActivityNote(id: string): Promise<boolean>;
  canEditActivityNote(noteId: string, userId: string): Promise<boolean>; // Check 5-minute edit window

  // Defects CRUD
  getDefects(projectId?: string, status?: string): Promise<Defect[]>;
  getDefectById(id: string): Promise<Defect | null>;
  createDefect(defect: InsertDefect): Promise<Defect>;
  updateDefect(id: string, defect: Partial<InsertDefect>): Promise<Defect>;
  deleteDefect(id: string): Promise<void>;

  // Minutes CRUD operations
  getMinutes(projectId?: string): Promise<Minute[]>;
  getMinute(id: string): Promise<Minute | undefined>;
  createMinute(minute: InsertMinute): Promise<Minute>;
  updateMinute(id: string, minute: Partial<InsertMinute>): Promise<Minute | undefined>;
  deleteMinute(id: string): Promise<boolean>;

  // Systems Library - Folders
  getSystemFolders(companyId: string, parentId?: string | null): Promise<SystemFolder[]>;
  getSystemFolder(id: string, companyId: string): Promise<SystemFolder | undefined>;
  createSystemFolder(folder: InsertSystemFolder & { companyId: string }): Promise<SystemFolder>;
  updateSystemFolder(id: string, folder: Partial<InsertSystemFolder>, companyId: string): Promise<SystemFolder | undefined>;
  deleteSystemFolder(id: string, companyId: string): Promise<boolean>;
  updateSystemFoldersOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void>;

  // Systems Library - Documents
  getSystemDocuments(companyId: string, folderId?: string | null): Promise<SystemDocument[]>;
  getSystemDocument(id: string, companyId: string): Promise<SystemDocument | undefined>;
  createSystemDocument(document: InsertSystemDocument & { companyId: string }): Promise<SystemDocument>;
  updateSystemDocument(id: string, document: Partial<InsertSystemDocument>, companyId: string): Promise<SystemDocument | undefined>;
  deleteSystemDocument(id: string, companyId: string): Promise<boolean>;
  updateSystemDocumentsOrder(updates: Array<{id: string, displayOrder: number, folderId?: string | null}>, companyId: string): Promise<void>;

  // Systems Library - Task Templates
  getTaskTemplates(companyId: string, isActive?: boolean): Promise<TaskTemplate[]>;
  getTaskTemplate(id: string, companyId: string): Promise<TaskTemplate | undefined>;
  createTaskTemplate(template: InsertTaskTemplate & { companyId: string }): Promise<TaskTemplate>;
  updateTaskTemplate(id: string, template: Partial<InsertTaskTemplate>, companyId: string): Promise<TaskTemplate | undefined>;
  deleteTaskTemplate(id: string, companyId: string): Promise<boolean>;
  generateRecurringTasks(companyId: string): Promise<{ generated: number }>;
  clearAndRegenerateTemplateTask(templateId: string, companyId: string): Promise<{ deleted: number; generated: number }>;
  syncTemplateToTasks(templateId: string, companyId: string): Promise<{ synced: number }>;
  createNextRecurringTask(completedTask: Task, companyId: string): Promise<Task | null>;
  createNextStandardRecurringTask(completedTask: Task, companyId: string): Promise<Task | null>;

  // Systems Library - Workflow Templates
  getWorkflowTemplates(companyId: string, isActive?: boolean): Promise<WorkflowTemplate[]>;
  getWorkflowTemplate(id: string, companyId: string): Promise<WorkflowTemplate | undefined>;
  createWorkflowTemplate(template: InsertWorkflowTemplate & { companyId: string }): Promise<WorkflowTemplate>;
  updateWorkflowTemplate(id: string, template: Partial<InsertWorkflowTemplate>, companyId: string): Promise<WorkflowTemplate | undefined>;
  deleteWorkflowTemplate(id: string, companyId: string): Promise<boolean>;

  // Systems Library - Project Workflows
  getProjectWorkflows(projectId: string): Promise<ProjectWorkflow[]>;
  getProjectWorkflow(id: string): Promise<ProjectWorkflow | undefined>;
  createProjectWorkflow(workflow: InsertProjectWorkflow): Promise<ProjectWorkflow>;
  updateProjectWorkflow(id: string, workflow: Partial<InsertProjectWorkflow>): Promise<ProjectWorkflow | undefined>;
  deleteProjectWorkflow(id: string): Promise<boolean>;

  // Messaging - Channels
  getChannels(companyId: string, userId?: string, filters?: { type?: string; projectId?: string }): Promise<Channel[]>;
  getChannel(id: string, companyId: string): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel & { companyId: string }): Promise<Channel>;
  updateChannel(id: string, channel: Partial<InsertChannel>, companyId: string): Promise<Channel | undefined>;
  deleteChannel(id: string, companyId: string): Promise<boolean>;
  getOrCreateDMChannel(userId1: string, userId2: string, companyId: string): Promise<Channel>;

  // Messaging - Channel Members
  getChannelMembers(channelId: string): Promise<ChannelMember[]>;
  addChannelMember(member: InsertChannelMember): Promise<ChannelMember>;
  removeChannelMember(channelId: string, userId: string): Promise<boolean>;
  updateChannelMemberLastRead(channelId: string, userId: string): Promise<void>;
  updateChannelMemberPin(channelId: string, userId: string, isPinned: boolean): Promise<void>;
  getUnreadCounts(userId: string, companyId: string): Promise<Record<string, number>>;

  // Messaging - Messages
  getMessages(channelId: string, limit?: number, before?: string): Promise<Message[]>;
  getMessageCount(channelId: string): Promise<number>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, message: Partial<InsertMessage>): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<boolean>;

  // Purchase Orders CRUD
  getPurchaseOrders(companyId: string, projectId?: string, status?: string, poType?: string): Promise<PurchaseOrder[]>;
  getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined>;
  createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, po: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined>;
  deletePurchaseOrder(id: string): Promise<boolean>;
  getNextPONumber(companyId: string, poType: "main" | "site"): Promise<string>;

  // Purchase Order Items CRUD
  getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]>;
  getPurchaseOrderItem(id: string): Promise<PurchaseOrderItem | undefined>;
  createPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem>;
  updatePurchaseOrderItem(id: string, item: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined>;
  deletePurchaseOrderItem(id: string): Promise<boolean>;
  reorderPurchaseOrderItems(updates: Array<{id: string, displayOrder: number}>): Promise<void>;

  // Purchase Order Attachments CRUD
  getPurchaseOrderAttachments(purchaseOrderId: string): Promise<PurchaseOrderAttachment[]>;
  getPurchaseOrderAttachment(id: string): Promise<PurchaseOrderAttachment | undefined>;
  createPurchaseOrderAttachment(attachment: InsertPurchaseOrderAttachment): Promise<PurchaseOrderAttachment>;
  deletePurchaseOrderAttachment(id: string): Promise<boolean>;

  // Purchase Order Signatures CRUD
  getPurchaseOrderSignatures(purchaseOrderId: string): Promise<PurchaseOrderSignature[]>;
  createPurchaseOrderSignature(signature: InsertPurchaseOrderSignature): Promise<PurchaseOrderSignature>;
  getPurchaseOrderBySignatureToken(token: string): Promise<PurchaseOrder | undefined>;

  // Purchase Order Templates CRUD
  getPurchaseOrderTemplates(companyId: string): Promise<PurchaseOrderTemplate[]>;
  getPurchaseOrderTemplate(id: string, companyId: string): Promise<PurchaseOrderTemplate | undefined>;
  createPurchaseOrderTemplate(template: InsertPurchaseOrderTemplate): Promise<PurchaseOrderTemplate>;
  updatePurchaseOrderTemplate(id: string, template: Partial<InsertPurchaseOrderTemplate>, companyId: string): Promise<PurchaseOrderTemplate | undefined>;
  deletePurchaseOrderTemplate(id: string, companyId: string): Promise<boolean>;

  // Favorite Suppliers CRUD
  getFavoriteSuppliers(userId: string, companyId: string): Promise<FavoriteSupplier[]>;
  createFavoriteSupplier(supplier: InsertFavoriteSupplier): Promise<FavoriteSupplier>;
  deleteFavoriteSupplier(id: string, userId: string, companyId: string): Promise<boolean>;
  reorderFavoriteSuppliers(updates: Array<{id: string, displayOrder: number}>): Promise<void>;

  // Favorite Cost Codes CRUD
  getFavoriteCostCodes(userId: string, companyId: string): Promise<FavoriteCostCode[]>;
  createFavoriteCostCode(costCode: InsertFavoriteCostCode): Promise<FavoriteCostCode>;
  deleteFavoriteCostCode(id: string): Promise<boolean>;
  reorderFavoriteCostCodes(updates: Array<{id: string, displayOrder: number}>): Promise<void>;

  // Folder Templates CRUD
  getFolderTemplates(companyId: string): Promise<import("@shared/schema").FolderTemplate[]>;
  getFolderTemplate(id: string, companyId: string): Promise<import("@shared/schema").FolderTemplate | undefined>;
  createFolderTemplate(template: import("@shared/schema").InsertFolderTemplate & { companyId: string }): Promise<import("@shared/schema").FolderTemplate>;
  updateFolderTemplate(id: string, template: Partial<import("@shared/schema").InsertFolderTemplate>, companyId: string): Promise<import("@shared/schema").FolderTemplate | undefined>;
  deleteFolderTemplate(id: string, companyId: string): Promise<boolean>;

  // Drive File Attachments CRUD
  getDriveFileAttachments(attachedToType: string, attachedToId: string, companyId: string): Promise<import("@shared/schema").DriveFileAttachment[]>;
  createDriveFileAttachment(attachment: import("@shared/schema").InsertDriveFileAttachment & { companyId: string }): Promise<import("@shared/schema").DriveFileAttachment>;
  deleteDriveFileAttachment(id: string, companyId: string): Promise<boolean>;

  // Drive File Activity Logs
  getDriveFileActivityLogs(companyId: string, projectId?: string, limit?: number): Promise<import("@shared/schema").DriveFileActivityLog[]>;
  createDriveFileActivityLog(log: import("@shared/schema").InsertDriveFileActivityLog): Promise<import("@shared/schema").DriveFileActivityLog>;

  // Price List Categories CRUD
  getPriceListCategories(companyId: string): Promise<PriceListCategory[]>;
  getPriceListCategory(id: string, companyId: string): Promise<PriceListCategory | undefined>;
  createPriceListCategory(category: InsertPriceListCategory & { companyId: string }): Promise<PriceListCategory>;
  updatePriceListCategory(id: string, category: Partial<InsertPriceListCategory>, companyId: string): Promise<PriceListCategory | undefined>;
  deletePriceListCategory(id: string, companyId: string): Promise<boolean>;

  // Price List Items CRUD
  getPriceListItems(companyId: string, filters?: { categoryId?: string; supplierId?: string; isActive?: boolean; search?: string }): Promise<PriceListItem[]>;
  getPriceListItem(id: string, companyId: string): Promise<PriceListItem | undefined>;
  createPriceListItem(item: InsertPriceListItem & { companyId: string }): Promise<PriceListItem>;
  updatePriceListItem(id: string, item: Partial<InsertPriceListItem>, companyId: string): Promise<PriceListItem | undefined>;
  deletePriceListItem(id: string, companyId: string): Promise<boolean>;
  bulkUpdatePriceListItems(updates: Array<{ id: string; data: Partial<InsertPriceListItem> }>, companyId: string): Promise<PriceListItem[]>;

  // Bill Line Item Price Links (for AI Review)
  getBillLineItemPriceLinks(companyId: string, status?: string): Promise<(BillLineItemPriceLink & { billLineItem?: import("@shared/schema").BillLineItem; bill?: import("@shared/schema").Bill })[]>;
  createBillLineItemPriceLink(link: InsertBillLineItemPriceLink): Promise<BillLineItemPriceLink>;
  updateBillLineItemPriceLink(id: string, link: Partial<InsertBillLineItemPriceLink>): Promise<BillLineItemPriceLink | undefined>;
  getUnlinkedBillLineItems(companyId: string): Promise<Array<import("@shared/schema").BillLineItem & { bill: import("@shared/schema").Bill; supplier: import("@shared/schema").Contact | null }>>;

  // Dashboard Views CRUD
  getDashboardViews(companyId: string, userId: string, viewType?: "personal" | "business"): Promise<DashboardView[]>;
  getDashboardView(id: string, companyId: string): Promise<DashboardView | undefined>;
  getCompanyDefaultDashboard(companyId: string, viewType: "personal" | "business"): Promise<DashboardView | undefined>;
  createDashboardView(view: InsertDashboardView & { companyId: string; creatorId: string }): Promise<DashboardView>;
  updateDashboardView(id: string, view: Partial<InsertDashboardView>, companyId: string): Promise<DashboardView | undefined>;
  setCompanyDefaultView(viewId: string, companyId: string): Promise<void>;
  deleteDashboardView(id: string, companyId: string): Promise<boolean>;

  // Dashboard View Permissions CRUD
  getDashboardViewPermissions(viewId: string): Promise<DashboardViewPermission[]>;
  setDashboardViewPermissions(viewId: string, permissions: { roleIds?: string[]; userIds?: string[] }): Promise<void>;

  // User Dashboard Preferences
  getUserDashboardPreference(userId: string, companyId: string): Promise<UserDashboardPreference | undefined>;
  setUserDashboardPreference(userId: string, companyId: string, activeViewId: string | null): Promise<UserDashboardPreference>;

  // Dashboard Theme Customization
  getDashboardTheme(userId: string, companyId: string, dashboardType: string, projectId?: string): Promise<import("@shared/schema").DashboardTheme | undefined>;
  saveDashboardTheme(theme: import("@shared/schema").InsertDashboardTheme): Promise<import("@shared/schema").DashboardTheme>;
  deleteDashboardTheme(id: string, companyId: string): Promise<boolean>;

  // Business Dashboard Views (with access control)
  getBusinessDashboardViews(companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView[]>;
  getBusinessDashboardView(id: string, companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView | undefined>;
  getBusinessDashboardViewById(id: string, companyId: string): Promise<import("@shared/schema").BusinessDashboardView | undefined>;
  createBusinessDashboardView(view: import("@shared/schema").InsertBusinessDashboardView): Promise<import("@shared/schema").BusinessDashboardView>;
  updateBusinessDashboardView(id: string, companyId: string, updates: Partial<import("@shared/schema").InsertBusinessDashboardView>): Promise<import("@shared/schema").BusinessDashboardView | undefined>;
  deleteBusinessDashboardView(id: string, companyId: string): Promise<boolean>;
  ensureDefaultBusinessDashboardView(companyId: string): Promise<import("@shared/schema").BusinessDashboardView>;

  // In-App Notifications
  getNotifications(userId: string, companyId: string, options?: { limit?: number; unreadOnly?: boolean }): Promise<InAppNotification[]>;
  getNotification(id: string, userId: string): Promise<InAppNotification | undefined>;
  createNotification(notification: InsertNotification): Promise<InAppNotification>;
  markNotificationAsRead(id: string, userId: string): Promise<InAppNotification | undefined>;
  markAllNotificationsAsRead(userId: string, companyId: string): Promise<number>;
  deleteNotification(id: string, userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string, companyId: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userRoles: Map<string, UserRole>;
  private permissions: Map<string, Permission>;
  private rolePermissions: Map<string, RolePermission>;
  private userProjectAccess: Map<string, UserProjectAccess>;
  private userInvitations: Map<string, UserInvitation>;
  private userColumnPreferences: Map<string, UserColumnPreferences>;
  private userViewPreferences: Map<string, UserViewPreferences>;
  private notes: Map<string, Note>;
  private noteGroups: Map<string, NoteGroup>;
  private customFieldDefs: Map<string, CustomFieldDef>;
  private customFieldOptions: Map<string, CustomFieldOption>;
  private noteTemplates: Map<string, NoteTemplate>;
  private projects: Map<string, Project>;
  private taskViews: Map<string, TaskView>;
  private estimates: Map<string, Estimate>;
  private estimateItems: Map<string, EstimateItem>;
  private estimateGroups: Map<string, EstimateGroup>;
  private costCategories: Map<string, CostCategory>;
  private costCodes: Map<string, CostCode>;
  private companies: Map<string, import("@shared/schema").Company>;
  private companySettings: CompanySettings | undefined;
  private systemConfiguration: SystemConfiguration | undefined;
  private fieldCategories: Map<string, FieldCategory>;
  private fieldOptions: Map<string, FieldOption>;
  private selections: Map<string, Selection>;
  private selectionOptions: Map<string, SelectionOption>;
  private optionAttachments: Map<string, OptionAttachment>;
  private clientSelections: Map<string, ClientSelection>;
  private siteDiaryTemplates: Map<string, SiteDiaryTemplate>;
  private siteDiaryEntries: Map<string, SiteDiaryEntry>;
  private calendarViews: Map<string, CalendarView>;
  private activityNotes: Map<string, ActivityNote>;

  constructor() {
    this.users = new Map();
    this.userRoles = new Map();
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.userProjectAccess = new Map();
    this.userInvitations = new Map();
    this.userColumnPreferences = new Map();
    this.userViewPreferences = new Map();
    this.notes = new Map();
    this.noteGroups = new Map();
    this.customFieldDefs = new Map();
    this.customFieldOptions = new Map();
    this.noteTemplates = new Map();
    this.projects = new Map();
    this.taskViews = new Map();
    this.estimates = new Map();
    this.estimateItems = new Map();
    this.estimateGroups = new Map();
    this.costCategories = new Map();
    this.costCodes = new Map();
    this.companies = new Map();
    this.fieldCategories = new Map();
    this.fieldOptions = new Map();
    this.selections = new Map();
    this.selectionOptions = new Map();
    this.optionAttachments = new Map();
    this.clientSelections = new Map();
    this.siteDiaryTemplates = new Map();
    this.siteDiaryEntries = new Map();
    this.calendarViews = new Map();
    this.activityNotes = new Map();
    this.initializeDefaultRoleSystem();
    this.initializeDefaultCustomFields();
    this.initializeDefaultFieldCategories();
    this.initializeDefaultData();
  }

  // Initialize default role system with built-in roles and permissions
  private initializeDefaultRoleSystem() {
    // Initialize built-in permissions based on Buildern screenshots
    const builtInPermissions: Array<Omit<Permission, 'id' | 'createdAt'>> = [
      // Files category
      { key: "files.manage", name: "Files", description: "Manage files and folders", category: "files", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      
      // Admin category
      { key: "admin.users", name: "User (team)", description: "Manage team users", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.suppliers", name: "Sub/Vendor", description: "Manage suppliers/vendors", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.roles", name: "Role", description: "Manage user roles", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.cost_codes", name: "Cost code/category", description: "Manage cost codes", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.terms", name: "Terms and Conditions", description: "Manage terms", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.payment_templates", name: "Payment schedule templates", description: "Manage payment templates", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.company", name: "Company settings", description: "Manage company settings", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.manage_team_members", name: "Manage Team Members", description: "Edit team member profiles and details", category: "admin", actions: ["view", "edit"], isBuiltIn: true },
      
      // Sales category
      { key: "sales.client", name: "Client", description: "Manage clients", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      
      // Project Management category
      { key: "projects.view", name: "Projects", description: "View projects", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.schedule", name: "Schedule", description: "Manage project schedules", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.variations", name: "Variations", description: "Manage project variations", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.todos", name: "To Dos", description: "Manage project to-dos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.invoices", name: "Client Invoices", description: "Manage client invoices", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.site_diary", name: "Site Diary", description: "Manage site diary", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.selections", name: "Selections and Allowances", description: "Manage selections", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.timesheet", name: "Timesheet", description: "Manage timesheets", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.rfi", name: "RFI", description: "Manage RFIs", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.team_calendars", name: "View Team Calendars", description: "View other team members' calendars", category: "projects", actions: ["view"], isBuiltIn: true },
      
      // Financial category
      { key: "financial.estimate", name: "Estimate", description: "Manage estimates", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.purchase_orders", name: "Purchase Orders", description: "Manage purchase orders", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.bills", name: "Bills", description: "Manage bills", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.budget", name: "Budget", description: "Manage budgets", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.quotes", name: "Request for Quotes", description: "Manage quotes", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.proposal", name: "Proposal", description: "Manage proposals", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true }
    ];

    // Create permissions
    builtInPermissions.forEach(permData => {
      const permission: Permission = {
        ...permData,
        id: `perm-${permData.key.replace(/\./g, '-')}`,
        createdAt: new Date(),
      };
      this.permissions.set(permission.id, permission);
    });

    // NOTE: Built-in roles are no longer seeded globally.
    // They are now seeded per-company when a company is created via seedDefaultRolesForCompany()
    // This ensures proper multi-tenant isolation with roles linked to their companyId.
  }

  // Initialize default custom fields to replace category and priority
  private initializeDefaultCustomFields() {
    const categoryField: CustomFieldDef = {
      id: "category-field",
      key: "category",
      label: "Category",
      type: "select",
      required: true,
      order: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    const priorityField: CustomFieldDef = {
      id: "priority-field",
      key: "priority",
      label: "Priority",
      type: "select",
      required: true,
      order: 1,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.customFieldDefs.set(categoryField.id, categoryField);
    this.customFieldDefs.set(priorityField.id, priorityField);

    // Add default category options
    const categoryOptions = [
      { label: "Client Communication", value: "Client Communication", color: "#3B82F6" },
      { label: "Site Updates", value: "Site Updates", color: "#10B981" },
      { label: "Inspections", value: "Inspections", color: "#F59E0B" },
      { label: "Logistics", value: "Logistics", color: "#8B5CF6" },
      { label: "Safety", value: "Safety", color: "#EF4444" },
      { label: "General", value: "General", color: "#6B7280" },
    ];

    categoryOptions.forEach((opt, index) => {
      const option: CustomFieldOption = {
        id: `category-${opt.value.toLowerCase().replace(/\s+/g, '-')}`,
        fieldDefId: categoryField.id,
        label: opt.label,
        value: opt.value,
        color: opt.color,
        order: index,
        isActive: true,
        createdAt: new Date(),
      };
      this.customFieldOptions.set(option.id, option);
    });

    // Add default priority options
    const priorityOptions = [
      { label: "Low", value: "low", color: "#10B981" },
      { label: "Medium", value: "medium", color: "#F59E0B" },
      { label: "High", value: "high", color: "#EF4444" },
    ];

    priorityOptions.forEach((opt, index) => {
      const option: CustomFieldOption = {
        id: `priority-${opt.value}`,
        fieldDefId: priorityField.id,
        label: opt.label,
        value: opt.value,
        color: opt.color,
        order: index,
        isActive: true,
        createdAt: new Date(),
      };
      this.customFieldOptions.set(option.id, option);
    });
  }

  // Initialize default field categories (Buildern-style)
  private initializeDefaultFieldCategories() {
    const now = new Date();

    // Task Status Category
    const taskStatusCategory: FieldCategory = {
      id: "cat-task-status",
      key: "task.status",
      label: "Task Statuses",
      entity: "task",
      description: "Status options for tasks",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(taskStatusCategory.id, taskStatusCategory);

    // Task Priority Category  
    const taskPriorityCategory: FieldCategory = {
      id: "cat-task-priority",
      key: "task.priority",
      label: "Task Priorities", 
      entity: "task",
      description: "Priority levels for tasks",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(taskPriorityCategory.id, taskPriorityCategory);

    // Task Labels Category
    const taskLabelsCategory: FieldCategory = {
      id: "cat-task-labels",
      key: "task.labels",
      label: "Task Labels",
      entity: "task",
      description: "Customizable labels for tasks",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(taskLabelsCategory.id, taskLabelsCategory);

    // Trade Categories
    const tradeCategoriesCategory: FieldCategory = {
      id: "cat-trade-types",
      key: "task.trade",
      label: "Trade Categories",
      entity: "task", 
      description: "Construction trade categories",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(tradeCategoriesCategory.id, tradeCategoriesCategory);

    // Add default options for Task Status
    const statusOptions = [
      { key: "todo", name: "Not Started", color: "#6B7280", isDefault: true },
      { key: "in-progress", name: "In Progress", color: "#F59E0B", isDefault: false },
      { key: "done", name: "Complete", color: "#10B981", isDefault: false },
      { key: "on-hold", name: "On Hold", color: "#EF4444", isDefault: false },
    ];

    statusOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-status-${opt.key}`,
        categoryId: taskStatusCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: opt.key === "done",
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Add default options for Task Priority
    const priorityOptions = [
      { key: "low", name: "Low", color: "#10B981", isDefault: false },
      { key: "medium", name: "Medium", color: "#F59E0B", isDefault: true },
      { key: "high", name: "High", color: "#EF4444", isDefault: false },
      { key: "critical", name: "Critical", color: "#DC2626", isDefault: false },
    ];

    priorityOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-priority-${opt.key}`,
        categoryId: taskPriorityCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Add default options for Task Labels
    const labelOptions = [
      { key: "bug", name: "Bug", color: "#EF4444", isDefault: false },
      { key: "feature", name: "Feature", color: "#3B82F6", isDefault: false },
      { key: "urgent", name: "Urgent", color: "#DC2626", isDefault: false },
      { key: "review", name: "Review", color: "#F59E0B", isDefault: false },
      { key: "documentation", name: "Documentation", color: "#8B5CF6", isDefault: false },
      { key: "client-request", name: "Client Request", color: "#10B981", isDefault: false },
    ];

    labelOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-label-${opt.key}`,
        categoryId: taskLabelsCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Add default options for Trade Categories
    const tradeOptions = [
      { key: "plumbing", name: "Plumbing", color: "#3B82F6" },
      { key: "electrical", name: "Electrical", color: "#F59E0B" },
      { key: "framing", name: "Framing", color: "#8B5A2B" },
      { key: "roofing", name: "Roofing", color: "#DC2626" },
      { key: "flooring", name: "Flooring", color: "#7C3AED" },
      { key: "painting", name: "Painting", color: "#10B981" },
      { key: "hvac", name: "HVAC", color: "#06B6D4" },
    ];

    tradeOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-trade-${opt.key}`,
        categoryId: tradeCategoriesCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: index === 0, // First one is default
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Estimate Item Status Category
    const estimateItemStatusCategory: FieldCategory = {
      id: "cat-estimate-item-status",
      key: "estimate_item.status",
      label: "Estimate Item Statuses",
      entity: "estimate_item",
      description: "Status options for estimate items",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(estimateItemStatusCategory.id, estimateItemStatusCategory);

    // Add default options for Estimate Item Status
    const estimateItemStatusOptions = [
      { key: "pending", name: "Pending", color: "#6B7280", isDefault: true },
      { key: "quoted", name: "Quoted", color: "#F59E0B", isDefault: false },
      { key: "confirmed", name: "Confirmed", color: "#10B981", isDefault: false },
      { key: "ordered", name: "Ordered", color: "#3B82F6", isDefault: false },
      { key: "cancelled", name: "Cancelled", color: "#EF4444", isDefault: false },
    ];

    estimateItemStatusOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-estimate-item-status-${opt.key}`,
        categoryId: estimateItemStatusCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: opt.key === "confirmed", // Mark "confirmed" as completed status
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Estimate Item Unit Category
    const estimateItemUnitCategory: FieldCategory = {
      id: "cat-estimate-item-unit",
      key: "estimate_item.unit",
      label: "Estimate Units",
      entity: "estimate_item",
      description: "Unit of measurement options for estimate items",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 6,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(estimateItemUnitCategory.id, estimateItemUnitCategory);

    // Add default options for Estimate Item Units (Australian construction units)
    const estimateItemUnitOptions = [
      { key: "ea", name: "ea", color: "#6B7280", isDefault: true },
      { key: "m", name: "m", color: "#6B7280", isDefault: false },
      { key: "m²", name: "m²", color: "#6B7280", isDefault: false },
      { key: "m³", name: "m³", color: "#6B7280", isDefault: false },
      { key: "item", name: "item", color: "#6B7280", isDefault: false },
      { key: "hr", name: "hr", color: "#6B7280", isDefault: false },
      { key: "day", name: "day", color: "#6B7280", isDefault: false },
      { key: "load", name: "load", color: "#6B7280", isDefault: false },
      { key: "tonne", name: "tonne", color: "#6B7280", isDefault: false },
      { key: "kg", name: "kg", color: "#6B7280", isDefault: false },
      { key: "set", name: "set", color: "#6B7280", isDefault: false },
    ];

    estimateItemUnitOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-estimate-item-unit-${opt.key}`,
        categoryId: estimateItemUnitCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Selection Categories
    const selectionCategoriesCategory: FieldCategory = {
      id: "cat-selection-categories",
      key: "selection.category",
      label: "Selection Categories",
      entity: "selection",
      description: "Categories for selection items",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(selectionCategoriesCategory.id, selectionCategoriesCategory);

    // Location/Room Categories
    const locationCategory: FieldCategory = {
      id: "cat-locations",
      key: "selection.room",
      label: "Locations/Rooms",
      entity: "selection",
      description: "Room and location options for selections",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(locationCategory.id, locationCategory);

    // Add default options for Selection Categories
    const selectionCategoryOptions = [
      { key: "tiles", name: "Tiles", color: "#8B5A2B" },
      { key: "flooring", name: "Flooring", color: "#7C3AED" },
      { key: "paint", name: "Paint & Colors", color: "#10B981" },
      { key: "fixtures", name: "Fixtures", color: "#3B82F6" },
      { key: "appliances", name: "Appliances", color: "#F59E0B" },
      { key: "hardware", name: "Hardware", color: "#6B7280" },
      { key: "lighting", name: "Lighting", color: "#F59E0B" },
      { key: "cabinetry", name: "Cabinetry", color: "#8B5A2B" },
      { key: "countertops", name: "Countertops", color: "#06B6D4" },
      { key: "windows-doors", name: "Windows & Doors", color: "#DC2626" },
    ];

    selectionCategoryOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-selection-category-${opt.key}`,
        categoryId: selectionCategoriesCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: index === 0, // First one is default
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Add default options for Locations/Rooms
    const locationOptions = [
      { key: "kitchen", name: "Kitchen", color: "#F59E0B" },
      { key: "master-bathroom", name: "Master Bathroom", color: "#3B82F6" },
      { key: "guest-bathroom", name: "Guest Bathroom", color: "#06B6D4" },
      { key: "powder-room", name: "Powder Room", color: "#8B5A2B" },
      { key: "living-room", name: "Living Room", color: "#10B981" },
      { key: "dining-room", name: "Dining Room", color: "#7C3AED" },
      { key: "master-bedroom", name: "Master Bedroom", color: "#DC2626" },
      { key: "guest-bedroom", name: "Guest Bedroom", color: "#EF4444" },
      { key: "laundry", name: "Laundry", color: "#6B7280" },
      { key: "garage", name: "Garage", color: "#374151" },
      { key: "outdoor", name: "Outdoor/Exterior", color: "#059669" },
      { key: "basement", name: "Basement", color: "#1F2937" },
      { key: "attic", name: "Attic", color: "#4B5563" },
      { key: "office", name: "Home Office", color: "#7C2D12" },
      { key: "family-room", name: "Family Room", color: "#B45309" },
    ];

    locationOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-location-${opt.key}`,
        categoryId: locationCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: index === 0, // First one is default
        isCompleted: false,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Allowance Status Category
    const allowanceStatusCategory: FieldCategory = {
      id: "cat-allowance-status",
      key: "allowance.status",
      label: "Allowance Statuses",
      entity: "allowance",
      description: "Status options for PC and PS allowances",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 7,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(allowanceStatusCategory.id, allowanceStatusCategory);

    // Add default options for Allowance Status
    const allowanceStatusOptions = [
      { key: "pending", name: "Pending", color: "#F59E0B", isDefault: true },
      { key: "in_progress", name: "In Progress", color: "#3B82F6", isDefault: false },
      { key: "finalized", name: "Finalized", color: "#10B981", isDefault: false },
    ];

    allowanceStatusOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-allowance-status-${opt.key}`,
        categoryId: allowanceStatusCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: opt.key === "finalized",
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });

    // Schedule Item Status Category
    const scheduleItemStatusCategory: FieldCategory = {
      id: "cat-schedule-item-status",
      key: "schedule_item.status",
      label: "Schedule Item Statuses",
      entity: "schedule_item",
      description: "Status options for schedule items",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 8,
      createdAt: now,
      updatedAt: now,
    };
    this.fieldCategories.set(scheduleItemStatusCategory.id, scheduleItemStatusCategory);

    // Add default options for Schedule Item Status
    const scheduleItemStatusOptions = [
      { key: "not_started", name: "Not Started", color: "#6B7280", isDefault: true, isCompleted: false },
      { key: "in_progress", name: "In Progress", color: "#F59E0B", isDefault: false, isCompleted: false },
      { key: "completed", name: "Completed", color: "#10B981", isDefault: false, isCompleted: true },
      { key: "on_hold", name: "On Hold", color: "#EF4444", isDefault: false, isCompleted: false },
      { key: "cancelled", name: "Cancelled", color: "#94A3B8", isDefault: false, isCompleted: false },
    ];

    scheduleItemStatusOptions.forEach((opt, index) => {
      const option: FieldOption = {
        id: `opt-schedule-item-status-${opt.key}`,
        categoryId: scheduleItemStatusCategory.id,
        key: opt.key,
        name: opt.name,
        color: opt.color,
        isActive: true,
        isDefault: opt.isDefault,
        isCompleted: opt.isCompleted,
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
      };
      this.fieldOptions.set(option.id, option);
    });
  }

  // Initialize default projects including business project
  private initializeDefaultData() {
    this.initializeDefaultUsers();
    this.initializeDefaultProjects();
    this.initializeDefaultEstimates();
  }

  private initializeDefaultUsers() {
    // Create default test user for development with a properly generated hash
    const testUserId = "test-user-id";
    const now = new Date();
    
    // This is a fresh bcrypt hash of "test-password" generated with salt rounds 10
    const testUser: User = {
      id: testUserId,
      username: "testuser_PymwZ9t-",
      password: "$2b$10$BAFF7cy/dLnEOHbYWL847.G9YLqvkWSpl19HIZ5wqwF3IYuCGo9.W", // Fresh bcrypt hash of "test-password"
      email: "test@buildpro.com",
      firstName: "Test",
      lastName: "User",
      phone: null,
      company: null,
      roleId: null,
      roleName: null,
      userCategory: "team",
      isActive: true,
      isInvitePending: false,
      invitedBy: null,
      invitedAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(testUser.id, testUser);
    // Test user created successfully
  }

  private initializeDefaultProjects() {
    const businessProject: Project = {
      id: "business",
      name: "Business Operations",
      description: "General business administration and office tasks",
      jobNumber: null,
      projectType: null,
      color: "#6366F1",
      icon: "Building2",
      isActive: true,
      isArchived: false,
      isBusiness: true,
      invoicingMethod: "progress_payments",
      ownerId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.set(businessProject.id, businessProject);

    // Add some example projects
    const sampleProjects = [
      {
        id: "project-1",
        name: "Website Redesign",
        description: "Complete overhaul of company website",
        color: "#3B82F6",
        isBusiness: false,
      },
      {
        id: "project-2", 
        name: "Client Portal",
        description: "Development of new client management portal",
        color: "#10B981",
        isBusiness: false,
      }
    ];

    sampleProjects.forEach(proj => {
      const project: Project = {
        ...proj,
        jobNumber: null,
        projectType: null,
        icon: "Building2",
        isActive: true,
        isArchived: false,
        invoicingMethod: "progress_payments",
        ownerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.projects.set(project.id, project);
    });
  }

  private initializeDefaultEstimates() {
    const now = new Date();
    
    // Add test estimate that matches the test data
    const testEstimate: Estimate = {
      id: "test-estimate-123",
      name: "Kitchen Renovation Estimate",
      projectId: "test-project-123",
      version: 1,
      status: "draft",
      isLocked: false,
      projectMarkupPercent: 15,
      taxRate: 10,
      notes: "Complete kitchen renovation including cabinets, countertops, and appliances",
      ownerId: null,
      ownerName: null,
      createdAt: new Date("2025-09-21T09:18:12.320Z"),
      updatedAt: new Date("2025-09-21T09:18:12.320Z"),
    };
    this.estimates.set(testEstimate.id, testEstimate);

    // Add test project that matches the estimate
    const testProject: Project = {
      id: "test-project-123",
      name: "Kitchen Renovation",
      description: "Complete kitchen remodel project",
      jobNumber: null,
      projectType: null,
      color: "#2563eb",
      icon: "Building2",
      isActive: true,
      isArchived: false,
      isBusiness: false,
      invoicingMethod: "progress_payments",
      ownerId: null,
      createdAt: new Date("2025-09-21T09:17:57.333Z"),
      updatedAt: new Date("2025-09-21T09:17:57.333Z"),
    };
    this.projects.set(testProject.id, testProject);

    // Add some test estimate items
    const testItems = [
      {
        id: "item-1",
        estimateId: "test-estimate-123",
        name: "Premium Kitchen Cabinets",
        description: "High-quality solid wood cabinets",
        type: "material",
        status: "confirmed",
        quantity: 1,
        unitType: "set",
        unitCostExTax: 850000, // $8500 in cents
        taxAmount: 85000,   // $850 in cents
        priceIncTax: 935000, // $9350 in cents
      },
      {
        id: "item-2",
        estimateId: "test-estimate-123",
        name: "Installation Labor",
        description: "Professional installation services",
        type: "labour",
        status: "confirmed",
        quantity: 40,
        unitType: "hours",
        unitCostExTax: 340000, // $3400 in cents (40 * $85)
        taxAmount: 34000,   // $340 in cents
        priceIncTax: 374000, // $3740 in cents
      }
    ];

    testItems.forEach(itemData => {
      const item: EstimateItem = {
        ...itemData,
        groupId: null,
        parentItemId: null,
        costCode: null,
        allowance: "None",
        markupPercent: null,
        notes: null,
        attachmentUrl: null,
        requestForQuote: false,
        isSelection: false,
        proposalVisible: true,
        trackLabourHours: false,
        shownAs: "price",
        order: 0,
        createdAt: now,
        updatedAt: now,
      };
      this.estimateItems.set(item.id, item);
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async validateUserCredentials(username: string, plainPassword: string): Promise<User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user || !user.isActive) return undefined;
    
    // SECURITY: Use bcrypt to verify password
    const isValid = await PasswordUtils.verifyPassword(plainPassword, user.password);
    return isValid ? user : undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const now = new Date();
    
    // CRITICAL SECURITY FIX: Hash password before storing
    const hashedPassword = await PasswordUtils.hashPassword(insertUser.password);
    
    const user: User = { 
      ...insertUser, 
      id,
      password: hashedPassword, // Store hashed password only
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      phone: insertUser.phone || null,
      company: insertUser.company || null,
      roleId: insertUser.roleId || null,
      roleName: insertUser.roleName || null,
      isActive: insertUser.isActive ?? true,
      isInvitePending: insertUser.isInvitePending ?? false,
      invitedBy: insertUser.invitedBy || null,
      invitedAt: insertUser.invitedAt || null,
      lastLoginAt: insertUser.lastLoginAt || null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserWithRole(id: string): Promise<UserWithRole | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const role = user.roleId ? this.userRoles.get(user.roleId) : undefined;
    const permissions = role ? await this.getUserPermissions(user.id) : [];
    
    return {
      ...user,
      role,
      permissions,
    };
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) return undefined;

    // CRITICAL SECURITY FIX: Handle password updates securely
    const processedUpdateData = { ...updateData };
    if (updateData.password) {
      // Hash the new password before storing
      processedUpdateData.password = await PasswordUtils.hashPassword(updateData.password);
    }

    const updatedUser: User = {
      ...existingUser,
      ...processedUpdateData,
      updatedAt: new Date(),
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async changeUserPassword(id: string, newPassword: string): Promise<User | undefined> {
    // Dedicated method for password changes with validation
    const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new Error(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }
    
    return await this.updateUser(id, { password: newPassword });
  }

  async getUsers(category?: UserCategory): Promise<UserWithRole[]> {
    const allUsers = Array.from(this.users.values());
    const filteredUsers = category
      ? allUsers.filter(user => user.userCategory === category && user.isActive)
      : allUsers.filter(user => user.isActive);
    
    return filteredUsers.map(user => ({
      ...user,
      role: user.roleId ? this.userRoles.get(user.roleId) : undefined,
    }));
  }

  async getUsersByCompanyWithRoles(companyId: string, category?: UserCategory): Promise<UserWithRole[]> {
    const allUsers = Array.from(this.users.values());
    const filteredUsers = allUsers.filter(user => {
      if (user.companyId !== companyId) return false;
      if (!user.isActive) return false;
      if (category && user.userCategory !== category) return false;
      return true;
    });
    
    return filteredUsers.map(user => ({
      ...user,
      role: user.roleId ? this.userRoles.get(user.roleId) : undefined,
    }));
  }

  async getUserColumnPreferences(userId: string, pageKey: string): Promise<UserColumnPreferences | undefined> {
    return Array.from(this.userColumnPreferences.values()).find(
      (pref) => pref.userId === userId && pref.pageKey === pageKey
    );
  }

  async saveUserColumnPreferences(preferences: InsertUserColumnPreferences): Promise<UserColumnPreferences> {
    const existing = await this.getUserColumnPreferences(preferences.userId, preferences.pageKey);
    
    if (existing) {
      const updated: UserColumnPreferences = {
        ...existing,
        columnConfig: preferences.columnConfig,
        updatedAt: new Date(),
      };
      this.userColumnPreferences.set(existing.id, updated);
      return updated;
    }
    
    const id = randomUUID();
    const now = new Date();
    const newPreference: UserColumnPreferences = {
      id,
      ...preferences,
      createdAt: now,
      updatedAt: now,
    };
    this.userColumnPreferences.set(id, newPreference);
    return newPreference;
  }

  async getUserViewPreferences(userId: string, viewKey: string): Promise<UserViewPreferences | undefined> {
    return Array.from(this.userViewPreferences.values()).find(
      (pref) => pref.userId === userId && pref.viewKey === viewKey
    );
  }

  async saveUserViewPreferences(preferences: InsertUserViewPreferences): Promise<UserViewPreferences> {
    const existing = await this.getUserViewPreferences(preferences.userId, preferences.viewKey);
    
    if (existing) {
      const updated: UserViewPreferences = {
        ...existing,
        preferences: preferences.preferences,
        updatedAt: new Date(),
      };
      this.userViewPreferences.set(existing.id, updated);
      return updated;
    }
    
    const id = randomUUID();
    const now = new Date();
    const newPreference: UserViewPreferences = {
      id,
      ...preferences,
      createdAt: now,
      updatedAt: now,
    };
    this.userViewPreferences.set(id, newPreference);
    return newPreference;
  }

  // Helper method to get user permissions
  private async getUserPermissions(userId: string): Promise<Permission[]> {
    const user = this.users.get(userId);
    if (!user || !user.roleId) return [];

    const rolePermissions = Array.from(this.rolePermissions.values())
      .filter(rp => rp.roleId === user.roleId);

    const permissions: Permission[] = [];
    for (const rp of rolePermissions) {
      const permission = this.permissions.get(rp.permissionId);
      if (permission) {
        permissions.push(permission);
      }
    }
    return permissions;
  }

  // Check if user has a specific permission
  async checkUserPermission(userId: string, permissionKey: string, action: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.some(p => p.key === permissionKey && (p as any)[action] === true);
  }

  // User Role operations
  async getUserRoles(category?: UserCategory, companyId?: string): Promise<UserRole[]> {
    const allRoles = Array.from(this.userRoles.values());
    let filteredRoles = category 
      ? allRoles.filter(role => role.userCategory === category && role.isActive)
      : allRoles.filter(role => role.isActive);
    
    // Filter by companyId if provided
    if (companyId) {
      filteredRoles = filteredRoles.filter(role => role.companyId === companyId);
    }
    
    // Sort by displayOrder first, then by name as fallback
    return filteredRoles.sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async getUserRole(id: string, companyId?: string): Promise<UserRole | undefined> {
    const role = this.userRoles.get(id);
    if (!role) return undefined;
    
    // Check companyId matches if provided
    if (companyId && role.companyId !== companyId) {
      return undefined;
    }
    
    return role;
  }

  async createUserRole(insertRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    const now = new Date();
    
    // Calculate displayOrder: max(existing displayOrder) + 1
    const existingRoles = Array.from(this.userRoles.values());
    const maxDisplayOrder = existingRoles.length > 0 
      ? Math.max(...existingRoles.map(r => r.displayOrder)) 
      : -1;
    
    const role: UserRole = {
      ...insertRole,
      id,
      description: insertRole.description || null,
      isBuiltIn: insertRole.isBuiltIn ?? false,
      isActive: insertRole.isActive ?? true,
      displayOrder: insertRole.displayOrder ?? (maxDisplayOrder + 1),
      createdAt: now,
      updatedAt: now,
    };
    this.userRoles.set(id, role);
    return role;
  }

  async updateUserRole(id: string, updateData: Partial<InsertUserRole>, companyId?: string): Promise<UserRole | undefined> {
    const existingRole = this.userRoles.get(id);
    if (!existingRole) return undefined;

    // Verify companyId matches if provided
    if (companyId && existingRole.companyId !== companyId) {
      return undefined;
    }

    const updatedRole: UserRole = {
      ...existingRole,
      ...updateData,
      updatedAt: new Date(),
    };
    this.userRoles.set(id, updatedRole);
    return updatedRole;
  }

  async deleteUserRole(id: string, companyId?: string): Promise<boolean> {
    const role = this.userRoles.get(id);
    if (!role || role.isBuiltIn) return false; // Cannot delete built-in roles

    // Verify companyId matches if provided
    if (companyId && role.companyId !== companyId) {
      return false;
    }

    // Check if any active users have this roleId assigned
    const usersWithRole = Array.from(this.users.values()).filter(
      user => user.roleId === id && user.isActive
    );
    if (usersWithRole.length > 0) {
      return false; // Cannot delete role with assigned users
    }

    // Soft delete by setting isActive to false
    const updatedRole: UserRole = {
      ...role,
      isActive: false,
      updatedAt: new Date(),
    };
    this.userRoles.set(id, updatedRole);
    return true;
  }

  async updateUserRolesOrder(updates: Array<{id: string, displayOrder: number}>, companyId?: string): Promise<void> {
    const now = new Date();
    for (const update of updates) {
      const role = this.userRoles.get(update.id);
      if (role) {
        // Verify companyId matches if provided
        if (companyId && role.companyId !== companyId) {
          continue; // Skip roles that don't belong to this company
        }
        
        const updatedRole: UserRole = {
          ...role,
          displayOrder: update.displayOrder,
          updatedAt: now,
        };
        this.userRoles.set(update.id, updatedRole);
      }
    }
  }

  async seedDefaultRolesForCompany(companyId: string): Promise<string> {
    const builtInRoles: Array<Omit<UserRole, 'id' | 'createdAt' | 'updatedAt'>> = [
      { companyId, name: "General Manager", description: "Full system administration access", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 0 },
      { companyId, name: "Office Manager", description: "Office operations management", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 1 },
      { companyId, name: "Construction Manager", description: "Construction oversight and management", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 2 },
      { companyId, name: "Foreman", description: "Site-based team lead", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 3 },
      { companyId, name: "Carpenter", description: "Carpentry specialist", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 4 },
      { companyId, name: "Apprentice", description: "Learning team member", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 5 },
      { companyId, name: "Subcontractor", description: "External subcontractor with limited access", userCategory: "supplier", isBuiltIn: true, isActive: true, displayOrder: 6 },
    ];

    const now = new Date();
    let generalManagerRoleId = '';

    for (const roleData of builtInRoles) {
      const roleId = randomUUID();
      const role: UserRole = {
        ...roleData,
        id: roleId,
        createdAt: now,
        updatedAt: now,
      };
      this.userRoles.set(roleId, role);

      if (roleData.name === "General Manager") {
        generalManagerRoleId = roleId;
        
        // Set full permissions for General Manager
        const allPermissions = Array.from(this.permissions.values());
        for (const permission of allPermissions) {
          const rolePermission: RolePermission = {
            id: randomUUID(),
            roleId: roleId,
            permissionId: permission.id,
            allowedActions: permission.actions as PermissionAction[],
            createdAt: now,
          };
          this.rolePermissions.set(rolePermission.id, rolePermission);
        }
      }
    }

    return generalManagerRoleId;
  }

  // Permission operations
  async getPermissions(category?: string): Promise<Permission[]> {
    const allPermissions = Array.from(this.permissions.values());
    if (category) {
      return allPermissions.filter(permission => permission.category === category);
    }
    return allPermissions;
  }

  async getPermission(id: string): Promise<Permission | undefined> {
    return this.permissions.get(id);
  }

  async createPermission(insertPermission: InsertPermission): Promise<Permission> {
    const id = randomUUID();
    const permission: Permission = {
      ...insertPermission,
      id,
      description: insertPermission.description || null,
      actions: insertPermission.actions || ['view'],
      isBuiltIn: insertPermission.isBuiltIn ?? false,
      createdAt: new Date(),
    };
    this.permissions.set(id, permission);
    return permission;
  }

  async updatePermission(id: string, updateData: Partial<InsertPermission>): Promise<Permission | undefined> {
    const existingPermission = this.permissions.get(id);
    if (!existingPermission) return undefined;

    const updatedPermission: Permission = {
      ...existingPermission,
      ...updateData,
    };
    this.permissions.set(id, updatedPermission);
    return updatedPermission;
  }

  async deletePermission(id: string): Promise<boolean> {
    const permission = this.permissions.get(id);
    if (!permission || permission.isBuiltIn) return false; // Cannot delete built-in permissions
    return this.permissions.delete(id);
  }

  // Role Permission operations (permissions matrix)
  async getRolePermissions(roleId: string): Promise<RolePermission[]> {
    return Array.from(this.rolePermissions.values())
      .filter(rp => rp.roleId === roleId);
  }

  async createRolePermission(insertRolePermission: InsertRolePermission): Promise<RolePermission> {
    const id = randomUUID();
    const rolePermission: RolePermission = {
      ...insertRolePermission,
      id,
      allowedActions: insertRolePermission.allowedActions || ['view'],
      createdAt: new Date(),
    };
    this.rolePermissions.set(id, rolePermission);
    return rolePermission;
  }

  async updateRolePermission(id: string, updateData: Partial<InsertRolePermission>): Promise<RolePermission | undefined> {
    const existing = this.rolePermissions.get(id);
    if (!existing) return undefined;

    const updated: RolePermission = {
      ...existing,
      ...updateData,
    };
    this.rolePermissions.set(id, updated);
    return updated;
  }

  async deleteRolePermission(id: string): Promise<boolean> {
    return this.rolePermissions.delete(id);
  }

  async setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[], viewScope?: string, viewableRoleIds?: string[] }[]): Promise<void> {
    const existingRolePermissions = Array.from(this.rolePermissions.values())
      .filter(rp => rp.roleId === roleId);
    
    for (const rp of existingRolePermissions) {
      this.rolePermissions.delete(rp.id);
    }

    for (const perm of permissions) {
      const rolePermission: RolePermission = {
        id: randomUUID(),
        roleId,
        permissionId: perm.permissionId,
        allowedActions: perm.allowedActions,
        viewScope: perm.viewScope || "own",
        viewableRoleIds: perm.viewableRoleIds || [],
        createdAt: new Date(),
      };
      this.rolePermissions.set(rolePermission.id, rolePermission);
    }
  }

  async getUserTimesheetViewScope(userId: string): Promise<{ viewScope: string; viewableRoleIds: string[] }> {
    return { viewScope: "own", viewableRoleIds: [] };
  }

  // User Project Access operations
  async getUserProjectAccess(userId: string): Promise<UserProjectAccess[]> {
    return Array.from(this.userProjectAccess.values())
      .filter(upa => upa.userId === userId);
  }

  async createUserProjectAccess(insertAccess: InsertUserProjectAccess): Promise<UserProjectAccess> {
    const id = randomUUID();
    const access: UserProjectAccess = {
      ...insertAccess,
      id,
      accessLevel: insertAccess.accessLevel || "view",
      grantedBy: insertAccess.grantedBy || null,
      createdAt: new Date(),
    };
    this.userProjectAccess.set(id, access);
    return access;
  }

  async updateUserProjectAccess(id: string, updateData: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined> {
    const existing = this.userProjectAccess.get(id);
    if (!existing) return undefined;

    const updated: UserProjectAccess = {
      ...existing,
      ...updateData,
    };
    this.userProjectAccess.set(id, updated);
    return updated;
  }

  async deleteUserProjectAccess(id: string): Promise<boolean> {
    return this.userProjectAccess.delete(id);
  }

  async getProjectTeamMembers(projectId: string): Promise<UserWithRole[]> {
    // Get all user IDs with access to this project
    const projectAccess = Array.from(this.userProjectAccess.values())
      .filter(upa => upa.projectId === projectId);
    
    const userIds = projectAccess.map(pa => pa.userId);
    
    // Get users with their roles
    const users = Array.from(this.users.values())
      .filter(user => userIds.includes(user.id) && user.isActive)
      .map(user => ({
        ...user,
        role: user.roleId ? this.userRoles.get(user.roleId) : undefined,
      }));
    
    return users;
  }

  async revokeProjectAccess(userId: string, projectId: string): Promise<boolean> {
    const existingAccess = Array.from(this.userProjectAccess.values())
      .find(upa => upa.userId === userId && upa.projectId === projectId);
    
    if (existingAccess) {
      return this.userProjectAccess.delete(existingAccess.id);
    }
    
    return false;
  }

  async grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess> {
    // Check if access already exists
    const existingAccess = Array.from(this.userProjectAccess.values())
      .find(upa => upa.userId === userId && upa.projectId === projectId);

    if (existingAccess) {
      // Update existing access
      const updated = await this.updateUserProjectAccess(existingAccess.id, { accessLevel, grantedBy });
      if (!updated) {
        throw new Error("Failed to update project access");
      }
      return updated;
    } else {
      // Create new access
      return await this.createUserProjectAccess({
        userId,
        projectId,
        accessLevel,
        grantedBy,
      });
    }
  }

  // User Invitation operations
  async getUserInvitations(status?: string): Promise<UserInvitation[]> {
    const allInvitations = Array.from(this.userInvitations.values());
    if (status) {
      return allInvitations.filter(invitation => invitation.status === status);
    }
    return allInvitations;
  }

  async getUserInvitationsByCompany(companyId: string, status?: string): Promise<UserInvitation[]> {
    const allInvitations = Array.from(this.userInvitations.values());
    return allInvitations.filter(invitation => {
      if (invitation.companyId !== companyId) return false;
      if (status && invitation.status !== status) return false;
      return true;
    });
  }

  async getUserInvitation(id: string): Promise<UserInvitation | undefined> {
    return this.userInvitations.get(id);
  }

  async getUserInvitationByToken(token: string): Promise<UserInvitation | undefined> {
    return Array.from(this.userInvitations.values())
      .find(invitation => invitation.inviteToken === token);
  }

  async createUserInvitation(insertInvitation: InsertUserInvitation): Promise<UserInvitation> {
    const id = randomUUID();
    const now = new Date();
    
    const invitation: UserInvitation = {
      ...insertInvitation,
      id,
      firstName: insertInvitation.firstName || null,
      lastName: insertInvitation.lastName || null,
      company: insertInvitation.company || null,
      phone: insertInvitation.phone || null,
      projectIds: insertInvitation.projectIds || [],
      inviteToken: insertInvitation.inviteToken || PasswordUtils.generateSecureToken(), // SECURITY: Generate cryptographically secure token
      expiresAt: insertInvitation.expiresAt || PasswordUtils.generateInviteExpiry(), // Set proper expiry
      acceptedAt: insertInvitation.acceptedAt || null,
      createdUserId: insertInvitation.createdUserId || null,
      status: insertInvitation.status || "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.userInvitations.set(id, invitation);
    return invitation;
  }

  async updateUserInvitation(id: string, updateData: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined> {
    const existing = this.userInvitations.get(id);
    if (!existing) return undefined;

    const updated: UserInvitation = {
      ...existing,
      ...updateData,
      updatedAt: new Date(),
    };
    this.userInvitations.set(id, updated);
    return updated;
  }

  async deleteUserInvitation(id: string): Promise<boolean> {
    return this.userInvitations.delete(id);
  }

  async acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined> {
    const invitation = await this.getUserInvitationByToken(token);
    
    // SECURITY: Validate token, status, and expiry
    if (!invitation || 
        invitation.status !== "pending" || 
        invitation.expiresAt < new Date()) {
      return undefined;
    }

    // SECURITY: Ensure password is provided and validate
    if (!userData.password) {
      throw new Error("Password is required to accept invitation");
    }

    // Normalize firstName/lastName: prefer user input, fall back to invitation values
    const normalizedFirstName = userData.firstName?.trim() || invitation.firstName || null;
    const normalizedLastName = userData.lastName?.trim() || invitation.lastName || null;

    // Create the user account with secure password handling
    const newUser = await this.createUser({
      username: userData.username || invitation.email,
      password: userData.password, // Will be hashed in createUser method
      email: invitation.email,
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      phone: invitation.phone,
      company: invitation.company,
      userCategory: invitation.userCategory as UserCategory,
      roleId: invitation.roleId,
      companyId: invitation.companyId, // CRITICAL: Assign user to the inviter's company
      isInvitePending: false,
      invitedBy: invitation.invitedBy,
      invitedAt: invitation.createdAt,
    });

    // Grant project access
    if (invitation.projectIds && Array.isArray(invitation.projectIds)) {
      for (const projectId of invitation.projectIds as string[]) {
        await this.grantProjectAccess(newUser.id, projectId, "view", invitation.invitedBy);
      }
    }

    // SECURITY: Mark invitation as used (single-use tokens)
    const updatedInvitation = await this.updateUserInvitation(invitation.id, {
      status: "accepted",
      acceptedAt: new Date(),
      createdUserId: newUser.id,
    });

    return { user: newUser, invitation: updatedInvitation! };
  }
  
  async createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date; requestedBy?: string }): Promise<void> {
    // MemStorage doesn't persist tokens, just log for dev purposes
    console.log(`[MemStorage] Password reset token created for user ${data.userId}`);
  }

  // Notes CRUD operations
  async getNotes(projectId?: string, companyId?: string, userId?: string): Promise<Note[]> {
    const allNotes = Array.from(this.notes.values());
    
    // Filter notes based on criteria
    let filtered = allNotes.filter(note => {
      // Filter by company if specified
      if (companyId) {
        // Check note's companyId directly if set
        if (note.companyId && note.companyId !== companyId) return false;
        // If no companyId on note, check via project
        if (!note.companyId && note.projectId) {
          const project = this.projects.get(note.projectId);
          if (!project || project.companyId !== companyId) return false;
        }
      }
      
      // Filter by projectId - strict filtering to prevent cross-project leakage
      if (projectId === null) {
        // null means business/company-wide notes only
        return note.projectId === null || note.projectId === undefined;
      } else if (projectId !== undefined) {
        // specific project - strictly filter to this project only
        // Do NOT apply assignee filter here to prevent cross-project leakage
        return note.projectId === projectId;
      } else if (userId) {
        // No project filter specified, but userId is provided
        // Filter by assignee for user-specific views (dashboard widgets, personal notes)
        return note.assigneeId === userId;
      }
      
      return true;
    });
    
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNote(id: string, companyId?: string): Promise<Note | undefined> {
    const note = this.notes.get(id);
    if (!note) return undefined;
    
    // If companyId is specified, verify the note's project belongs to that company
    if (companyId) {
      if (!note.projectId) return undefined;
      const project = this.projects.get(note.projectId);
      if (project?.companyId !== companyId) return undefined;
    }
    
    return note;
  }

  async getPersonalNotesByUser(userId: string, companyId: string): Promise<Note[]> {
    const allNotes = Array.from(this.notes.values());
    
    // Filter for personal notes owned by this user in this company
    const filtered = allNotes.filter(note => {
      // Must be owned by the specified user
      if (note.ownerId !== userId) return false;
      
      // Must be personal scope
      if (note.scope !== 'personal') return false;
      
      // Must belong to the same company (check via owner's company, not project)
      // In-memory storage limitation: we can't easily verify company here
      // In production (DbStorage), we'll properly filter by company
      return true;
    });
    
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createNote(insertNote: InsertNote): Promise<Note> {
    const id = randomUUID();
    const now = new Date();
    const note: Note = { 
      ...insertNote,
      id, 
      category: insertNote.category || "General",
      priority: insertNote.priority || "low",
      projectId: insertNote.projectId || null,
      type: insertNote.type || "note",
      status: insertNote.status || null,
      assigneeId: insertNote.assigneeId || null,
      assigneeName: insertNote.assigneeName || null,
      dueDate: insertNote.dueDate || null,
      completedAt: insertNote.completedAt || null,
      tags: insertNote.tags || [],
      customFields: insertNote.customFields || {},
      createdAt: now, 
      updatedAt: now 
    };
    this.notes.set(id, note);
    return note;
  }

  async updateNote(id: string, updateData: Partial<InsertNote>): Promise<Note | undefined> {
    const existingNote = this.notes.get(id);
    if (!existingNote) return undefined;

    const updatedNote: Note = {
      ...existingNote,
      ...updateData,
      updatedAt: new Date(),
    };
    this.notes.set(id, updatedNote);
    return updatedNote;
  }

  async deleteNote(id: string): Promise<boolean> {
    return this.notes.delete(id);
  }

  async archiveNote(id: string, userId: string): Promise<Note | undefined> {
    const existingNote = this.notes.get(id);
    if (!existingNote) return undefined;
    
    const archivedNote: Note = {
      ...existingNote,
      archivedAt: new Date(),
      archivedById: userId,
      updatedAt: new Date(),
    };
    this.notes.set(id, archivedNote);
    return archivedNote;
  }

  async unarchiveNote(id: string): Promise<Note | undefined> {
    const existingNote = this.notes.get(id);
    if (!existingNote) return undefined;
    
    const unarchivedNote: Note = {
      ...existingNote,
      archivedAt: null,
      archivedById: null,
      updatedAt: new Date(),
    };
    this.notes.set(id, unarchivedNote);
    return unarchivedNote;
  }

  // Note Groups CRUD operations
  async getNoteGroups(companyId: string, projectId?: string | null): Promise<NoteGroup[]> {
    const allGroups = Array.from(this.noteGroups.values());
    let filtered = allGroups.filter(g => g.companyId === companyId);
    
    if (projectId !== undefined) {
      filtered = filtered.filter(g => g.projectId === projectId);
    }
    
    return filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async getNoteGroup(id: string, companyId: string): Promise<NoteGroup | undefined> {
    const group = this.noteGroups.get(id);
    if (!group || group.companyId !== companyId) return undefined;
    return group;
  }

  async createNoteGroup(insertGroup: InsertNoteGroup): Promise<NoteGroup> {
    const id = randomUUID();
    const now = new Date();
    const group: NoteGroup = {
      ...insertGroup,
      id,
      description: insertGroup.description || null,
      sortOrder: insertGroup.sortOrder || 0,
      createdById: insertGroup.createdById || null,
      createdAt: now,
      updatedAt: now,
    };
    this.noteGroups.set(id, group);
    return group;
  }

  async updateNoteGroup(id: string, updateData: Partial<InsertNoteGroup>, companyId: string): Promise<NoteGroup | undefined> {
    const existingGroup = this.noteGroups.get(id);
    if (!existingGroup || existingGroup.companyId !== companyId) return undefined;

    const updatedGroup: NoteGroup = {
      ...existingGroup,
      ...updateData,
      updatedAt: new Date(),
    };
    this.noteGroups.set(id, updatedGroup);
    return updatedGroup;
  }

  async deleteNoteGroup(id: string, companyId: string): Promise<boolean> {
    const group = this.noteGroups.get(id);
    if (!group || group.companyId !== companyId) return false;
    
    // Remove group from all notes that have this group
    for (const [noteId, note] of this.notes) {
      if (note.groupId === id) {
        this.notes.set(noteId, { ...note, groupId: null });
      }
    }
    
    return this.noteGroups.delete(id);
  }

  async reorderNoteGroups(companyId: string, projectId: string | null, groupIds: string[]): Promise<NoteGroup[]> {
    const updatedGroups: NoteGroup[] = [];
    
    for (let i = 0; i < groupIds.length; i++) {
      const group = this.noteGroups.get(groupIds[i]);
      if (group && group.companyId === companyId && group.projectId === projectId) {
        const updatedGroup: NoteGroup = { ...group, sortOrder: i, updatedAt: new Date() };
        this.noteGroups.set(groupIds[i], updatedGroup);
        updatedGroups.push(updatedGroup);
      }
    }
    
    return updatedGroups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  // Custom Field Definitions CRUD
  async getCustomFieldDefs(): Promise<CustomFieldDef[]> {
    const allDefs = Array.from(this.customFieldDefs.values());
    return allDefs.filter(def => def.isActive).sort((a, b) => a.order - b.order);
  }

  async getCustomFieldDef(id: string): Promise<CustomFieldDef | undefined> {
    return this.customFieldDefs.get(id);
  }

  async createCustomFieldDef(insertFieldDef: InsertCustomFieldDef): Promise<CustomFieldDef> {
    // Enforce max 4 active custom fields
    const activeDefs = await this.getCustomFieldDefs();
    if (activeDefs.length >= 4) {
      throw new Error("Maximum of 4 custom fields allowed");
    }

    const id = randomUUID();
    const now = new Date();
    const fieldDef: CustomFieldDef = {
      ...insertFieldDef,
      id,
      type: insertFieldDef.type ?? "text",
      required: insertFieldDef.required ?? false,
      order: insertFieldDef.order ?? 0,
      isActive: insertFieldDef.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.customFieldDefs.set(id, fieldDef);
    return fieldDef;
  }

  async updateCustomFieldDef(id: string, updateData: Partial<InsertCustomFieldDef>): Promise<CustomFieldDef | undefined> {
    const existingDef = this.customFieldDefs.get(id);
    if (!existingDef) return undefined;

    const updatedDef: CustomFieldDef = {
      ...existingDef,
      ...updateData,
      updatedAt: new Date(),
    };
    this.customFieldDefs.set(id, updatedDef);
    return updatedDef;
  }

  async deleteCustomFieldDef(id: string): Promise<boolean> {
    const fieldDef = this.customFieldDefs.get(id);
    if (!fieldDef) return false;

    // Soft delete by setting isActive to false
    const updatedDef: CustomFieldDef = {
      ...fieldDef,
      isActive: false,
      updatedAt: new Date(),
    };
    this.customFieldDefs.set(id, updatedDef);

    // Also deactivate all related options
    const relatedOptions = Array.from(this.customFieldOptions.values())
      .filter(option => option.fieldDefId === id);
    
    for (const option of relatedOptions) {
      const updatedOption: CustomFieldOption = {
        ...option,
        isActive: false,
      };
      this.customFieldOptions.set(option.id, updatedOption);
    }

    return true;
  }

  // Custom Field Options CRUD
  async getCustomFieldOptions(fieldDefId: string): Promise<CustomFieldOption[]> {
    const allOptions = Array.from(this.customFieldOptions.values());
    return allOptions
      .filter(option => option.fieldDefId === fieldDefId && option.isActive)
      .sort((a, b) => a.order - b.order);
  }

  async getCustomFieldOption(id: string): Promise<CustomFieldOption | undefined> {
    return this.customFieldOptions.get(id);
  }

  async createCustomFieldOption(insertOption: InsertCustomFieldOption): Promise<CustomFieldOption> {
    const id = randomUUID();
    const option: CustomFieldOption = {
      ...insertOption,
      id,
      order: insertOption.order ?? 0,
      color: insertOption.color ?? null,
      isActive: insertOption.isActive ?? true,
      createdAt: new Date(),
    };
    this.customFieldOptions.set(id, option);
    return option;
  }

  async updateCustomFieldOption(id: string, updateData: Partial<InsertCustomFieldOption>): Promise<CustomFieldOption | undefined> {
    const existingOption = this.customFieldOptions.get(id);
    if (!existingOption) return undefined;

    const updatedOption: CustomFieldOption = {
      ...existingOption,
      ...updateData,
    };
    this.customFieldOptions.set(id, updatedOption);
    return updatedOption;
  }

  async deleteCustomFieldOption(id: string): Promise<boolean> {
    const option = this.customFieldOptions.get(id);
    if (!option) return false;

    // Soft delete by setting isActive to false
    const updatedOption: CustomFieldOption = {
      ...option,
      isActive: false,
    };
    this.customFieldOptions.set(id, updatedOption);
    return true;
  }

  // Note Templates CRUD
  noteTemplateFields: Map<string, NoteTemplateField> = new Map();

  async getNoteTemplates(companyId: string): Promise<NoteTemplate[]> {
    const allTemplates = Array.from(this.noteTemplates.values());
    return allTemplates
      .filter(template => template.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNoteTemplate(id: string, companyId: string): Promise<NoteTemplate | undefined> {
    const template = this.noteTemplates.get(id);
    if (!template || template.companyId !== companyId) return undefined;
    return template;
  }

  async getNoteTemplateWithFields(id: string, companyId: string): Promise<{ template: NoteTemplate; fields: NoteTemplateField[] } | undefined> {
    const template = await this.getNoteTemplate(id, companyId);
    if (!template) return undefined;
    const fields = await this.getNoteTemplateFields(id);
    return { template, fields };
  }

  async createNoteTemplate(insertTemplate: InsertNoteTemplate): Promise<NoteTemplate> {
    const id = randomUUID();
    const now = new Date();
    const template: NoteTemplate = {
      ...insertTemplate,
      id,
      description: insertTemplate.description ?? null,
      defaultTitle: insertTemplate.defaultTitle ?? null,
      contentHtml: insertTemplate.contentHtml ?? null,
      contentText: insertTemplate.contentText ?? null,
      ownerId: insertTemplate.ownerId ?? null,
      ownerName: insertTemplate.ownerName ?? null,
      isPublic: insertTemplate.isPublic ?? false,
      isFormBased: insertTemplate.isFormBased ?? false,
      isActive: insertTemplate.isActive ?? true,
      visibleToRoles: insertTemplate.visibleToRoles ?? [],
      defaultCustomFields: insertTemplate.defaultCustomFields ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.noteTemplates.set(id, template);
    return template;
  }

  async updateNoteTemplate(id: string, updateData: Partial<InsertNoteTemplate>, companyId: string): Promise<NoteTemplate | undefined> {
    const existingTemplate = this.noteTemplates.get(id);
    if (!existingTemplate || existingTemplate.companyId !== companyId) return undefined;

    const updatedTemplate: NoteTemplate = {
      ...existingTemplate,
      ...updateData,
      updatedAt: new Date(),
    };
    this.noteTemplates.set(id, updatedTemplate);
    return updatedTemplate;
  }

  async deleteNoteTemplate(id: string, companyId: string): Promise<boolean> {
    const template = this.noteTemplates.get(id);
    if (!template || template.companyId !== companyId) return false;
    return this.noteTemplates.delete(id);
  }

  // Note Template Fields CRUD
  async getNoteTemplateFields(templateId: string): Promise<NoteTemplateField[]> {
    const allFields = Array.from(this.noteTemplateFields.values());
    return allFields
      .filter(field => field.templateId === templateId)
      .sort((a, b) => a.order - b.order);
  }

  async createNoteTemplateField(insertField: InsertNoteTemplateField): Promise<NoteTemplateField> {
    const id = randomUUID();
    const now = new Date();
    const field: NoteTemplateField = {
      ...insertField,
      id,
      description: insertField.description ?? null,
      placeholder: insertField.placeholder ?? null,
      defaultValue: insertField.defaultValue ?? null,
      options: insertField.options ?? [],
      required: insertField.required ?? false,
      order: insertField.order ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.noteTemplateFields.set(id, field);
    return field;
  }

  async updateNoteTemplateField(id: string, updateData: Partial<InsertNoteTemplateField>): Promise<NoteTemplateField | undefined> {
    const existingField = this.noteTemplateFields.get(id);
    if (!existingField) return undefined;

    const updatedField: NoteTemplateField = {
      ...existingField,
      ...updateData,
      updatedAt: new Date(),
    };
    this.noteTemplateFields.set(id, updatedField);
    return updatedField;
  }

  async deleteNoteTemplateField(id: string): Promise<boolean> {
    return this.noteTemplateFields.delete(id);
  }

  async reorderNoteTemplateFields(templateId: string, fieldIds: string[]): Promise<NoteTemplateField[]> {
    const fields = await this.getNoteTemplateFields(templateId);
    const reorderedFields: NoteTemplateField[] = [];
    
    for (let i = 0; i < fieldIds.length; i++) {
      const field = fields.find(f => f.id === fieldIds[i]);
      if (field) {
        const updatedField = { ...field, order: i, updatedAt: new Date() };
        this.noteTemplateFields.set(field.id, updatedField);
        reorderedFields.push(updatedField);
      }
    }
    
    return reorderedFields;
  }

  // Tasks CRUD operations
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    
    let filteredTasks = allTasks;
    
    if (businessTasks) {
      // Business tasks: use new taskContextType='business' or fallback to legacy (null projectId)
      filteredTasks = filteredTasks.filter(task => 
        task.taskContextType === "business" || 
        (!task.taskContextType && !task.projectId)
      );
    } else if (projectId) {
      // Project tasks: use new taskContextType='project' and matching contextId, or legacy projectId
      filteredTasks = filteredTasks.filter(task => 
        (task.taskContextType === "project" && task.taskContextId === projectId) ||
        (!task.taskContextType && task.projectId === projectId)
      );
    }
    
    if (assigneeId) {
      filteredTasks = filteredTasks.filter(task => 
        task.assigneeId === assigneeId || 
        (task.assignedTo && task.assignedTo.includes(assigneeId)) ||
        (task.assigneeType === "user" && task.assigneeUserId === assigneeId)
      );
    }
    
    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    
    // Apply date range filtering if provided
    if (dateRange?.startDate || dateRange?.endDate) {
      const rangeStart = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
      const rangeEnd = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;
      
      filteredTasks = filteredTasks.filter(task => {
        if (!task.dueDate) return false; // Skip tasks without due dates when date filtering
        const taskDate = new Date(task.dueDate).getTime();
        return taskDate >= rangeStart && taskDate <= rangeEnd;
      });
    }
    
    return filteredTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTasksByCompany(companyId: string): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    return allTasks.filter(task => task.companyId === companyId);
  }

  async getTasksByUser(userId: string, companyId: string): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    
    const userTasks = allTasks.filter(task => {
      // Check if user is assigned (via assigneeId or assignedTo array)
      const isAssigned = task.assigneeId === userId || 
        (Array.isArray(task.assignedTo) && task.assignedTo.includes(userId));
      if (!isAssigned) return false;
      
      // Verify task belongs to the company
      if (task.companyId !== companyId) return false;
      
      // Business-level tasks - always include if assigned
      if (task.taskContextType === "business" || (!task.taskContextType && !task.projectId)) {
        return true;
      }
      
      // Project-level tasks - verify project belongs to company
      const projectId = task.taskContextId || task.projectId;
      if (!projectId) return false;
      const project = this.projects.get(projectId);
      return project?.companyId === companyId;
    });
    
    return userTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTask(id: string): Promise<Task | undefined> {
    const note = this.notes.get(id);
    if (note && note.type === "task") {
      return note as Task;
    }
    return undefined;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const id = randomUUID();
    const now = new Date();
    
    // Enforce polymorphic context - derive from projectId if not provided
    let taskContextType = insertTask.taskContextType;
    let taskContextId = insertTask.taskContextId;
    
    if (!taskContextType) {
      if (insertTask.projectId) {
        taskContextType = "project";
        taskContextId = insertTask.projectId;
      } else if (insertTask.companyId) {
        taskContextType = "business";
        taskContextId = insertTask.companyId;
      }
    }
    
    // Strict enforcement: reject task creation if context cannot be resolved
    if (!taskContextType || !taskContextId) {
      throw new Error('[createTask] Cannot create task without valid context - either projectId or companyId must be provided');
    }
    
    const task: Task = { 
      ...insertTask,
      id,
      type: "task",
      category: insertTask.category || "General",
      priority: insertTask.priority || "low",
      status: insertTask.status || "todo",
      projectId: insertTask.projectId || null,
      tags: insertTask.tags || [],
      customFields: insertTask.customFields || {},
      taskContextType,
      taskContextId,
      createdAt: now, 
      updatedAt: now 
    };
    this.notes.set(id, task);
    return task;
  }

  async updateTask(id: string, updateData: Partial<InsertTask>): Promise<Task | undefined> {
    const existingTask = await this.getTask(id);
    if (!existingTask) return undefined;

    const now = new Date();
    const updatedTask: Task = {
      ...existingTask,
      ...updateData,
      updatedAt: now,
      // Handle completion timestamp
      completedAt: updateData.status === "done" && existingTask.status !== "done" 
        ? now 
        : updateData.status !== "done" 
          ? null 
          : existingTask.completedAt
    };
    this.notes.set(id, updatedTask);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.getTask(id);
    if (!task) return false;
    return this.notes.delete(id);
  }

  async updateTaskStatus(id: string, status: "todo" | "in-progress" | "done"): Promise<Task | undefined> {
    return this.updateTask(id, { status } as Partial<InsertTask>);
  }

  // Projects CRUD operations
  async getProjects(ownerId?: string): Promise<Project[]> {
    try {
      let query = db.select().from(schema.projects);
      
      if (ownerId) {
        query = query.where(
          and(
            eq(schema.projects.isActive, true),
            eq(schema.projects.ownerId, ownerId)
          )
        );
      } else {
        query = query.where(eq(schema.projects.isActive, true));
      }
      
      const projects = await query.orderBy(schema.projects.createdAt);
      return projects;
    } catch (error) {
      console.error("Database error in getProjects:", error);
      // Fallback to memory
      const allProjects = Array.from(this.projects.values())
        .filter(project => project.isActive);
      
      if (ownerId) {
        return allProjects.filter(project => 
          project.ownerId === ownerId
        ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
      return allProjects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    try {
      console.log(`getProject: Looking for project with id: ${id}`);
      const result = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
      console.log(`getProject: Database returned ${result.length} results:`, result);
      return result[0];
    } catch (error) {
      console.error("Database error in getProject:", error);
      return this.projects.get(id);
    }
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
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
      updatedAt: now,
    };

    try {
      // First persist to database
      await db.insert(schema.projects).values(project);
      console.log(`createProject: Successfully saved project ${project.name} to database`);
    } catch (error) {
      console.error("Database error in createProject:", error);
      // If database fails, still store in memory as fallback
    }
    
    // Always store in memory for fallback
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    // First try to get from memory, if not found try database
    let existingProject = this.projects.get(id);
    if (!existingProject) {
      const dbProjects = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
      if (dbProjects.length === 0) return undefined;
      existingProject = dbProjects[0];
    }

    const updatedProject: Project = {
      ...existingProject,
      ...updateData,
      updatedAt: new Date(),
    };

    try {
      // Update in database first
      await db.update(schema.projects)
        .set({
          ...updateData,
          updatedAt: updatedProject.updatedAt,
        })
        .where(eq(schema.projects.id, id));
      console.log(`updateProject: Successfully updated project ${id} in database`);
    } catch (error) {
      console.error("Database error in updateProject:", error);
      // Continue with memory update as fallback
    }
    
    // Always update in memory for fast access
    this.projects.set(id, updatedProject);
    return updatedProject;
  }

  async deleteProject(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }

  // Task Views CRUD operations
  async getTaskViews(companyId: string, userId?: string): Promise<TaskView[]> {
    const views = Array.from(this.taskViews.values())
      .filter(view => {
        if (view.companyId !== companyId) return false;
        if (userId && view.userId !== userId) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return views;
  }

  async getTaskView(id: string, companyId: string): Promise<TaskView | undefined> {
    const view = this.taskViews.get(id);
    return view && view.companyId === companyId ? view : undefined;
  }

  async createTaskView(insertTaskView: InsertTaskView, userId: string, companyId: string): Promise<TaskView> {
    const id = randomUUID();
    const now = new Date();
    const taskView: TaskView = {
      id,
      userId,
      companyId,
      name: insertTaskView.name,
      viewType: insertTaskView.viewType || "board",
      filters: insertTaskView.filters || {},
      groupBy: insertTaskView.groupBy || "none",
      columnConfig: insertTaskView.columnConfig || {},
      isDefault: insertTaskView.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.taskViews.set(id, taskView);
    return taskView;
  }

  async updateTaskView(id: string, updateData: Partial<InsertTaskView>, companyId: string): Promise<TaskView | undefined> {
    const view = this.taskViews.get(id);
    if (!view || view.companyId !== companyId) {
      return undefined;
    }

    const updatedView: TaskView = {
      ...view,
      ...updateData,
      id: view.id,
      userId: view.userId,
      companyId: view.companyId,
      updatedAt: new Date(),
    };
    this.taskViews.set(id, updatedView);
    return updatedView;
  }

  async deleteTaskView(id: string, companyId: string): Promise<boolean> {
    const view = this.taskViews.get(id);
    if (!view || view.companyId !== companyId) {
      return false;
    }
    return this.taskViews.delete(id);
  }

  async reorderTaskViews(viewIds: string[], companyId: string): Promise<void> {
    viewIds.forEach((id, index) => {
      const view = this.taskViews.get(id);
      if (view && view.companyId === companyId) {
        this.taskViews.set(id, { ...view, sortOrder: index });
      }
    });
  }

  // Subtasks operations
  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task" && note.parentTaskId === parentTaskId) as Task[];
    
    return allTasks.sort((a, b) => (a.subtaskOrder || 0) - (b.subtaskOrder || 0));
  }

  async createSubtask(parentTaskId: string, insertTask: InsertTask): Promise<Task> {
    // Check if parent task exists
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      throw new Error("Parent task not found");
    }

    // Get next subtask order
    const existingSubtasks = await this.getSubtasks(parentTaskId);
    const nextOrder = existingSubtasks.length;

    const id = randomUUID();
    const now = new Date();
    const subtask: Task = {
      ...insertTask,
      id,
      type: "task",
      parentTaskId,
      subtaskOrder: nextOrder,
      category: insertTask.category || "General",
      priority: insertTask.priority || "low",
      status: insertTask.status || "todo",
      projectId: insertTask.projectId || parentTask.projectId, // Inherit parent's project
      tags: insertTask.tags || [],
      customFields: insertTask.customFields || {},
      createdAt: now,
      updatedAt: now,
    };
    this.notes.set(id, subtask);
    return subtask;
  }

  // Estimates CRUD operations
  async getEstimates(projectId?: string): Promise<Estimate[]> {
    try {
      // Read from database for persistent data
      let query = db.select().from(schema.estimates);
      if (projectId) {
        query = query.where(eq(schema.estimates.projectId, projectId));
      }
      const estimates = await query.orderBy(schema.estimates.updatedAt);
      return estimates;
    } catch (error) {
      console.error("Database error in getEstimates:", error);
      // Fallback to memory storage
      let estimates = Array.from(this.estimates.values());
      if (projectId) {
        estimates = estimates.filter(estimate => estimate.projectId === projectId);
      }
      return estimates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
  }

  async getEstimate(id: string): Promise<Estimate | undefined> {
    try {
      const result = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getEstimate:", error);
      return this.estimates.get(id);
    }
  }

  async createEstimate(insertEstimate: InsertEstimate): Promise<Estimate> {
    try {
      // Get default status from field settings if not provided
      let defaultStatus = "draft";
      if (!insertEstimate.status) {
        const statusCategory = await this.getFieldCategoryByKey('estimate.status');
        if (statusCategory) {
          const statusOptions = await db.select().from(schema.fieldOptions)
            .where(and(
              eq(schema.fieldOptions.categoryId, statusCategory.id),
              eq(schema.fieldOptions.isDefault, true)
            ))
            .limit(1);
          if (statusOptions.length > 0) {
            defaultStatus = statusOptions[0].key;
          }
        }
      }

      const estimate = {
        ...insertEstimate,
        status: insertEstimate.status || defaultStatus,
        version: 1,
        isLocked: false,
      };
      
      const result = await db.insert(schema.estimates).values(estimate).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimate:", error);
      // Fallback to memory
      const id = randomUUID();
      const now = new Date();
      const memEstimate: Estimate = {
        ...insertEstimate,
        id,
        status: insertEstimate.status || "draft",
        ownerId: insertEstimate.ownerId ?? null,
        ownerName: insertEstimate.ownerName ?? null,
        assigneeIds: insertEstimate.assigneeIds ?? [],
        projectMarkupPercent: insertEstimate.projectMarkupPercent ?? null,
        taxRate: insertEstimate.taxRate ?? null,
        notes: insertEstimate.notes ?? null,
        version: 1,
        isLocked: false,
        createdAt: now,
        updatedAt: now,
      };
      this.estimates.set(id, memEstimate);
      return memEstimate;
    }
  }

  async updateEstimate(id: string, updateEstimate: Partial<InsertEstimate>): Promise<Estimate | undefined> {
    try {
      // First get the existing estimate to check locking
      const estimate = await this.getEstimate(id);
      if (!estimate) {
        return undefined;
      }
      
      // Enforce locking - prevent updates to locked estimates
      if (estimate.isLocked) {
        throw new Error("Cannot update locked estimate. Unlock the estimate first.");
      }
      
      // Prevent direct changes to version or isLocked through generic update
      const sanitizedUpdate = { ...updateEstimate };
      delete sanitizedUpdate.version;
      delete sanitizedUpdate.isLocked;
      
      const result = await db.update(schema.estimates)
        .set({ ...sanitizedUpdate, updatedAt: new Date() })
        .where(eq(schema.estimates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimate:", error);
      // Fallback to memory
      const estimate = this.estimates.get(id);
      if (!estimate) {
        return undefined;
      }
      
      if (estimate.isLocked) {
        throw new Error("Cannot update locked estimate. Unlock the estimate first.");
      }
      
      const sanitizedUpdate = { ...updateEstimate };
      delete sanitizedUpdate.version;
      delete sanitizedUpdate.isLocked;
      
      const updatedEstimate: Estimate = {
        ...estimate,
        ...sanitizedUpdate,
        updatedAt: new Date(),
      };
      this.estimates.set(id, updatedEstimate);
      return updatedEstimate;
    }
  }

  async deleteEstimate(id: string): Promise<boolean> {
    const estimate = await this.getEstimate(id);
    if (!estimate) {
      return false;
    }

    // Check if estimate is locked
    if (estimate.isLocked) {
      throw new Error("Cannot delete locked estimate. Unlock the estimate first.");
    }

    // Delete all associated estimate groups and items first
    const groups = await this.getEstimateGroups(id);
    const items = await this.getEstimateItems(id);
    
    // Delete items first (without lock checks since we're deleting the parent)
    for (const item of items) {
      this.estimateItems.delete(item.id);
    }
    
    // Delete groups
    for (const group of groups) {
      this.estimateGroups.delete(group.id);
    }
    
    return this.estimates.delete(id);
  }

  // Estimate Items CRUD operations
  async getEstimateItems(estimateId: string): Promise<EstimateItem[]> {
    try {
      const items = await db.select().from(schema.estimateItems)
        .where(eq(schema.estimateItems.estimateId, estimateId))
        .orderBy(schema.estimateItems.order);
      return items;
    } catch (error) {
      console.error("Database error in getEstimateItems:", error);
      // Fallback to memory
      const items = Array.from(this.estimateItems.values())
        .filter(item => item.estimateId === estimateId);
      return items.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  }

  async getEstimateItem(id: string): Promise<EstimateItem | undefined> {
    try {
      const result = await db.select().from(schema.estimateItems)
        .where(eq(schema.estimateItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getEstimateItem:", error);
      return this.estimateItems.get(id);
    }
  }

  async createEstimateItem(insertItem: InsertEstimateItem): Promise<EstimateItem> {
    // Check if parent estimate is locked
    const estimate = await this.getEstimate(insertItem.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot create item in locked estimate. Unlock the estimate first.");
    }
    
    // Calculate tax amount and price inc tax if not provided
    const unitCostExTax = insertItem.unitCostExTax || 0;
    const taxRate = estimate?.taxRate || 10; // Default 10% GST
    const taxAmount = Math.round(unitCostExTax * taxRate / 100);
    const priceIncTax = unitCostExTax + taxAmount;
    
    try {
      const estimateItem = {
        ...insertItem,
        taxAmount,
        priceIncTax,
        type: insertItem.type || "Material",
        status: insertItem.status || "pending",
        order: insertItem.order || 0,
      };
      
      const result = await db.insert(schema.estimateItems).values(estimateItem).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimateItem:", error);
      // Fallback to memory
      const id = randomUUID();
      const now = new Date();
      const memItem: EstimateItem = {
        ...insertItem,
        id,
        description: insertItem.description ?? null,
        type: insertItem.type || "Material",
        status: insertItem.status || "pending",
        order: insertItem.order || 0,
        notes: insertItem.notes ?? null,
        groupId: insertItem.groupId ?? null,
        parentItemId: insertItem.parentItemId ?? null,
        costCode: insertItem.costCode ?? null,
        allowance: insertItem.allowance ?? null,
        markupPercent: insertItem.markupPercent ?? null,
        attachmentUrl: insertItem.attachmentUrl ?? null,
        requestForQuote: insertItem.requestForQuote ?? false,
        isSelection: insertItem.isSelection ?? false,
        proposalVisible: insertItem.proposalVisible ?? true,
        shownAs: insertItem.shownAs ?? null,
        taxAmount,
        priceIncTax,
        createdAt: now,
        updatedAt: now,
      };
      this.estimateItems.set(id, memItem);
      return memItem;
    }
  }

  async bulkCreateEstimateItems(insertItems: InsertEstimateItem[]): Promise<EstimateItem[]> {
    if (insertItems.length === 0) {
      return [];
    }

    // Check if parent estimate is locked (use first item's estimateId)
    const firstEstimateId = insertItems[0].estimateId;
    const estimate = await this.getEstimate(firstEstimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot create items in locked estimate. Unlock the estimate first.");
    }

    const taxRate = estimate?.taxRate || 10; // Default 10% GST
    
    // Prepare all items with calculated tax
    const preparedItems = insertItems.map(insertItem => {
      const unitCostExTax = insertItem.unitCostExTax || 0;
      const taxAmount = Math.round(unitCostExTax * taxRate / 100);
      const priceIncTax = unitCostExTax + taxAmount;
      
      return {
        ...insertItem,
        taxAmount,
        priceIncTax,
        type: insertItem.type || "Material",
        status: insertItem.status || "incomplete",
        order: insertItem.order || 0,
      };
    });

    try {
      const result = await db.insert(schema.estimateItems).values(preparedItems).returning();
      return result;
    } catch (error) {
      console.error("Database error in bulkCreateEstimateItems:", error);
      // Fallback to memory
      const createdItems: EstimateItem[] = [];
      const now = new Date();
      
      for (const item of preparedItems) {
        const id = randomUUID();
        const memItem: EstimateItem = {
          ...item,
          id,
          description: item.description ?? null,
          notes: item.notes ?? null,
          groupId: item.groupId ?? null,
          parentItemId: item.parentItemId ?? null,
          costCode: item.costCode ?? null,
          allowance: item.allowance ?? null,
          markupPercent: item.markupPercent ?? null,
          attachmentUrl: item.attachmentUrl ?? null,
          requestForQuote: item.requestForQuote ?? false,
          isSelection: item.isSelection ?? false,
          proposalVisible: item.proposalVisible ?? true,
          shownAs: item.shownAs ?? null,
          createdAt: now,
          updatedAt: now,
        };
        this.estimateItems.set(id, memItem);
        createdItems.push(memItem);
      }
      
      return createdItems;
    }
  }

  async updateEstimateItem(id: string, updateItem: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined> {
    const item = this.estimateItems.get(id);
    if (!item) {
      return undefined;
    }
    
    // Check if parent estimate is locked
    const estimate = await this.getEstimate(item.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot update item in locked estimate. Unlock the estimate first.");
    }
    
    const updatedItem: EstimateItem = {
      ...item,
      ...updateItem,
      updatedAt: new Date(),
    };
    
    // Recalculate tax if price changed
    if (updateItem.unitCostExTax !== undefined) {
      const taxRate = estimate?.taxRate || 10;
      updatedItem.taxAmount = Math.round(updatedItem.unitCostExTax * taxRate / 100);
      updatedItem.priceIncTax = updatedItem.unitCostExTax + updatedItem.taxAmount;
    }
    
    this.estimateItems.set(id, updatedItem);
    return updatedItem;
  }

  async deleteEstimateItem(id: string): Promise<boolean> {
    const item = this.estimateItems.get(id);
    if (!item) {
      return false;
    }

    // Check if parent estimate is locked
    const estimate = await this.getEstimate(item.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot delete item in locked estimate. Unlock the estimate first.");
    }

    return this.estimateItems.delete(id);
  }

  async verifyEstimateItemsOwnership(itemIds: string[], companyId: string): Promise<{ authorized: boolean; invalidItemId?: string }> {
    // In-memory version: check each item's ownership chain
    for (const itemId of itemIds) {
      const item = this.estimateItems.get(itemId);
      if (!item) {
        return { authorized: false, invalidItemId: itemId };
      }

      const estimate = this.estimates.get(item.estimateId);
      if (!estimate) {
        return { authorized: false, invalidItemId: itemId };
      }

      const project = this.projects.get(estimate.projectId);
      if (!project || project.companyId !== companyId) {
        return { authorized: false, invalidItemId: itemId };
      }
    }

    return { authorized: true };
  }

  async getProjectAllowances(projectId: string): Promise<any[]> {
    // Get all estimates for this project
    const estimates = Array.from(this.estimates.values())
      .filter(e => e.projectId === projectId);
    
    const estimateIds = estimates.map(e => e.id);
    if (estimateIds.length === 0) return [];
    
    // Get all PC/PS items from these estimates
    const allowanceItems = Array.from(this.estimateItems.values())
      .filter(item => 
        estimateIds.includes(item.estimateId) && 
        (item.allowance === "Prime Cost" || item.allowance === "Provisional Sum")
      );
    
    // For each item, calculate actual costs from bills and timesheets
    const allowancesWithCosts = allowanceItems.map(item => {
      const estimate = estimates.find(e => e.id === item.estimateId);
      
      // Since we don't have bill/timesheet allocations in memory, return 0 for now
      const actualCost = 0;
      const variance = actualCost - (item.priceIncTax || 0);
      
      return {
        item: {
          ...item,
          estimateName: estimate?.name || "Unknown",
          estimateVersion: estimate?.version || 1,
        },
        actualCost,
        variance,
      };
    });
    
    return allowancesWithCosts;
  }

  // Estimate Groups CRUD operations
  async getEstimateGroups(estimateId: string): Promise<EstimateGroup[]> {
    const groups = Array.from(this.estimateGroups.values())
      .filter(group => group.estimateId === estimateId);
    return groups.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  async getEstimateGroup(id: string): Promise<EstimateGroup | undefined> {
    return this.estimateGroups.get(id);
  }

  async createEstimateGroup(insertGroup: InsertEstimateGroup): Promise<EstimateGroup> {
    // Check if parent estimate is locked
    const estimate = await this.getEstimate(insertGroup.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot create group in locked estimate. Unlock the estimate first.");
    }

    const id = randomUUID();
    const now = new Date();
    const group: EstimateGroup = {
      ...insertGroup,
      id,
      description: insertGroup.description ?? null,
      order: insertGroup.order || 0,
      isCollapsed: insertGroup.isCollapsed ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.estimateGroups.set(id, group);
    return group;
  }

  async updateEstimateGroup(id: string, updateGroup: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined> {
    const group = this.estimateGroups.get(id);
    if (!group) {
      return undefined;
    }

    // Check if parent estimate is locked
    const estimate = await this.getEstimate(group.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot update group in locked estimate. Unlock the estimate first.");
    }

    const updatedGroup: EstimateGroup = {
      ...group,
      ...updateGroup,
      updatedAt: new Date(),
    };
    this.estimateGroups.set(id, updatedGroup);
    return updatedGroup;
  }

  async deleteEstimateGroup(id: string): Promise<boolean> {
    const group = this.estimateGroups.get(id);
    if (!group) {
      return false;
    }

    // Check if parent estimate is locked
    const estimate = await this.getEstimate(group.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot delete group in locked estimate. Unlock the estimate first.");
    }

    // Remove group reference from all items in this group
    const items = Array.from(this.estimateItems.values())
      .filter(item => item.groupId === id);
    for (const item of items) {
      const updatedItem = { ...item, groupId: null, updatedAt: new Date() };
      this.estimateItems.set(item.id, updatedItem);
    }

    return this.estimateGroups.delete(id);
  }

  async duplicateEstimateGroup(id: string): Promise<EstimateGroup> {
    const group = this.estimateGroups.get(id);
    if (!group) {
      throw new Error("Group not found");
    }

    // Check if parent estimate is locked
    const estimate = await this.getEstimate(group.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot duplicate group in locked estimate. Unlock the estimate first.");
    }

    // Create duplicate with new ID
    const newGroup: EstimateGroup = {
      ...group,
      id: crypto.randomUUID(),
      name: `${group.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.estimateGroups.set(newGroup.id, newGroup);

    // Duplicate all items in this group
    const items = Array.from(this.estimateItems.values())
      .filter(item => item.groupId === id);
    
    for (const item of items) {
      const newItem: EstimateItem = {
        ...item,
        id: crypto.randomUUID(),
        groupId: newGroup.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.estimateItems.set(newItem.id, newItem);
    }

    return newGroup;
  }

  async copyGroupToEstimate(groupId: string, targetEstimateId: string): Promise<EstimateGroup> {
    const group = this.estimateGroups.get(groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    // Check if target estimate exists and is not locked
    const targetEstimate = await this.getEstimate(targetEstimateId);
    if (!targetEstimate) {
      throw new Error("Target estimate not found");
    }
    if (targetEstimate.isLocked) {
      throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
    }

    // Create copy in target estimate
    const newGroup: EstimateGroup = {
      ...group,
      id: crypto.randomUUID(),
      estimateId: targetEstimateId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.estimateGroups.set(newGroup.id, newGroup);

    // Copy all items in this group to target estimate
    const items = Array.from(this.estimateItems.values())
      .filter(item => item.groupId === groupId);
    
    for (const item of items) {
      const newItem: EstimateItem = {
        ...item,
        id: crypto.randomUUID(),
        estimateId: targetEstimateId,
        groupId: newGroup.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.estimateItems.set(newItem.id, newItem);
    }

    return newGroup;
  }

  async duplicateEstimateItem(id: string): Promise<EstimateItem> {
    const item = this.estimateItems.get(id);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check if parent estimate is locked
    const estimate = await this.getEstimate(item.estimateId);
    if (estimate?.isLocked) {
      throw new Error("Cannot duplicate item in locked estimate. Unlock the estimate first.");
    }

    // Create duplicate with new ID
    const newItem: EstimateItem = {
      ...item,
      id: crypto.randomUUID(),
      name: `${item.name} (Copy)`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.estimateItems.set(newItem.id, newItem);
    return newItem;
  }

  async copyItemToEstimate(itemId: string, targetEstimateId: string): Promise<EstimateItem> {
    const item = this.estimateItems.get(itemId);
    if (!item) {
      throw new Error("Item not found");
    }

    // Check if target estimate exists and is not locked
    const targetEstimate = await this.getEstimate(targetEstimateId);
    if (!targetEstimate) {
      throw new Error("Target estimate not found");
    }
    if (targetEstimate.isLocked) {
      throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
    }

    // Create copy in target estimate (without group assignment)
    const newItem: EstimateItem = {
      ...item,
      id: crypto.randomUUID(),
      estimateId: targetEstimateId,
      groupId: null, // Don't assign to a group in target estimate
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.estimateItems.set(newItem.id, newItem);
    return newItem;
  }

  // Cost Categories CRUD operations (company-specific)
  async getCostCategories(companyId: string): Promise<CostCategory[]> {
    const categories = Array.from(this.costCategories.values())
      .filter(category => category.isActive && category.companyId === companyId);
    return categories.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async getCostCategory(id: string, companyId: string): Promise<CostCategory | undefined> {
    const category = this.costCategories.get(id);
    return category && category.companyId === companyId ? category : undefined;
  }

  async createCostCategory(insertCategory: InsertCostCategory): Promise<CostCategory> {
    const id = randomUUID();
    const now = new Date();
    const category: CostCategory = {
      ...insertCategory,
      id,
      isActive: insertCategory.isActive ?? true,
      sortOrder: insertCategory.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.costCategories.set(id, category);
    return category;
  }

  async updateCostCategory(id: string, updateCategory: Partial<InsertCostCategory>, companyId: string): Promise<CostCategory | undefined> {
    const category = this.costCategories.get(id);
    if (!category || category.companyId !== companyId) {
      return undefined;
    }

    const updatedCategory: CostCategory = {
      ...category,
      ...updateCategory,
      updatedAt: new Date(),
    };
    this.costCategories.set(id, updatedCategory);
    return updatedCategory;
  }

  async deleteCostCategory(id: string, companyId: string): Promise<boolean> {
    const category = this.costCategories.get(id);
    if (!category || category.companyId !== companyId) {
      return false;
    }
    return this.costCategories.delete(id);
  }

  async archiveCostCategory(id: string, companyId: string): Promise<CostCategory | undefined> {
    const category = this.costCategories.get(id);
    if (!category || category.companyId !== companyId) {
      return undefined;
    }

    const updatedCategory: CostCategory = {
      ...category,
      isActive: false,
    };

    this.costCategories.set(id, updatedCategory);
    return updatedCategory;
  }

  async mergeCostCategories(sourceId: string, targetId: string, companyId: string): Promise<void> {
    const sourceCategory = this.costCategories.get(sourceId);
    const targetCategory = this.costCategories.get(targetId);

    if (!sourceCategory || !targetCategory || sourceCategory.companyId !== companyId || targetCategory.companyId !== companyId) {
      throw new Error("Source or target category not found");
    }

    // Update all cost codes from source category to target category (within same company)
    for (const [id, code] of this.costCodes.entries()) {
      if (code.categoryId === sourceId && code.companyId === companyId) {
        this.costCodes.set(id, {
          ...code,
          categoryId: targetId,
        });
      }
    }

    // Archive the source category
    await this.archiveCostCategory(sourceId, companyId);
  }

  // Cost Codes CRUD operations (company-specific)
  async getCostCodes(companyId: string): Promise<CostCode[]> {
    const codes = Array.from(this.costCodes.values())
      .filter(code => code.isActive && code.companyId === companyId);
    return codes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }

  async getCostCode(id: string, companyId: string): Promise<CostCode | undefined> {
    const code = this.costCodes.get(id);
    return code && code.companyId === companyId ? code : undefined;
  }

  async createCostCode(insertCode: InsertCostCode): Promise<CostCode> {
    const id = randomUUID();
    const now = new Date();
    const code: CostCode = {
      ...insertCode,
      id,
      isActive: insertCode.isActive ?? true,
      availableInTimesheets: insertCode.availableInTimesheets ?? true,
      isSynced: insertCode.isSynced ?? false,
      isArchived: insertCode.isArchived ?? false,
      sortOrder: insertCode.sortOrder ?? 0,
      categoryId: insertCode.categoryId ?? null,
      xeroTrackingCategoryId: insertCode.xeroTrackingCategoryId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.costCodes.set(id, code);
    return code;
  }

  async updateCostCode(id: string, updateCode: Partial<InsertCostCode>, companyId: string): Promise<CostCode | undefined> {
    const code = this.costCodes.get(id);
    if (!code || code.companyId !== companyId) {
      return undefined;
    }

    const updatedCode: CostCode = {
      ...code,
      ...updateCode,
      updatedAt: new Date(),
    };
    this.costCodes.set(id, updatedCode);
    return updatedCode;
  }

  async deleteCostCode(id: string, companyId: string): Promise<boolean> {
    const code = this.costCodes.get(id);
    if (!code || code.companyId !== companyId) {
      return false;
    }
    return this.costCodes.delete(id);
  }

  async archiveCostCode(id: string, companyId: string): Promise<CostCode | undefined> {
    const code = this.costCodes.get(id);
    if (!code || code.companyId !== companyId) {
      return undefined;
    }

    const updatedCode: CostCode = {
      ...code,
      isArchived: true,
      isActive: false,
      updatedAt: new Date(),
    };
    this.costCodes.set(id, updatedCode);
    return updatedCode;
  }

  async mergeCostCodes(sourceId: string, targetId: string, companyId: string): Promise<boolean> {
    const sourceCode = this.costCodes.get(sourceId);
    const targetCode = this.costCodes.get(targetId);
    
    if (!sourceCode || !targetCode || sourceCode.companyId !== companyId || targetCode.companyId !== companyId) {
      return false;
    }
    
    // Archive the source cost code
    await this.archiveCostCode(sourceId, companyId);
    return true;
  }

  // Versioning and Locking
  async createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate> {
    const currentEstimate = this.estimates.get(estimateId);
    if (!currentEstimate) {
      throw new Error("Estimate not found");
    }

    // Lock the current version
    const lockedCurrent = {
      ...currentEstimate,
      isLocked: true,
      status: "locked" as const,
      updatedAt: new Date(),
    };
    this.estimates.set(estimateId, lockedCurrent);

    // Create new version
    const newId = randomUUID();
    const now = new Date();
    const newVersion: Estimate = {
      ...currentEstimate,
      ...newVersionData,
      id: newId,
      version: currentEstimate.version + 1,
      isLocked: false,
      status: "working",
      createdAt: now,
      updatedAt: now,
    };

    // Clone all items and groups for the new version
    const currentItems = await this.getEstimateItems(estimateId);
    const currentGroups = await this.getEstimateGroups(estimateId);

    // Create group mapping for new version
    const groupMapping: Map<string, string> = new Map();
    for (const group of currentGroups) {
      const newGroupId = randomUUID();
      groupMapping.set(group.id, newGroupId);
      const newGroup: EstimateGroup = {
        ...group,
        id: newGroupId,
        estimateId: newId,
        createdAt: now,
        updatedAt: now,
      };
      this.estimateGroups.set(newGroupId, newGroup);
    }

    // Clone items with updated group references
    for (const item of currentItems) {
      const newItemId = randomUUID();
      const newItem: EstimateItem = {
        ...item,
        id: newItemId,
        estimateId: newId,
        groupId: item.groupId ? groupMapping.get(item.groupId) || null : null,
        createdAt: now,
        updatedAt: now,
      };
      this.estimateItems.set(newItemId, newItem);
    }

    this.estimates.set(newId, newVersion);
    return newVersion;
  }

  async lockEstimate(estimateId: string): Promise<Estimate | undefined> {
    console.log('lockEstimate: Looking for estimate with id:', estimateId);
    
    try {
      // Try database first
      const result = await db.update(schema.estimates)
        .set({ 
          isLocked: true, 
          status: "locked", 
          updatedAt: new Date() 
        })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      
      if (result.length > 0) {
        console.log('lockEstimate: Database update successful');
        // Also update memory cache to keep it in sync
        this.estimates.set(estimateId, result[0]);
        return result[0];
      }
    } catch (error) {
      console.error("Database error in lockEstimate:", error);
    }
    
    // Fallback to memory storage
    console.log('lockEstimate: Falling back to memory storage');
    console.log('lockEstimate: Available estimate IDs:', Array.from(this.estimates.keys()));
    const estimate = this.estimates.get(estimateId);
    console.log('lockEstimate: Found estimate:', !!estimate);
    if (!estimate) {
      return undefined;
    }

    const lockedEstimate: Estimate = {
      ...estimate,
      isLocked: true,
      status: "locked",
      updatedAt: new Date(),
    };
    this.estimates.set(estimateId, lockedEstimate);
    return lockedEstimate;
  }

  async unlockEstimate(estimateId: string): Promise<Estimate | undefined> {
    console.log('unlockEstimate: Looking for estimate with id:', estimateId);
    
    try {
      // Try database first
      const result = await db.update(schema.estimates)
        .set({ 
          isLocked: false, 
          status: "working", 
          updatedAt: new Date() 
        })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      
      if (result.length > 0) {
        console.log('unlockEstimate: Database update successful');
        // Also update memory cache to keep it in sync
        this.estimates.set(estimateId, result[0]);
        return result[0];
      }
    } catch (error) {
      console.error("Database error in unlockEstimate:", error);
    }
    
    // Fallback to memory storage
    console.log('unlockEstimate: Falling back to memory storage');
    const estimate = this.estimates.get(estimateId);
    if (!estimate) {
      return undefined;
    }

    const unlockedEstimate: Estimate = {
      ...estimate,
      isLocked: false,
      status: "working",
      updatedAt: new Date(),
    };
    this.estimates.set(estimateId, unlockedEstimate);
    return unlockedEstimate;
  }

  // Summary calculations
  async getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    builderCostTotal: number;
    markupAmount: number;
    subtotalWithMarkup: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }> {
    const items = await this.getEstimateItems(estimateId);

    let builderCostTotal = 0; // Sum of all builder costs (what builder pays)
    let clientTaxTotal = 0; // Sum of all stored taxes
    let clientAmountIncTaxTotal = 0; // Sum of all stored client amounts inc tax

    // Calculate totals using stored values (same as frontend)
    items.forEach(item => {
      // Builder cost = unitCostExTax * quantity / 100 (calculated, same as frontend)
      // unitCostExTax is in cents, quantity is fixed-point (100 = 1.00)
      const builderCost = Math.round((item.unitCostExTax * item.quantity) / 100);
      builderCostTotal += builderCost;
      
      // Use stored client values (taxAmount, priceIncTax) - these are pre-calculated on item save
      clientTaxTotal += item.taxAmount ?? 0;
      clientAmountIncTaxTotal += item.priceIncTax ?? 0;
    });
    
    // Derive client ex-tax amount from stored values
    const clientAmountExTaxTotal = clientAmountIncTaxTotal - clientTaxTotal;
    
    // Total markup is the difference between client amount ex tax and builder cost
    const totalMarkup = clientAmountExTaxTotal - builderCostTotal;

    return {
      subtotal: builderCostTotal, // Sum of builder costs (what builder pays, no markup)
      builderCostTotal: builderCostTotal, // Same as subtotal for clarity
      markupAmount: totalMarkup, // Total markup embedded in all items
      subtotalWithMarkup: clientAmountExTaxTotal, // Client amount ex tax (builder cost + markups)
      taxAmount: clientTaxTotal, // Total GST on all items
      total: clientAmountIncTaxTotal, // Client amount inc tax
      itemCount: items.length,
    };
  }

  // Company CRUD
  async getCompany(id: string): Promise<import("@shared/schema").Company | undefined> {
    return this.companies.get(id);
  }

  async createCompany(company: import("@shared/schema").InsertCompany, ownerId: string): Promise<import("@shared/schema").Company> {
    const newCompany: import("@shared/schema").Company = {
      id: randomUUID(),
      name: company.name,
      abn: company.abn || null,
      address: company.address || null,
      phone: company.phone || null,
      email: company.email || null,
      website: company.website || null,
      logo: company.logo || null,
      ownerId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.companies.set(newCompany.id, newCompany);
    
    // Seed default roles for the company and get General Manager roleId
    const generalManagerRoleId = await this.seedDefaultRolesForCompany(newCompany.id);
    
    // Update user's companyId and assign General Manager role
    const user = await this.getUser(ownerId);
    if (user) {
      await this.updateUser(ownerId, { 
        companyId: newCompany.id,
        roleId: generalManagerRoleId
      });
    }
    
    return newCompany;
  }

  async updateCompany(id: string, company: Partial<import("@shared/schema").InsertCompany>): Promise<import("@shared/schema").Company | undefined> {
    const existing = this.companies.get(id);
    if (!existing) return undefined;
    
    const updated: import("@shared/schema").Company = {
      ...existing,
      ...company,
      updatedAt: new Date(),
    };
    this.companies.set(id, updated);
    return updated;
  }

  // Company Settings
  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    if (!this.companySettings) {
      // Create new company settings if none exist
      this.companySettings = {
        id: randomUUID(),
        companyName: null,
        email: null,
        phone: null,
        taxRate: "10.00",
        website: null,
        address: null,
        logoUrl: null,
        facebook: null,
        linkedin: null,
        twitter: null,
        instagram: null,
        googleMyBusiness: null,
        yelp: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...settings,
      };
    } else {
      // Update existing settings
      this.companySettings = {
        ...this.companySettings,
        ...settings,
        updatedAt: new Date(),
      };
    }
    return this.companySettings;
  }

  // System Configuration
  async getSystemConfiguration(): Promise<SystemConfiguration | undefined> {
    return this.systemConfiguration;
  }

  async updateSystemConfiguration(config: Partial<InsertSystemConfiguration>): Promise<SystemConfiguration | undefined> {
    if (!this.systemConfiguration) {
      // Create new system configuration if none exist
      this.systemConfiguration = {
        id: randomUUID(),
        language: "en-AU",
        measurementSystem: "metric",
        currency: "AUD",
        currencySymbol: "$",
        timezone: "Australia/Sydney",
        temperatureFormat: "celsius",
        dateFormat: "DD/MM/YYYY",
        timeFormat: "12h",
        estimatePrefix: "EST-",
        variationPrefix: "VAR-",
        clientInvoicePrefix: "INV-",
        billPrefix: "BILL-",
        purchaseOrderPrefix: "PO-",
        rfqPrefix: "RFQ-",
        rfiPrefix: "RFI-",
        proposalPrefix: "PROP-",
        estimateStartNumber: 1000,
        variationStartNumber: 1000,
        clientInvoiceStartNumber: 1000,
        billStartNumber: 1000,
        purchaseOrderStartNumber: 1000,
        rfqStartNumber: 1000,
        rfiStartNumber: 1000,
        proposalStartNumber: 1000,
        gstRate: "10.00",
        fiscalYearStart: "07-01",
        defaultPaymentTerms: "Net 30",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...config,
      };
    } else {
      // Update existing configuration
      this.systemConfiguration = {
        ...this.systemConfiguration,
        ...config,
        updatedAt: new Date(),
      };
    }
    return this.systemConfiguration;
  }

  // Field Categories CRUD (Buildern-style)
  async getFieldCategories(): Promise<FieldCategory[]> {
    return Array.from(this.fieldCategories.values())
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getFieldCategory(id: string): Promise<FieldCategory | undefined> {
    return this.fieldCategories.get(id);
  }

  async getFieldCategoryByKey(key: string): Promise<FieldCategory | undefined> {
    return Array.from(this.fieldCategories.values())
      .find(cat => cat.key === key);
  }

  async getFieldCategoryWithOptions(key: string): Promise<FieldCategoryWithOptions | undefined> {
    const category = await this.getFieldCategoryByKey(key);
    if (!category) return undefined;

    const options = await this.getFieldOptions(category.id);
    return {
      ...category,
      options
    };
  }

  async seedMissingBuiltInCategories(): Promise<{ addedCategories: string[]; addedOptions: string[] }> {
    // MemStorage doesn't need this - it's only for database migrations
    return { addedCategories: [], addedOptions: [] };
  }

  async createFieldCategory(insertCategory: InsertFieldCategory): Promise<FieldCategory> {
    const id = randomUUID();
    const now = new Date();
    
    const category: FieldCategory = {
      ...insertCategory,
      id,
      description: insertCategory.description || null,
      isBuiltIn: insertCategory.isBuiltIn || false,
      isActive: insertCategory.isActive !== false, 
      sortOrder: insertCategory.sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    };
    
    this.fieldCategories.set(id, category);
    return category;
  }

  async updateFieldCategory(id: string, updates: Partial<InsertFieldCategory>): Promise<FieldCategory | undefined> {
    const existing = this.fieldCategories.get(id);
    if (!existing) return undefined;
    
    const updated: FieldCategory = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.fieldCategories.set(id, updated);
    return updated;
  }

  async deleteFieldCategory(id: string): Promise<boolean> {
    // Also delete all options for this category
    const options = Array.from(this.fieldOptions.values())
      .filter(opt => opt.categoryId === id);
    
    options.forEach(opt => this.fieldOptions.delete(opt.id));
    return this.fieldCategories.delete(id);
  }

  // Field Options CRUD
  async getFieldOptions(categoryId: string): Promise<FieldOption[]> {
    return Array.from(this.fieldOptions.values())
      .filter(opt => opt.categoryId === categoryId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getFieldOption(id: string): Promise<FieldOption | undefined> {
    return this.fieldOptions.get(id);
  }

  async createFieldOption(insertOption: InsertFieldOption): Promise<FieldOption> {
    const id = randomUUID();
    const now = new Date();
    
    const option: FieldOption = {
      ...insertOption,
      id,
      color: insertOption.color || null,
      isActive: insertOption.isActive !== false,
      isDefault: insertOption.isDefault || false,
      isCompleted: insertOption.isCompleted || false,
      sortOrder: insertOption.sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    };
    
    this.fieldOptions.set(id, option);
    return option;
  }

  async updateFieldOption(id: string, updates: Partial<InsertFieldOption>): Promise<FieldOption | undefined> {
    const existing = this.fieldOptions.get(id);
    if (!existing) return undefined;
    
    const updated: FieldOption = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.fieldOptions.set(id, updated);
    return updated;
  }

  async deleteFieldOption(id: string): Promise<boolean> {
    return this.fieldOptions.delete(id);
  }

  async setCategoryOptions(
    categoryId: string, 
    options: Array<Partial<FieldOption> & { key: string; name: string }>
  ): Promise<FieldOption[]> {
    const now = new Date();
    
    // Delete existing options for this category
    const existingOptions = Array.from(this.fieldOptions.values())
      .filter(opt => opt.categoryId === categoryId);
    
    existingOptions.forEach(opt => this.fieldOptions.delete(opt.id));
    
    // Create new options
    const newOptions: FieldOption[] = [];
    
    // Ensure exactly one default option
    const hasDefault = options.some(opt => opt.isDefault);
    
    options.forEach((optData, index) => {
      const option: FieldOption = {
        id: optData.id || randomUUID(),
        categoryId,
        key: optData.key,
        name: optData.name,
        color: optData.color || "#6B7280",
        isActive: optData.isActive !== false, // Default to true
        isDefault: hasDefault ? (optData.isDefault === true) : (index === 0), // First option is default if none specified
        isCompleted: optData.isCompleted || false,
        sortOrder: optData.sortOrder || index,
        createdAt: optData.createdAt || now,
        updatedAt: now,
      };
      
      this.fieldOptions.set(option.id, option);
      newOptions.push(option);
    });
    
    return newOptions;
  }

  // Selections CRUD
  async getSelections(projectId: string): Promise<Selection[]> {
    return Array.from(this.selections.values())
      .filter(selection => selection.projectId === projectId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getSelection(id: string): Promise<Selection | undefined> {
    return this.selections.get(id);
  }

  async getSelectionWithOptions(id: string): Promise<SelectionWithOptions | undefined> {
    const selection = this.selections.get(id);
    if (!selection) return undefined;

    // Get all options for this selection
    const options = Array.from(this.selectionOptions.values())
      .filter(option => option.selectionId === id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // Get attachments for each option
    const optionsWithAttachments = options.map(option => {
      const attachments = Array.from(this.optionAttachments.values())
        .filter(attachment => attachment.optionId === option.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      
      return { ...option, attachments };
    });

    // Get client selection for this selection
    const clientSelection = Array.from(this.clientSelections.values())
      .find(cs => cs.selectionId === id);

    return {
      ...selection,
      options: optionsWithAttachments,
      clientSelection
    };
  }

  async createSelection(insertSelection: InsertSelection): Promise<Selection> {
    const id = randomUUID();
    const now = new Date();
    
    const selection: Selection = {
      ...insertSelection,
      id,
      status: insertSelection.status || "draft",
      clientCanChange: insertSelection.clientCanChange !== false,
      clientCanSeePrice: insertSelection.clientCanSeePrice || false,
      createdAt: now,
      updatedAt: now,
    };
    
    this.selections.set(id, selection);
    return selection;
  }

  async updateSelection(id: string, updates: Partial<InsertSelection>): Promise<Selection | undefined> {
    const existing = this.selections.get(id);
    if (!existing) return undefined;
    
    const updated: Selection = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.selections.set(id, updated);
    return updated;
  }

  async deleteSelection(id: string): Promise<boolean> {
    // Also delete all options and their attachments for this selection
    const options = Array.from(this.selectionOptions.values())
      .filter(opt => opt.selectionId === id);
    
    options.forEach(option => {
      // Delete attachments for this option
      const attachments = Array.from(this.optionAttachments.values())
        .filter(attachment => attachment.optionId === option.id);
      attachments.forEach(attachment => this.optionAttachments.delete(attachment.id));
      
      // Delete the option
      this.selectionOptions.delete(option.id);
    });

    // Delete client selections for this selection
    const clientSelections = Array.from(this.clientSelections.values())
      .filter(cs => cs.selectionId === id);
    clientSelections.forEach(cs => this.clientSelections.delete(cs.id));
    
    return this.selections.delete(id);
  }

  // Selection Options CRUD
  async getSelectionOptions(selectionId: string): Promise<SelectionOption[]> {
    return Array.from(this.selectionOptions.values())
      .filter(option => option.selectionId === selectionId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getSelectionOption(id: string): Promise<SelectionOption | undefined> {
    return this.selectionOptions.get(id);
  }

  async createSelectionOption(insertOption: InsertSelectionOption): Promise<SelectionOption> {
    const id = randomUUID();
    const now = new Date();
    
    const option: SelectionOption = {
      ...insertOption,
      id,
      quantity: insertOption.quantity || 1,
      unitType: insertOption.unitType || "ea",
      visibleToClient: insertOption.visibleToClient !== false,
      isSelectedByClient: insertOption.isSelectedByClient || false,
      sortOrder: insertOption.sortOrder || 0,
      createdAt: now,
      updatedAt: now,
    };
    
    this.selectionOptions.set(id, option);
    return option;
  }

  async updateSelectionOption(id: string, updates: Partial<InsertSelectionOption>): Promise<SelectionOption | undefined> {
    const existing = this.selectionOptions.get(id);
    if (!existing) return undefined;
    
    const updated: SelectionOption = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.selectionOptions.set(id, updated);
    return updated;
  }

  async deleteSelectionOption(id: string): Promise<boolean> {
    // Also delete all attachments for this option
    const attachments = Array.from(this.optionAttachments.values())
      .filter(attachment => attachment.optionId === id);
    
    attachments.forEach(attachment => this.optionAttachments.delete(attachment.id));

    // Delete client selections for this option
    const clientSelections = Array.from(this.clientSelections.values())
      .filter(cs => cs.optionId === id);
    clientSelections.forEach(cs => this.clientSelections.delete(cs.id));
    
    return this.selectionOptions.delete(id);
  }

  // Option Attachments CRUD
  async getOptionAttachments(optionId: string): Promise<OptionAttachment[]> {
    return Array.from(this.optionAttachments.values())
      .filter(attachment => attachment.optionId === optionId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async createOptionAttachment(insertAttachment: InsertOptionAttachment): Promise<OptionAttachment> {
    const id = randomUUID();
    const now = new Date();
    
    const attachment: OptionAttachment = {
      ...insertAttachment,
      id,
      sortOrder: insertAttachment.sortOrder || 0,
      createdAt: now,
    };
    
    this.optionAttachments.set(id, attachment);
    return attachment;
  }

  async deleteOptionAttachment(id: string): Promise<boolean> {
    return this.optionAttachments.delete(id);
  }

  // Client Selections CRUD  
  async getClientSelections(projectId: string): Promise<ClientSelection[]> {
    return Array.from(this.clientSelections.values())
      .filter(cs => cs.projectId === projectId)
      .sort((a, b) => a.selectedAt.getTime() - b.selectedAt.getTime());
  }

  async createClientSelection(insertClientSelection: InsertClientSelection): Promise<ClientSelection> {
    const id = randomUUID();
    const now = new Date();
    
    const clientSelection: ClientSelection = {
      ...insertClientSelection,
      id,
      selectedAt: now,
    };
    
    this.clientSelections.set(id, clientSelection);
    return clientSelection;
  }

  async deleteClientSelection(id: string): Promise<boolean> {
    return this.clientSelections.delete(id);
  }

  // Activity Feed CRUD
  async getActivities(options: { projectId?: string; userId?: string; companyId?: string; limit?: number }): Promise<schema.Activity[]> {
    return [];
  }

  async createActivity(activity: schema.InsertActivity): Promise<schema.Activity> {
    throw new Error("Activities not supported in memory storage");
  }

  async updateActivity(id: string, activity: Partial<schema.InsertActivity & { pinned?: boolean; pinnedAt?: Date; pinnedBy?: string }>): Promise<schema.Activity | undefined> {
    throw new Error("Activities not supported in memory storage");
  }

  // Site Diary Templates CRUD
  async getSiteDiaryTemplates(): Promise<schema.SiteDiaryTemplate[]> {
    return Array.from(this.siteDiaryTemplates.values())
      .filter(t => !t.isArchived)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map(t => structuredClone(t)); // Return clones to prevent mutation
  }

  async getSiteDiaryTemplate(id: string): Promise<schema.SiteDiaryTemplate | undefined> {
    const template = this.siteDiaryTemplates.get(id);
    return template ? structuredClone(template) : undefined;
  }

  async getDefaultSiteDiaryTemplate(companyId: string): Promise<schema.SiteDiaryTemplate | undefined> {
    const templates = Array.from(this.siteDiaryTemplates.values())
      .filter(t => !t.isArchived && t.companyId === companyId && t.isDefault);
    return templates.length > 0 ? structuredClone(templates[0]) : undefined;
  }

  async setDefaultSiteDiaryTemplate(id: string, companyId: string): Promise<schema.SiteDiaryTemplate | undefined> {
    // First unset any existing default for this company
    for (const [key, template] of this.siteDiaryTemplates.entries()) {
      if (template.companyId === companyId && template.isDefault && key !== id) {
        this.siteDiaryTemplates.set(key, { ...template, isDefault: false, updatedAt: new Date() });
      }
    }
    // Then set the new default
    const existing = this.siteDiaryTemplates.get(id);
    if (!existing) return undefined;
    
    const updated: schema.SiteDiaryTemplate = {
      ...existing,
      isDefault: true,
      companyId,
      updatedAt: new Date(),
    };
    this.siteDiaryTemplates.set(id, updated);
    return structuredClone(updated);
  }

  async createSiteDiaryTemplate(template: schema.InsertSiteDiaryTemplate): Promise<schema.SiteDiaryTemplate> {
    const id = randomUUID();
    const now = new Date();
    const newTemplate: schema.SiteDiaryTemplate = {
      id,
      ...structuredClone(template), // Deep clone to prevent mutation (preserves Dates)
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    } as schema.SiteDiaryTemplate;
    this.siteDiaryTemplates.set(id, structuredClone(newTemplate));
    return structuredClone(newTemplate);
  }

  async updateSiteDiaryTemplate(id: string, template: Partial<schema.InsertSiteDiaryTemplate>): Promise<schema.SiteDiaryTemplate | undefined> {
    const existing = this.siteDiaryTemplates.get(id);
    if (!existing) return undefined;
    
    const updated: schema.SiteDiaryTemplate = {
      ...existing,
      ...structuredClone(template), // Deep clone input to prevent mutation (preserves Dates)
      id,
      updatedAt: new Date(),
    } as schema.SiteDiaryTemplate;
    const stored = structuredClone(updated); // Clone the updated object (preserves Dates)
    this.siteDiaryTemplates.set(id, stored);
    return structuredClone(stored); // Return a clone of the stored (updated) object
  }

  async deleteSiteDiaryTemplate(id: string): Promise<boolean> {
    const existing = this.siteDiaryTemplates.get(id);
    if (!existing) return false;
    
    // Soft delete by archiving
    const updated: schema.SiteDiaryTemplate = {
      ...existing,
      isArchived: true,
      updatedAt: new Date(),
    };
    this.siteDiaryTemplates.set(id, updated);
    return true;
  }

  // Site Diary Entries CRUD
  async getSiteDiaryEntries(projectId: string): Promise<schema.SiteDiaryEntry[]> {
    return Array.from(this.siteDiaryEntries.values())
      .filter(e => e.projectId === projectId)
      .sort((a, b) => b.entryDateTime.getTime() - a.entryDateTime.getTime())
      .map(e => structuredClone(e));
  }

  async getSiteDiaryEntriesByCompany(companyId: string, date?: string): Promise<schema.SiteDiaryEntry[]> {
    const companyProjects = Array.from(this.projects.values()).filter(p => p.companyId === companyId);
    const projectIds = new Set(companyProjects.map(p => p.id));
    let entries = Array.from(this.siteDiaryEntries.values()).filter(e => projectIds.has(e.projectId));
    if (date) {
      entries = entries.filter(e => {
        const entryDate = e.entryDateTime instanceof Date ? e.entryDateTime.toISOString().split('T')[0] : String(e.entryDateTime).split('T')[0];
        return entryDate === date;
      });
    }
    return entries.sort((a, b) => b.entryDateTime.getTime() - a.entryDateTime.getTime()).map(e => structuredClone(e));
  }

  async getSiteDiaryEntryCountsByMonth(companyId: string, year: number, month: number): Promise<Record<string, number>> {
    const companyProjects = Array.from(this.projects.values()).filter(p => p.companyId === companyId);
    const projectIds = new Set(companyProjects.map(p => p.id));
    const entries = Array.from(this.siteDiaryEntries.values()).filter(e => projectIds.has(e.projectId));
    const counts: Record<string, number> = {};
    entries.forEach(e => {
      const d = e.entryDateTime instanceof Date ? e.entryDateTime : new Date(String(e.entryDateTime));
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const dateStr = d.toISOString().split('T')[0];
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      }
    });
    return counts;
  }

  async getSiteDiaryEntry(id: string): Promise<schema.SiteDiaryEntry | undefined> {
    const entry = this.siteDiaryEntries.get(id);
    return entry ? structuredClone(entry) : undefined;
  }

  async createSiteDiaryEntry(entry: schema.InsertSiteDiaryEntry): Promise<schema.SiteDiaryEntry> {
    const id = randomUUID();
    const now = new Date();
    const newEntry: schema.SiteDiaryEntry = {
      id,
      ...structuredClone(entry), // Deep clone to prevent mutation (preserves Dates)
      createdAt: now,
      updatedAt: now,
    } as schema.SiteDiaryEntry;
    this.siteDiaryEntries.set(id, structuredClone(newEntry));
    return structuredClone(newEntry);
  }

  async updateSiteDiaryEntry(id: string, entry: Partial<schema.InsertSiteDiaryEntry>): Promise<schema.SiteDiaryEntry | undefined> {
    const existing = this.siteDiaryEntries.get(id);
    if (!existing) return undefined;
    
    const updated: schema.SiteDiaryEntry = {
      ...existing,
      ...structuredClone(entry), // Deep clone input to prevent mutation (preserves Dates)
      id,
      updatedAt: new Date(),
    } as schema.SiteDiaryEntry;
    const stored = structuredClone(updated); // Clone the updated object (preserves Dates)
    this.siteDiaryEntries.set(id, stored);
    return structuredClone(stored); // Return a clone of the stored (updated) object
  }

  async deleteSiteDiaryEntry(id: string): Promise<boolean> {
    return this.siteDiaryEntries.delete(id);
  }

  // Calendar Views CRUD
  async getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]> {
    return Array.from(this.calendarViews.values())
      .filter(v => v.userId === userId && v.calendarType === calendarType && v.companyId === companyId && !v.isArchived)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(v => structuredClone(v));
  }

  async getCalendarView(id: string, companyId: string): Promise<CalendarView | undefined> {
    const view = this.calendarViews.get(id);
    if (!view || view.companyId !== companyId) return undefined;
    return structuredClone(view);
  }

  async createCalendarView(view: InsertCalendarView): Promise<CalendarView> {
    const id = randomUUID();
    const now = new Date();
    const newView: CalendarView = {
      id,
      ...structuredClone(view),
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    } as CalendarView;
    this.calendarViews.set(id, structuredClone(newView));
    return structuredClone(newView);
  }

  async findOrCreateCalendarView(view: InsertCalendarView & { userId: string; companyId: string }): Promise<CalendarView> {
    const existing = Array.from(this.calendarViews.values()).find(
      (v) => v.userId === view.userId && v.companyId === view.companyId && 
             v.calendarType === view.calendarType && v.name === view.name
    );
    if (existing) return structuredClone(existing);
    return this.createCalendarView(view);
  }

  async updateCalendarView(id: string, view: Partial<InsertCalendarView>, companyId: string): Promise<CalendarView | undefined> {
    const existing = this.calendarViews.get(id);
    if (!existing || existing.companyId !== companyId) return undefined;
    
    const updated: CalendarView = {
      ...existing,
      ...structuredClone(view),
      id,
      updatedAt: new Date(),
    } as CalendarView;
    const stored = structuredClone(updated);
    this.calendarViews.set(id, stored);
    return structuredClone(stored);
  }

  async deleteCalendarView(id: string, companyId: string): Promise<boolean> {
    const existing = this.calendarViews.get(id);
    if (!existing || existing.companyId !== companyId) return false;
    return this.calendarViews.delete(id);
  }

  // Activity Notes CRUD
  async getActivityNotes(scheduleItemId: string, limit: number = 10, offset: number = 0): Promise<ActivityNote[]> {
    const notes = Array.from(this.activityNotes.values())
      .filter(note => note.scheduleItemId === scheduleItemId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Newest first
      .slice(offset, offset + limit)
      .map(note => structuredClone(note));
    return notes;
  }

  async getActivityNoteCount(scheduleItemId: string): Promise<number> {
    return Array.from(this.activityNotes.values())
      .filter(note => note.scheduleItemId === scheduleItemId)
      .length;
  }

  async getBatchActivityNoteCounts(scheduleItemIds: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    
    // Initialize all IDs with 0
    scheduleItemIds.forEach(id => {
      counts[id] = 0;
    });
    
    // Count notes for each schedule item
    Array.from(this.activityNotes.values()).forEach(note => {
      if (scheduleItemIds.includes(note.scheduleItemId)) {
        counts[note.scheduleItemId]++;
      }
    });
    
    return counts;
  }

  async createActivityNote(note: InsertActivityNote): Promise<ActivityNote> {
    const id = randomUUID();
    const now = new Date();
    const newNote: ActivityNote = {
      id,
      ...structuredClone(note),
      isEdited: false,
      createdAt: now,
    } as ActivityNote;
    this.activityNotes.set(id, structuredClone(newNote));
    return structuredClone(newNote);
  }

  async updateActivityNote(id: string, note: Partial<InsertActivityNote>): Promise<ActivityNote | undefined> {
    const existing = this.activityNotes.get(id);
    if (!existing) return undefined;
    
    const updated: ActivityNote = {
      ...existing,
      ...structuredClone(note),
      id,
      isEdited: true,
      editedAt: new Date(),
    } as ActivityNote;
    const stored = structuredClone(updated);
    this.activityNotes.set(id, stored);
    return structuredClone(stored);
  }

  async deleteActivityNote(id: string): Promise<boolean> {
    return this.activityNotes.delete(id);
  }

  async canEditActivityNote(noteId: string, userId: string): Promise<boolean> {
    const note = this.activityNotes.get(noteId);
    if (!note || note.userId !== userId || note.type !== 'user') return false;
    
    // Check if within 5-minute edit window
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(note.createdAt) > fiveMinutesAgo;
  }

  async getAllScheduleItems(companyId: string, dateRange?: { startDate?: string; endDate?: string }): Promise<ScheduleItem[]> {
    const allItems: ScheduleItem[] = [];
    
    for (const schedule of this.schedules.values()) {
      const project = this.projects.get(schedule.projectId);
      if (project?.companyId === companyId) {
        const scheduleItems = await this.getScheduleItems(schedule.id);
        allItems.push(...scheduleItems);
      }
    }
    
    // Apply date range filtering if provided
    let filteredItems = allItems;
    if (dateRange?.startDate || dateRange?.endDate) {
      const rangeStart = dateRange.startDate ? new Date(dateRange.startDate).getTime() : 0;
      const rangeEnd = dateRange.endDate ? new Date(dateRange.endDate).getTime() : Infinity;
      
      filteredItems = allItems.filter(item => {
        const itemStart = new Date(item.startDate).getTime();
        const itemEnd = new Date(item.endDate).getTime();
        // Item overlaps with range if item ends after range start AND item starts before range end
        return itemEnd >= rangeStart && itemStart <= rangeEnd;
      });
    }
    
    return filteredItems.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
  }

  // Folder Templates - stub implementations for MemStorage
  async getFolderTemplates(companyId: string): Promise<import("@shared/schema").FolderTemplate[]> {
    return [];
  }
  async getFolderTemplate(id: string, companyId: string): Promise<import("@shared/schema").FolderTemplate | undefined> {
    return undefined;
  }
  async createFolderTemplate(template: import("@shared/schema").InsertFolderTemplate & { companyId: string }): Promise<import("@shared/schema").FolderTemplate> {
    throw new Error("Not implemented in MemStorage");
  }
  async updateFolderTemplate(id: string, template: Partial<import("@shared/schema").InsertFolderTemplate>, companyId: string): Promise<import("@shared/schema").FolderTemplate | undefined> {
    return undefined;
  }
  async deleteFolderTemplate(id: string, companyId: string): Promise<boolean> {
    return false;
  }

  // Drive File Attachments - stub implementations
  async getDriveFileAttachments(attachedToType: string, attachedToId: string, companyId: string): Promise<import("@shared/schema").DriveFileAttachment[]> {
    return [];
  }
  async createDriveFileAttachment(attachment: import("@shared/schema").InsertDriveFileAttachment & { companyId: string }): Promise<import("@shared/schema").DriveFileAttachment> {
    throw new Error("Not implemented in MemStorage");
  }
  async deleteDriveFileAttachment(id: string, companyId: string): Promise<boolean> {
    return false;
  }

  // Drive File Activity Logs - stub implementations
  async getDriveFileActivityLogs(companyId: string, projectId?: string, limit?: number): Promise<import("@shared/schema").DriveFileActivityLog[]> {
    return [];
  }
  async createDriveFileActivityLog(log: import("@shared/schema").InsertDriveFileActivityLog): Promise<import("@shared/schema").DriveFileActivityLog> {
    throw new Error("Not implemented in MemStorage");
  }

  // Dashboard Views - stub implementations
  async getDashboardViews(companyId: string, userId: string, viewType?: "personal" | "business"): Promise<DashboardView[]> {
    return [];
  }
  async getDashboardView(id: string, companyId: string): Promise<DashboardView | undefined> {
    return undefined;
  }
  async getCompanyDefaultDashboard(companyId: string, viewType: "personal" | "business"): Promise<DashboardView | undefined> {
    return undefined;
  }
  async createDashboardView(view: InsertDashboardView & { companyId: string; creatorId: string }): Promise<DashboardView> {
    throw new Error("Not implemented in MemStorage");
  }
  async updateDashboardView(id: string, view: Partial<InsertDashboardView>, companyId: string): Promise<DashboardView | undefined> {
    return undefined;
  }
  async setCompanyDefaultView(viewId: string, companyId: string): Promise<void> {
    // Not implemented
  }
  async deleteDashboardView(id: string, companyId: string): Promise<boolean> {
    return false;
  }
  async getDashboardViewPermissions(viewId: string): Promise<DashboardViewPermission[]> {
    return [];
  }
  async setDashboardViewPermissions(viewId: string, permissions: { roleIds?: string[]; userIds?: string[] }): Promise<void> {
    // Not implemented
  }
  async getUserDashboardPreference(userId: string, companyId: string): Promise<UserDashboardPreference | undefined> {
    return undefined;
  }
  async setUserDashboardPreference(userId: string, companyId: string, activeViewId: string | null): Promise<UserDashboardPreference> {
    throw new Error("Not implemented in MemStorage");
  }

  async getDashboardTheme(userId: string, companyId: string, dashboardType: string, projectId?: string): Promise<import("@shared/schema").DashboardTheme | undefined> {
    throw new Error("Not implemented in MemStorage");
  }

  async saveDashboardTheme(theme: import("@shared/schema").InsertDashboardTheme): Promise<import("@shared/schema").DashboardTheme> {
    throw new Error("Not implemented in MemStorage");
  }

  async deleteDashboardTheme(id: string, companyId: string): Promise<boolean> {
    throw new Error("Not implemented in MemStorage");
  }

  // Business Dashboard Views - MemStorage stubs
  async getBusinessDashboardViews(companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView[]> {
    return [];
  }
  async getBusinessDashboardView(id: string, companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    return undefined;
  }
  async getBusinessDashboardViewById(id: string, companyId: string): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    return undefined;
  }
  async createBusinessDashboardView(view: import("@shared/schema").InsertBusinessDashboardView): Promise<import("@shared/schema").BusinessDashboardView> {
    throw new Error("Not implemented in MemStorage");
  }
  async updateBusinessDashboardView(id: string, companyId: string, updates: Partial<import("@shared/schema").InsertBusinessDashboardView>): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    return undefined;
  }
  async deleteBusinessDashboardView(id: string, companyId: string): Promise<boolean> {
    return false;
  }
  async ensureDefaultBusinessDashboardView(companyId: string): Promise<import("@shared/schema").BusinessDashboardView> {
    throw new Error("Not implemented in MemStorage");
  }

  // In-App Notifications - MemStorage stubs
  async getNotifications(userId: string, companyId: string, options?: { limit?: number; unreadOnly?: boolean }): Promise<InAppNotification[]> {
    return [];
  }
  async getNotification(id: string, userId: string): Promise<InAppNotification | undefined> {
    return undefined;
  }
  async createNotification(notification: InsertNotification): Promise<InAppNotification> {
    throw new Error("Not implemented in MemStorage");
  }
  async markNotificationAsRead(id: string, userId: string): Promise<InAppNotification | undefined> {
    return undefined;
  }
  async markAllNotificationsAsRead(userId: string, companyId: string): Promise<number> {
    return 0;
  }
  async deleteNotification(id: string, userId: string): Promise<boolean> {
    return false;
  }
  async getUnreadNotificationCount(userId: string, companyId: string): Promise<number> {
    return 0;
  }
  async createChecklistAuditEntry(entry: InsertChecklistAuditLog): Promise<ChecklistAuditLog> {
    return { id: '', ...entry, createdAt: new Date() } as ChecklistAuditLog;
  }
  async getChecklistAuditLog(instanceId: string): Promise<ChecklistAuditLog[]> {
    return [];
  }
  async getChecklistStatusTriggers(companyId: string): Promise<ChecklistStatusTrigger[]> {
    return [];
  }
  async createChecklistStatusTrigger(trigger: InsertChecklistStatusTrigger): Promise<ChecklistStatusTrigger> {
    return { id: '', ...trigger, createdAt: new Date(), updatedAt: new Date() } as ChecklistStatusTrigger;
  }
  async updateChecklistStatusTrigger(id: string, trigger: Partial<InsertChecklistStatusTrigger>): Promise<ChecklistStatusTrigger | undefined> {
    return undefined;
  }
  async deleteChecklistStatusTrigger(id: string): Promise<boolean> {
    return false;
  }
}

// Database-backed storage implementation
export class DbStorage implements IStorage {
  private initialized = false;

  // Public initialization method that can be awaited
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.initializeDefaultData();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize DbStorage:', error);
      throw error;
    }
  }

  // Initialize default data - ensure all required defaults exist
  private async initializeDefaultData(): Promise<void> {
    // Always ensure built-in permissions exist (idempotent)
    await this.ensureBuiltInPermissionsExist();
    
    // Always ensure all required categories exist (idempotent)
    await this.ensureRequiredCategoriesExist();
    
    // Always ensure all required field options exist (idempotent)
    await this.ensureAllRequiredOptionsExist();

    // Always ensure required custom fields exist (idempotent)
    await this.ensureRequiredCustomFieldsExist();
  }

  // Ensure all built-in permissions exist (idempotent upsert by key)
  private async ensureBuiltInPermissionsExist(): Promise<void> {
    const now = new Date();
    
    const builtInPermissions = [
      // Files category
      { key: "files.manage", name: "Files", description: "Manage files and folders", category: "files", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      
      // Admin category
      { key: "admin.users", name: "User (team)", description: "Manage team users", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.suppliers", name: "Sub/Vendor", description: "Manage suppliers/vendors", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.roles", name: "Role", description: "Manage user roles", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.cost_codes", name: "Cost code/category", description: "Manage cost codes", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.terms", name: "Terms and Conditions", description: "Manage terms", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.payment_templates", name: "Payment schedule templates", description: "Manage payment templates", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.company", name: "Company settings", description: "Manage company settings", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.manage_team_members", name: "Manage Team Members", description: "Edit team member profiles and details", category: "admin", actions: ["view", "edit"], isBuiltIn: true },
      
      // Sales category
      { key: "sales.client", name: "Client", description: "Manage clients", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      
      // Project Management category
      { key: "projects.view", name: "Projects", description: "View projects", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.schedule", name: "Schedule", description: "Manage project schedules", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.variations", name: "Variations", description: "Manage project variations", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.todos", name: "To Dos", description: "Manage project to-dos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.invoices", name: "Client Invoices", description: "Manage client invoices", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.site_diary", name: "Site Diary", description: "Manage site diary", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.selections", name: "Selections and Allowances", description: "Manage selections", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.timesheet", name: "Timesheet", description: "Manage timesheets", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.rfi", name: "RFI", description: "Manage RFIs", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.team_calendars", name: "View Team Calendars", description: "View other team members' calendars", category: "projects", actions: ["view"], isBuiltIn: true },
      
      // Financial category
      { key: "financial.estimate", name: "Estimate", description: "Manage estimates", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.purchase_orders", name: "Purchase Orders", description: "Manage purchase orders", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.bills", name: "Bills", description: "Manage bills", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.budget", name: "Budget", description: "Manage budgets", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.quotes", name: "Request for Quotes", description: "Manage quotes", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.proposal", name: "Proposal", description: "Manage proposals", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true }
    ];

    for (const permData of builtInPermissions) {
      // Check if permission exists by key
      const existing = await db.select().from(schema.permissions)
        .where(eq(schema.permissions.key, permData.key))
        .limit(1);
      
      if (existing.length === 0) {
        // Permission doesn't exist, insert it with deterministic ID
        await db.insert(schema.permissions).values({
          id: `perm-${permData.key.replace(/\./g, '-')}`,
          ...permData,
          actions: permData.actions as PermissionAction[],
          createdAt: now,
        });
      }
    }
  }

  // Ensure all required categories exist (upsert by key)
  private async ensureRequiredCategoriesExist(): Promise<void> {
    const now = new Date();
    
    const requiredCategories = [
      {
        id: 'cat-task-status',
        key: 'task.status', 
        label: 'Task Statuses',
        entity: 'task',
        description: 'Status options for tasks',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: 'cat-task-priority',
        key: 'task.priority',
        label: 'Task Priorities', 
        entity: 'task',
        description: 'Priority levels for tasks',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 2,
      },
      {
        id: 'cat-task-labels',
        key: 'task.labels',
        label: 'Task Labels',
        entity: 'task',
        description: 'Customizable labels for tasks',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 3,
      },
      {
        id: 'cat-trade-types',
        key: 'task.trade',
        label: 'Trade Categories',
        entity: 'task',
        description: 'Construction trade categories',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 4,
      },
      {
        id: 'cat-selection-categories',
        key: 'selection.category',
        label: 'Selection Categories',
        entity: 'selection',
        description: 'Categories for selections',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 5,
      },
      {
        id: 'cat-location-rooms',
        key: 'selection.room',
        label: 'Locations/Rooms',
        entity: 'selection',
        description: 'Room/location options for selections',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 6,
      },
      {
        id: 'cat-estimate-item-status',
        key: 'estimate_item.status',
        label: 'Estimate Item Statuses',
        entity: 'estimate_item',
        description: 'Status options for estimate items',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 7,
      },
      {
        id: 'cat-estimate-item-unit',
        key: 'estimate_item.unit',
        label: 'Estimate Units',
        entity: 'estimate_item',
        description: 'Unit of measurement options for estimate items',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 8,
      },
      {
        id: 'cat-estimate-status',
        key: 'estimate.status',
        label: 'Estimate Statuses',
        entity: 'estimate',
        description: 'Status options for estimates',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 8,
      },
      {
        id: 'cat-defect-status',
        key: 'defect.status',
        label: 'Defect Statuses',
        entity: 'defect',
        description: 'Status options for defects',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 9,
      },
      {
        id: 'cat-defect-priority',
        key: 'defect.priority',
        label: 'Defect Priorities',
        entity: 'defect',
        description: 'Priority levels for defects',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 10,
      },
      {
        id: 'cat-defect-type',
        key: 'defect.type',
        label: 'Defect Types',
        entity: 'defect',
        description: 'Type/source of defects',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 11,
      },
      {
        id: 'cat-defect-trade',
        key: 'defect.trade',
        label: 'Defect Trades',
        entity: 'defect',
        description: 'Trade categories for defects',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 12,
      },
      {
        id: 'cat-schedule-item-status',
        key: 'schedule_item.status',
        label: 'Schedule Item Statuses',
        entity: 'schedule_item',
        description: 'Status options for schedule items',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 13,
      },
      {
        id: 'cat-project-status',
        key: 'project.status',
        label: 'Project Statuses',
        entity: 'project',
        description: 'Hierarchical status options for projects',
        isBuiltIn: true,
        isActive: true,
        supportsHierarchy: true,
        sortOrder: 14,
      },
      {
        id: 'cat-timesheet-label',
        key: 'timesheet.label',
        label: 'Timesheet Labels',
        entity: 'timesheet',
        description: 'Labels for categorizing timesheets',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 15,
      },
    ];

    for (const categoryData of requiredCategories) {
      // Check if category exists by key
      const existing = await db.select().from(schema.fieldCategories)
        .where(eq(schema.fieldCategories.key, categoryData.key))
        .limit(1);
        
      if (existing.length === 0) {
        // Category doesn't exist, insert it
        await db.insert(schema.fieldCategories).values({
          ...categoryData,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // Ensure all required field options exist for all categories (upsert missing ones)
  private async ensureAllRequiredOptionsExist(): Promise<void> {
    const allCategories = await db.select().from(schema.fieldCategories);
    const now = new Date();
    
    for (const category of allCategories) {
      await this.ensureOptionsForCategory(category, now);
    }
  }

  private async ensureOptionsForCategory(category: any, now: Date): Promise<void> {
    const requiredOptions = this.getRequiredOptionsForCategory(category.key, category.id);
    
    for (const optionData of requiredOptions) {
      // Check if this specific option exists by key within this category
      const existing = await db.select().from(schema.fieldOptions)
        .where(and(
          eq(schema.fieldOptions.categoryId, category.id),
          eq(schema.fieldOptions.key, optionData.key)
        ))
        .limit(1);
        
      if (existing.length === 0) {
        // Option doesn't exist, insert it
        await db.insert(schema.fieldOptions).values({
          ...optionData,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  private getRequiredOptionsForCategory(categoryKey: string, categoryId: string): any[] {
    switch (categoryKey) {
      case 'task.status':
        return [
          { id: 'opt-status-todo', categoryId, key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-status-progress', categoryId, key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-status-done', categoryId, key: 'done', name: 'Done', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-status-hold', categoryId, key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 3 },
        ];
      case 'task.priority':
        return [
          { id: 'opt-priority-low', categoryId, key: 'low', name: 'Low', color: '#10B981', isDefault: false, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: true, sortOrder: 1 },
          { id: 'opt-priority-high', categoryId, key: 'high', name: 'High', color: '#EF4444', isDefault: false, sortOrder: 2 },
        ];
      case 'task.labels':
        return [
          { id: 'opt-label-bug', categoryId, key: 'bug', name: 'Bug', color: '#EF4444', isDefault: false, sortOrder: 0 },
          { id: 'opt-label-feature', categoryId, key: 'feature', name: 'Feature', color: '#3B82F6', isDefault: false, sortOrder: 1 },
          { id: 'opt-label-urgent', categoryId, key: 'urgent', name: 'Urgent', color: '#DC2626', isDefault: false, sortOrder: 2 },
          { id: 'opt-label-review', categoryId, key: 'review', name: 'Review', color: '#F59E0B', isDefault: false, sortOrder: 3 },
          { id: 'opt-label-documentation', categoryId, key: 'documentation', name: 'Documentation', color: '#8B5CF6', isDefault: false, sortOrder: 4 },
          { id: 'opt-label-client-request', categoryId, key: 'client-request', name: 'Client Request', color: '#10B981', isDefault: false, sortOrder: 5 },
        ];
      case 'task.trade':
        return [
          { id: 'opt-trade-electrical', categoryId, key: 'electrical', name: 'Electrical', color: '#3B82F6', isDefault: true, sortOrder: 0 },
          { id: 'opt-trade-plumbing', categoryId, key: 'plumbing', name: 'Plumbing', color: '#06B6D4', isDefault: false, sortOrder: 1 },
          { id: 'opt-trade-carpentry', categoryId, key: 'carpentry', name: 'Carpentry', color: '#D97706', isDefault: false, sortOrder: 2 },
          { id: 'opt-trade-painting', categoryId, key: 'painting', name: 'Painting & Decorating', color: '#7C3AED', isDefault: false, sortOrder: 3 },
          { id: 'opt-trade-flooring', categoryId, key: 'flooring', name: 'Flooring', color: '#059669', isDefault: false, sortOrder: 4 },
        ];
      case 'selection.category':
        return [
          { id: 'opt-sel-fixtures', categoryId, key: 'fixtures', name: 'Fixtures & Fittings', color: '#8B5CF6', isDefault: true, sortOrder: 0 },
          { id: 'opt-sel-finishes', categoryId, key: 'finishes', name: 'Finishes', color: '#EC4899', isDefault: false, sortOrder: 1 },
          { id: 'opt-sel-appliances', categoryId, key: 'appliances', name: 'Appliances', color: '#F59E0B', isDefault: false, sortOrder: 2 },
        ];
      case 'selection.room':
        return [
          { id: 'opt-room-kitchen', categoryId, key: 'kitchen', name: 'Kitchen', color: '#059669', isDefault: true, sortOrder: 0 },
          { id: 'opt-room-living', categoryId, key: 'living', name: 'Living Room', color: '#DC2626', isDefault: false, sortOrder: 1 },
          { id: 'opt-room-master', categoryId, key: 'master-bedroom', name: 'Master Bedroom', color: '#7C3AED', isDefault: false, sortOrder: 2 },
          { id: 'opt-room-bathroom', categoryId, key: 'main-bathroom', name: 'Main Bathroom', color: '#06B6D4', isDefault: false, sortOrder: 3 },
          { id: 'opt-room-ensuite', categoryId, key: 'ensuite', name: 'Ensuite', color: '#0891B2', isDefault: false, sortOrder: 4 },
          { id: 'opt-room-laundry', categoryId, key: 'laundry', name: 'Laundry', color: '#65A30D', isDefault: false, sortOrder: 5 },
        ];
      case 'estimate_item.status':
        return [
          { id: 'opt-estimate-item-status-pending', categoryId, key: 'pending', name: 'Pending', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-estimate-item-status-quoted', categoryId, key: 'quoted', name: 'Quoted', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-estimate-item-status-confirmed', categoryId, key: 'confirmed', name: 'Confirmed', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-estimate-item-status-ordered', categoryId, key: 'ordered', name: 'Ordered', color: '#3B82F6', isDefault: false, isCompleted: false, sortOrder: 3 },
          { id: 'opt-estimate-item-status-cancelled', categoryId, key: 'cancelled', name: 'Cancelled', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 4 },
        ];
      case 'estimate_item.unit':
        return [
          { id: 'opt-estimate-item-unit-ea', categoryId, key: 'ea', name: 'ea', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-estimate-item-unit-m', categoryId, key: 'm', name: 'm', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-estimate-item-unit-m2', categoryId, key: 'm²', name: 'm²', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 2 },
          { id: 'opt-estimate-item-unit-m3', categoryId, key: 'm³', name: 'm³', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 3 },
          { id: 'opt-estimate-item-unit-item', categoryId, key: 'item', name: 'item', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 4 },
          { id: 'opt-estimate-item-unit-hr', categoryId, key: 'hr', name: 'hr', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 5 },
          { id: 'opt-estimate-item-unit-day', categoryId, key: 'day', name: 'day', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 6 },
          { id: 'opt-estimate-item-unit-load', categoryId, key: 'load', name: 'load', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 7 },
          { id: 'opt-estimate-item-unit-tonne', categoryId, key: 'tonne', name: 'tonne', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 8 },
          { id: 'opt-estimate-item-unit-kg', categoryId, key: 'kg', name: 'kg', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 9 },
          { id: 'opt-estimate-item-unit-set', categoryId, key: 'set', name: 'set', color: '#6B7280', isDefault: false, isCompleted: false, sortOrder: 10 },
        ];
      case 'estimate.status':
        return [
          { id: 'opt-estimate-status-draft', categoryId, key: 'draft', name: 'Draft', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-estimate-status-working', categoryId, key: 'working', name: 'Working', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-estimate-status-locked', categoryId, key: 'locked', name: 'Locked', color: '#3B82F6', isDefault: false, isCompleted: false, sortOrder: 2 },
          { id: 'opt-estimate-status-approved', categoryId, key: 'approved', name: 'Approved', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 3 },
        ];
      case 'defect.status':
        return [
          { id: 'opt-defect-status-open', categoryId, key: 'open', name: 'Open', color: '#EF4444', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-defect-status-progress', categoryId, key: 'in_progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-defect-status-resolved', categoryId, key: 'resolved', name: 'Resolved', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-defect-status-closed', categoryId, key: 'closed', name: 'Closed', color: '#6B7280', isDefault: false, isCompleted: true, sortOrder: 3 },
        ];
      case 'defect.priority':
        return [
          { id: 'opt-defect-priority-critical', categoryId, key: 'critical', name: 'Critical', color: '#DC2626', isDefault: false, sortOrder: 0 },
          { id: 'opt-defect-priority-high', categoryId, key: 'high', name: 'High', color: '#EF4444', isDefault: false, sortOrder: 1 },
          { id: 'opt-defect-priority-medium', categoryId, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: true, sortOrder: 2 },
          { id: 'opt-defect-priority-low', categoryId, key: 'low', name: 'Low', color: '#10B981', isDefault: false, sortOrder: 3 },
        ];
      case 'defect.type':
        return [
          { id: 'opt-defect-type-builder', categoryId, key: 'builder', name: 'Builder Defect', color: '#3B82F6', isDefault: true, sortOrder: 0 },
          { id: 'opt-defect-type-subcontractor', categoryId, key: 'subcontractor', name: 'Subcontractor', color: '#F59E0B', isDefault: false, sortOrder: 1 },
          { id: 'opt-defect-type-client', categoryId, key: 'client', name: 'Client Reported', color: '#8B5CF6', isDefault: false, sortOrder: 2 },
          { id: 'opt-defect-type-warranty', categoryId, key: 'warranty', name: 'Warranty', color: '#EF4444', isDefault: false, sortOrder: 3 },
        ];
      case 'defect.trade':
        return [
          { id: 'opt-defect-trade-general', categoryId, key: 'general', name: 'General', color: '#6B7280', isDefault: true, sortOrder: 0 },
          { id: 'opt-defect-trade-carpentry', categoryId, key: 'carpentry', name: 'Carpentry', color: '#D97706', isDefault: false, sortOrder: 1 },
          { id: 'opt-defect-trade-plumbing', categoryId, key: 'plumbing', name: 'Plumbing', color: '#06B6D4', isDefault: false, sortOrder: 2 },
          { id: 'opt-defect-trade-electrical', categoryId, key: 'electrical', name: 'Electrical', color: '#3B82F6', isDefault: false, sortOrder: 3 },
          { id: 'opt-defect-trade-painting', categoryId, key: 'painting', name: 'Painting', color: '#7C3AED', isDefault: false, sortOrder: 4 },
          { id: 'opt-defect-trade-flooring', categoryId, key: 'flooring', name: 'Flooring', color: '#059669', isDefault: false, sortOrder: 5 },
          { id: 'opt-defect-trade-tiling', categoryId, key: 'tiling', name: 'Tiling', color: '#0891B2', isDefault: false, sortOrder: 6 },
        ];
      case 'schedule_item.status':
        return [
          { id: 'opt-schedule-item-status-not-started', categoryId, key: 'not_started', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-schedule-item-status-in-progress', categoryId, key: 'in_progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-schedule-item-status-completed', categoryId, key: 'completed', name: 'Completed', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-schedule-item-status-on-hold', categoryId, key: 'on_hold', name: 'On Hold', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 3 },
          { id: 'opt-schedule-item-status-cancelled', categoryId, key: 'cancelled', name: 'Cancelled', color: '#94A3B8', isDefault: false, isCompleted: false, sortOrder: 4 },
        ];
      case 'project.status':
        return [
          // Parent statuses
          { id: 'opt-project-status-lead', categoryId, key: 'lead', name: 'Lead', color: '#6B7280', isDefault: true, sortOrder: 0 },
          { id: 'opt-project-status-pre-construction', categoryId, key: 'pre_construction', name: 'Pre-Construction', color: '#F59E0B', isDefault: false, sortOrder: 1 },
          { id: 'opt-project-status-construction', categoryId, key: 'construction', name: 'Construction', color: '#3B82F6', isDefault: false, sortOrder: 2 },
          { id: 'opt-project-status-post-construction', categoryId, key: 'post_construction', name: 'Post Construction', color: '#10B981', isDefault: false, sortOrder: 3 },
          
          // Lead sub-statuses
          { id: 'opt-project-substatus-lead-new', categoryId, key: 'lead_new', name: 'Application Submitted', color: '#9CA3AF', parentId: 'opt-project-status-lead', sortOrder: 4 },
          { id: 'opt-project-substatus-lead-contacted', categoryId, key: 'lead_contacted', name: 'On-Site Consultation Booked', color: '#9CA3AF', parentId: 'opt-project-status-lead', sortOrder: 5 },
          { id: 'opt-project-substatus-lead-proposal', categoryId, key: 'lead_proposal_sent', name: 'Awaiting Pre-Con', color: '#9CA3AF', parentId: 'opt-project-status-lead', sortOrder: 6 },
          
          // Pre-Construction sub-statuses
          { id: 'opt-project-substatus-precon-awaiting-agreement', categoryId, key: 'awaiting_pre-con_agreement', name: 'Awaiting Pre-Con Agreement', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 7 },
          { id: 'opt-project-substatus-precon-agreement-signed', categoryId, key: 'pre-con_agreement_signed', name: 'Pre-Con Agreement Signed', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 8 },
          { id: 'opt-project-substatus-precon-awaiting-fdp', categoryId, key: 'awaiting_fdp', name: 'Awaiting FDP', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 9 },
          { id: 'opt-project-substatus-precon-fdp', categoryId, key: 'fdp', name: 'FDP', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 10 },
          { id: 'opt-project-substatus-precon-fdp-review', categoryId, key: 'fdp_review', name: 'FDP Review', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 11 },
          { id: 'opt-project-substatus-precon-planning', categoryId, key: 'precon_planning', name: 'QBE', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 12 },
          { id: 'opt-project-substatus-precon-awaiting-confirmation', categoryId, key: 'awaiting_confirmation', name: 'Awaiting Confirmation', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 13 },
          { id: 'opt-project-substatus-precon-contract-prep', categoryId, key: 'contract_preparation', name: 'Contract Preparation', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 14 },
          { id: 'opt-project-substatus-precon-scheduling', categoryId, key: 'scheduling', name: 'Scheduling', color: '#FDE68A', parentId: 'opt-project-status-pre-construction', sortOrder: 15 },
          
          // Construction sub-statuses
          { id: 'opt-project-substatus-const-foundation', categoryId, key: 'const_foundation', name: 'Construction', color: '#93C5FD', parentId: 'opt-project-status-construction', sortOrder: 16 },
          
          // Post Construction sub-statuses
          { id: 'opt-project-substatus-postcon-defects', categoryId, key: 'postcon_defects_period', name: 'Post Construction', color: '#86EFAC', parentId: 'opt-project-status-post-construction', sortOrder: 17 },
          { id: 'opt-project-substatus-postcon-completed', categoryId, key: 'postcon_completed', name: 'Completed', color: '#86EFAC', parentId: 'opt-project-status-post-construction', sortOrder: 18 },
        ];
      case 'timesheet.label':
        return [
          { id: 'opt-timesheet-label-regular', categoryId, key: 'regular', name: 'Regular Hours', color: '#3B82F6', isDefault: true, sortOrder: 0 },
          { id: 'opt-timesheet-label-overtime', categoryId, key: 'overtime', name: 'Overtime', color: '#F59E0B', isDefault: false, sortOrder: 1 },
          { id: 'opt-timesheet-label-travel', categoryId, key: 'travel', name: 'Travel Time', color: '#8B5CF6', isDefault: false, sortOrder: 2 },
          { id: 'opt-timesheet-label-meeting', categoryId, key: 'meeting', name: 'Meeting', color: '#06B6D4', isDefault: false, sortOrder: 3 },
          { id: 'opt-timesheet-label-training', categoryId, key: 'training', name: 'Training', color: '#10B981', isDefault: false, sortOrder: 4 },
          { id: 'opt-timesheet-label-site-visit', categoryId, key: 'site-visit', name: 'Site Visit', color: '#EC4899', isDefault: false, sortOrder: 5 },
        ];
      default:
        return [];
    }
  }

  // Ensure required custom fields exist
  private async ensureRequiredCustomFieldsExist(): Promise<void> {
    const now = new Date();
    
    // Check if the specific 'Task Custom Field 1' exists
    const existing = await db.select().from(schema.customFieldDefs)
      .where(eq(schema.customFieldDefs.key, 'task_custom_field_1'))
      .limit(1);
      
    if (existing.length === 0) {
      await db.insert(schema.customFieldDefs).values({
        id: 'cfd-task-custom-1',
        key: 'task_custom_field_1',
        label: 'Task Custom Field 1',
        type: 'text',
        required: false,
        order: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private async seedOptionsForCategory(category: any, now: Date): Promise<void> {
    let optionsToInsert: any[] = [];

    switch (category.key) {
      case 'task.status':
        optionsToInsert = [
          { id: 'opt-status-todo', categoryId: category.id, key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-status-progress', categoryId: category.id, key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-status-done', categoryId: category.id, key: 'done', name: 'Done', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-status-hold', categoryId: category.id, key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 3 },
        ];
        break;
      case 'task.priority':
        optionsToInsert = [
          { id: 'opt-priority-low', categoryId: category.id, key: 'low', name: 'Low', color: '#10B981', isDefault: false, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId: category.id, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: true, sortOrder: 1 },
          { id: 'opt-priority-high', categoryId: category.id, key: 'high', name: 'High', color: '#EF4444', isDefault: false, sortOrder: 2 },
        ];
        break;
      case 'task.trade':
        optionsToInsert = [
          { id: 'opt-trade-electrical', categoryId: category.id, key: 'electrical', name: 'Electrical', color: '#3B82F6', isDefault: true, sortOrder: 0 },
          { id: 'opt-trade-plumbing', categoryId: category.id, key: 'plumbing', name: 'Plumbing', color: '#06B6D4', isDefault: false, sortOrder: 1 },
          { id: 'opt-trade-carpentry', categoryId: category.id, key: 'carpentry', name: 'Carpentry', color: '#D97706', isDefault: false, sortOrder: 2 },
          { id: 'opt-trade-painting', categoryId: category.id, key: 'painting', name: 'Painting & Decorating', color: '#7C3AED', isDefault: false, sortOrder: 3 },
          { id: 'opt-trade-flooring', categoryId: category.id, key: 'flooring', name: 'Flooring', color: '#059669', isDefault: false, sortOrder: 4 },
        ];
        break;
      case 'selection.category':
        optionsToInsert = [
          { id: 'opt-sel-fixtures', categoryId: category.id, key: 'fixtures', name: 'Fixtures & Fittings', color: '#8B5CF6', isDefault: true, sortOrder: 0 },
          { id: 'opt-sel-finishes', categoryId: category.id, key: 'finishes', name: 'Finishes', color: '#EC4899', isDefault: false, sortOrder: 1 },
          { id: 'opt-sel-appliances', categoryId: category.id, key: 'appliances', name: 'Appliances', color: '#F59E0B', isDefault: false, sortOrder: 2 },
        ];
        break;
      case 'selection.room':
        optionsToInsert = [
          { id: 'opt-room-kitchen', categoryId: category.id, key: 'kitchen', name: 'Kitchen', color: '#059669', isDefault: true, sortOrder: 0 },
          { id: 'opt-room-living', categoryId: category.id, key: 'living', name: 'Living Room', color: '#DC2626', isDefault: false, sortOrder: 1 },
          { id: 'opt-room-master', categoryId: category.id, key: 'master-bedroom', name: 'Master Bedroom', color: '#7C3AED', isDefault: false, sortOrder: 2 },
          { id: 'opt-room-bathroom', categoryId: category.id, key: 'main-bathroom', name: 'Main Bathroom', color: '#06B6D4', isDefault: false, sortOrder: 3 },
          { id: 'opt-room-ensuite', categoryId: category.id, key: 'ensuite', name: 'Ensuite', color: '#0891B2', isDefault: false, sortOrder: 4 },
          { id: 'opt-room-laundry', categoryId: category.id, key: 'laundry', name: 'Laundry', color: '#65A30D', isDefault: false, sortOrder: 5 },
        ];
        break;
      case 'estimate_item.unit':
        optionsToInsert = [
          { id: 'opt-estimate-item-unit-ea', categoryId: category.id, key: 'ea', name: 'ea', color: '#6B7280', isDefault: true, sortOrder: 0 },
          { id: 'opt-estimate-item-unit-m', categoryId: category.id, key: 'm', name: 'm', color: '#6B7280', isDefault: false, sortOrder: 1 },
          { id: 'opt-estimate-item-unit-m2', categoryId: category.id, key: 'm²', name: 'm²', color: '#6B7280', isDefault: false, sortOrder: 2 },
          { id: 'opt-estimate-item-unit-m3', categoryId: category.id, key: 'm³', name: 'm³', color: '#6B7280', isDefault: false, sortOrder: 3 },
          { id: 'opt-estimate-item-unit-item', categoryId: category.id, key: 'item', name: 'item', color: '#6B7280', isDefault: false, sortOrder: 4 },
          { id: 'opt-estimate-item-unit-hr', categoryId: category.id, key: 'hr', name: 'hr', color: '#6B7280', isDefault: false, sortOrder: 5 },
          { id: 'opt-estimate-item-unit-day', categoryId: category.id, key: 'day', name: 'day', color: '#6B7280', isDefault: false, sortOrder: 6 },
          { id: 'opt-estimate-item-unit-load', categoryId: category.id, key: 'load', name: 'load', color: '#6B7280', isDefault: false, sortOrder: 7 },
          { id: 'opt-estimate-item-unit-tonne', categoryId: category.id, key: 'tonne', name: 'tonne', color: '#6B7280', isDefault: false, sortOrder: 8 },
          { id: 'opt-estimate-item-unit-kg', categoryId: category.id, key: 'kg', name: 'kg', color: '#6B7280', isDefault: false, sortOrder: 9 },
          { id: 'opt-estimate-item-unit-set', categoryId: category.id, key: 'set', name: 'set', color: '#6B7280', isDefault: false, sortOrder: 10 },
        ];
        break;
    }

    if (optionsToInsert.length > 0) {
      const optionsWithTimestamps = optionsToInsert.map(option => ({
        ...option,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }));
      
      await db.insert(schema.fieldOptions).values(optionsWithTimestamps);
    }
  }

  private async seedDefaultFieldCategories(): Promise<void> {
    const now = new Date();
    
    const defaultCategories = [
      {
        id: 'cat-task-status',
        key: 'task.status', 
        label: 'Task Statuses',
        entity: 'task',
        description: 'Status options for tasks',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-task-priority',
        key: 'task.priority',
        label: 'Task Priorities', 
        entity: 'task',
        description: 'Priority levels for tasks',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-trade-types',
        key: 'task.trade',
        label: 'Trade Categories',
        entity: 'task',
        description: 'Construction trade categories',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 3,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-selection-categories',
        key: 'selection.category',
        label: 'Selection Categories',
        entity: 'selection',
        description: 'Categories for selections',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 4,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-location-rooms',
        key: 'selection.room',
        label: 'Locations/Rooms',
        entity: 'selection',
        description: 'Room/location options for selections',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 5,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-checklist-type',
        key: 'checklist.type',
        label: 'Checklist Types',
        entity: 'checklist',
        description: 'Type categories for checklist templates',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 6,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.insert(schema.fieldCategories).values(defaultCategories);
    
    // Now seed the field options for each category
    await this.seedDefaultFieldOptions(now);
  }

  private async seedDefaultFieldOptions(now: Date): Promise<void> {
    const fieldOptions = [
      // Task Status Options
      { id: 'opt-status-todo', categoryId: 'cat-task-status', key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
      { id: 'opt-status-progress', categoryId: 'cat-task-status', key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
      { id: 'opt-status-done', categoryId: 'cat-task-status', key: 'done', name: 'Done', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
      { id: 'opt-status-hold', categoryId: 'cat-task-status', key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 3 },
      
      // Task Priority Options
      { id: 'opt-priority-low', categoryId: 'cat-task-priority', key: 'low', name: 'Low', color: '#10B981', isDefault: false, sortOrder: 0 },
      { id: 'opt-priority-medium', categoryId: 'cat-task-priority', key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: true, sortOrder: 1 },
      { id: 'opt-priority-high', categoryId: 'cat-task-priority', key: 'high', name: 'High', color: '#EF4444', isDefault: false, sortOrder: 2 },
      
      // Trade Categories
      { id: 'opt-trade-electrical', categoryId: 'cat-trade-types', key: 'electrical', name: 'Electrical', color: '#3B82F6', isDefault: true, sortOrder: 0 },
      { id: 'opt-trade-plumbing', categoryId: 'cat-trade-types', key: 'plumbing', name: 'Plumbing', color: '#06B6D4', isDefault: false, sortOrder: 1 },
      { id: 'opt-trade-carpentry', categoryId: 'cat-trade-types', key: 'carpentry', name: 'Carpentry', color: '#D97706', isDefault: false, sortOrder: 2 },
      { id: 'opt-trade-painting', categoryId: 'cat-trade-types', key: 'painting', name: 'Painting & Decorating', color: '#7C3AED', isDefault: false, sortOrder: 3 },
      { id: 'opt-trade-flooring', categoryId: 'cat-trade-types', key: 'flooring', name: 'Flooring', color: '#059669', isDefault: false, sortOrder: 4 },
      
      // Selection Categories
      { id: 'opt-sel-fixtures', categoryId: 'cat-selection-categories', key: 'fixtures', name: 'Fixtures & Fittings', color: '#8B5CF6', isDefault: true, sortOrder: 0 },
      { id: 'opt-sel-finishes', categoryId: 'cat-selection-categories', key: 'finishes', name: 'Finishes', color: '#EC4899', isDefault: false, sortOrder: 1 },
      { id: 'opt-sel-appliances', categoryId: 'cat-selection-categories', key: 'appliances', name: 'Appliances', color: '#F59E0B', isDefault: false, sortOrder: 2 },
      
      // Locations/Rooms
      { id: 'opt-room-kitchen', categoryId: 'cat-location-rooms', key: 'kitchen', name: 'Kitchen', color: '#059669', isDefault: true, sortOrder: 0 },
      { id: 'opt-room-living', categoryId: 'cat-location-rooms', key: 'living', name: 'Living Room', color: '#DC2626', isDefault: false, sortOrder: 1 },
      { id: 'opt-room-master', categoryId: 'cat-location-rooms', key: 'master-bedroom', name: 'Master Bedroom', color: '#7C3AED', isDefault: false, sortOrder: 2 },
      { id: 'opt-room-bathroom', categoryId: 'cat-location-rooms', key: 'main-bathroom', name: 'Main Bathroom', color: '#06B6D4', isDefault: false, sortOrder: 3 },
      { id: 'opt-room-ensuite', categoryId: 'cat-location-rooms', key: 'ensuite', name: 'Ensuite', color: '#0891B2', isDefault: false, sortOrder: 4 },
      { id: 'opt-room-laundry', categoryId: 'cat-location-rooms', key: 'laundry', name: 'Laundry', color: '#65A30D', isDefault: false, sortOrder: 5 },
      
      // Checklist Types
      { id: 'opt-checklist-type-task', categoryId: 'cat-checklist-type', key: 'Task', name: 'Task', color: '#3B82F6', isDefault: true, sortOrder: 0 },
      { id: 'opt-checklist-type-job', categoryId: 'cat-checklist-type', key: 'Job', name: 'Job', color: '#10B981', isDefault: false, sortOrder: 1 },
      { id: 'opt-checklist-type-estimation', categoryId: 'cat-checklist-type', key: 'Estimation', name: 'Estimation', color: '#8B5CF6', isDefault: false, sortOrder: 2 },
      { id: 'opt-checklist-type-lead', categoryId: 'cat-checklist-type', key: 'Lead', name: 'Lead', color: '#F59E0B', isDefault: false, sortOrder: 3 },
    ];

    const fieldOptionsWithTimestamps = fieldOptions.map(option => ({
      ...option,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(schema.fieldOptions).values(fieldOptionsWithTimestamps);
  }

  // Seed missing built-in field categories (for production databases that predate new categories)
  async seedMissingBuiltInCategories(): Promise<{ addedCategories: string[]; addedOptions: string[] }> {
    const now = new Date();
    const addedCategories: string[] = [];
    const addedOptions: string[] = [];
    
    // Define all built-in categories that should exist
    const builtInCategories = [
      { id: 'cat-task-status', key: 'task.status', label: 'Task Statuses', entity: 'task', description: 'Status options for tasks', sortOrder: 1 },
      { id: 'cat-task-priority', key: 'task.priority', label: 'Task Priorities', entity: 'task', description: 'Priority levels for tasks', sortOrder: 2 },
      { id: 'cat-trade-types', key: 'task.trade', label: 'Trade Categories', entity: 'task', description: 'Construction trade categories', sortOrder: 3 },
      { id: 'cat-selection-categories', key: 'selection.category', label: 'Selection Categories', entity: 'selection', description: 'Categories for selections', sortOrder: 4 },
      { id: 'cat-location-rooms', key: 'selection.room', label: 'Locations/Rooms', entity: 'selection', description: 'Room/location options for selections', sortOrder: 5 },
      { id: 'cat-checklist-type', key: 'checklist.type', label: 'Checklist Types', entity: 'checklist', description: 'Type categories for checklist templates', sortOrder: 6 },
    ];
    
    // Check which categories are missing
    const existingCategories = await db.select({ key: schema.fieldCategories.key }).from(schema.fieldCategories);
    const existingKeys = new Set(existingCategories.map(c => c.key));
    
    for (const category of builtInCategories) {
      if (!existingKeys.has(category.key)) {
        await db.insert(schema.fieldCategories).values({
          ...category,
          isBuiltIn: true,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        addedCategories.push(category.key);
        
        // Seed default options for this category
        const newOptions = await this.seedOptionsForCategory(category.key, category.id, now);
        addedOptions.push(...newOptions);
      }
    }
    
    return { addedCategories, addedOptions };
  }
  
  private async seedOptionsForCategory(categoryKey: string, categoryId: string, now: Date): Promise<string[]> {
    const addedOptions: string[] = [];
    let optionsToInsert: { id: string; categoryId: string; key: string; name: string; color: string; isDefault: boolean; isCompleted?: boolean; sortOrder: number }[] = [];
    
    switch (categoryKey) {
      case 'checklist.type':
        optionsToInsert = [
          { id: 'opt-checklist-type-task', categoryId, key: 'Task', name: 'Task', color: '#3B82F6', isDefault: true, sortOrder: 0 },
          { id: 'opt-checklist-type-job', categoryId, key: 'Job', name: 'Job', color: '#10B981', isDefault: false, sortOrder: 1 },
          { id: 'opt-checklist-type-estimation', categoryId, key: 'Estimation', name: 'Estimation', color: '#8B5CF6', isDefault: false, sortOrder: 2 },
          { id: 'opt-checklist-type-lead', categoryId, key: 'Lead', name: 'Lead', color: '#F59E0B', isDefault: false, sortOrder: 3 },
        ];
        break;
      case 'task.status':
        optionsToInsert = [
          { id: 'opt-status-todo', categoryId, key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-status-progress', categoryId, key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-status-done', categoryId, key: 'done', name: 'Done', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
          { id: 'opt-status-hold', categoryId, key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, isCompleted: false, sortOrder: 3 },
        ];
        break;
      case 'task.priority':
        optionsToInsert = [
          { id: 'opt-priority-low', categoryId, key: 'low', name: 'Low', color: '#10B981', isDefault: false, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: true, sortOrder: 1 },
          { id: 'opt-priority-high', categoryId, key: 'high', name: 'High', color: '#EF4444', isDefault: false, sortOrder: 2 },
        ];
        break;
      // Add other categories as needed
    }
    
    if (optionsToInsert.length > 0) {
      const optionsWithTimestamps = optionsToInsert.map(option => ({
        ...option,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }));
      
      await db.insert(schema.fieldOptions).values(optionsWithTimestamps);
      addedOptions.push(...optionsToInsert.map(o => o.name));
    }
    
    return addedOptions;
  }

  private async seedDefaultCustomFields(): Promise<void> {
    const now = new Date();
    
    const defaultCustomFields = [
      {
        id: 'cfd-task-custom-1',
        key: 'task_custom_field_1',
        label: 'Task Custom Field 1',
        type: 'text',
        required: false,
        order: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.insert(schema.customFieldDefs).values(defaultCustomFields);
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.googleId, googleId)).limit(1);
    return user;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined> {
    const [user] = await db.update(schema.users)
      .set({ googleId, updatedAt: new Date() })
      .where(eq(schema.users.id, userId))
      .returning();
    return user;
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await db.update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  }

  async validateUserCredentials(username: string, plainPassword: string): Promise<User | undefined> {
    const user = await this.getUserByUsername(username);
    if (!user) return undefined;
    
    const isValid = await PasswordUtils.verifyPassword(plainPassword, user.password);
    return isValid ? user : undefined;
  }

  async getUserWithRole(id: string): Promise<UserWithRole | undefined> {
    const user = await this.getUser(id);
    if (!user) return undefined;
    
    let role;
    if (user.roleId) {
      role = await this.getUserRole(user.roleId);
    }
    
    return { ...user, role };
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      // CRITICAL SECURITY FIX: Hash password before storing (matches MemStorage)
      const processedUser = { ...insertUser };
      if (insertUser.password) {
        console.log(`[DbStorage.createUser] Hashing password for user: ${insertUser.email || insertUser.username}`);
        processedUser.password = await PasswordUtils.hashPassword(insertUser.password);
      }
      
      const [user] = await db.insert(schema.users).values(processedUser).returning();
      console.log(`[DbStorage.createUser] Created user: ${user.id} (${user.email})`);
      return user;
    } catch (error: any) {
      console.error(`[DbStorage.createUser] Error creating user:`, error.message || error);
      throw error;
    }
  }

  // Required for Replit Auth - upsert user based on Replit ID or email
  async upsertUser(userData: import("@shared/schema").UpsertUser): Promise<User> {
    console.log('🔍 [upsertUser] Input:', {
      id: userData.id,
      email: userData.email,
      firstName: userData.firstName,
      lastName: userData.lastName
    });
    
    // Handle migration from old auth: if email exists with different ID, update existing user
    if (userData.email) {
      const existingUser = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, userData.email))
        .limit(1);
      
      console.log('🔍 [upsertUser] Existing user lookup:', {
        email: userData.email,
        found: existingUser.length > 0,
        existingId: existingUser[0]?.id,
        incomingId: userData.id,
        idsMatch: existingUser[0]?.id === userData.id,
        // Log Google Calendar token status BEFORE any updates
        googleCalendarConnected: !!existingUser[0]?.googleCalendarAccessToken,
        googleCalendarEmail: existingUser[0]?.googleCalendarEmail || null,
      });
      
      if (existingUser.length > 0 && existingUser[0].id !== userData.id) {
        // Email exists with different ID - keep the EXISTING ID (don't break foreign keys!)
        // Just update profile info and clear password (they're using Replit Auth now)
        console.log('✅ [upsertUser] Updating existing user by email');
        const [updatedUser] = await db
          .update(schema.users)
          .set({
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            password: null, // Clear password since using Replit Auth
            updatedAt: new Date(),
          })
          .where(eq(schema.users.email, userData.email))
          .returning();
        
        // Fetch full user with role/company to populate companyId
        const userWithRole = await this.getUserWithRole(updatedUser.id);
        const fullUser = userWithRole as User;
        console.log('✅ [upsertUser] Returned user:', { id: fullUser.id, email: fullUser.email, companyId: fullUser.companyId });
        return fullUser;
      }
    }
    
    // Standard upsert by ID - only update auth fields, preserve companyId/roleId/etc
    console.log('📝 [upsertUser] No existing user by email, doing standard upsert by ID');
    const [upsertedUser] = await db
      .insert(schema.users)
      .values(userData)
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          // Only update auth-specific fields, leave companyId/roleId intact
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    // Fetch full user with role/company to populate companyId
    const userWithRole = await this.getUserWithRole(upsertedUser.id);
    const fullUser = userWithRole as User;
    console.log('📝 [upsertUser] Upserted user:', { 
      id: fullUser.id, 
      email: fullUser.email, 
      companyId: fullUser.companyId, 
      isNew: !fullUser.companyId,
      // Log Google Calendar token status AFTER upsert to verify preservation
      googleCalendarConnected: !!fullUser.googleCalendarAccessToken,
      googleCalendarEmail: fullUser.googleCalendarEmail || null,
    });
    return fullUser;
  }

  async updateUser(id: string, userData: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(schema.users).set({
      ...userData,
      updatedAt: new Date()
    }).where(eq(schema.users.id, id)).returning();
    return user;
  }

  async changeUserPassword(id: string, newPassword: string): Promise<User | undefined> {
    const hashedPassword = await PasswordUtils.hashPassword(newPassword);
    const [user] = await db.update(schema.users).set({
      password: hashedPassword,
      updatedAt: new Date()
    }).where(eq(schema.users.id, id)).returning();
    return user;
  }

  async getUsers(category?: UserCategory): Promise<UserWithRole[]> {
    const whereConditions = category
      ? and(
          eq(schema.users.userCategory, category),
          eq(schema.users.isActive, true)
        )
      : eq(schema.users.isActive, true);

    const results = await db
      .select({
        user: schema.users,
        role: schema.userRoles,
      })
      .from(schema.users)
      .leftJoin(schema.userRoles, eq(schema.users.roleId, schema.userRoles.id))
      .where(whereConditions);

    return results.map(({ user, role }) => ({
      ...user,
      role: role || undefined,
    }));
  }

  async getUsersByCompanyWithRoles(companyId: string, category?: UserCategory): Promise<UserWithRole[]> {
    const baseConditions = [
      eq(schema.users.companyId, companyId),
      eq(schema.users.isActive, true)
    ];
    
    if (category) {
      baseConditions.push(eq(schema.users.userCategory, category));
    }

    const results = await db
      .select({
        user: schema.users,
        role: schema.userRoles,
      })
      .from(schema.users)
      .leftJoin(schema.userRoles, eq(schema.users.roleId, schema.userRoles.id))
      .where(and(...baseConditions))
      .orderBy(
        asc(schema.userRoles.displayOrder),
        asc(schema.users.firstName),
        asc(schema.users.lastName)
      );

    return results.map(({ user, role }) => ({
      ...user,
      role: role || undefined,
    }));
  }

  async getUsersByCompany(companyId: string): Promise<schema.User[]> {
    try {
      const results = await db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.companyId, companyId),
            eq(schema.users.isActive, true)
          )
        );
      return results;
    } catch (error) {
      console.error("Database error in getUsersByCompany:", error);
      throw error;
    }
  }

  async getUsersByRole(companyId: string, roleId: string): Promise<schema.User[]> {
    try {
      const results = await db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.companyId, companyId),
            eq(schema.users.roleId, roleId),
            eq(schema.users.isActive, true)
          )
        );
      return results;
    } catch (error) {
      console.error("Database error in getUsersByRole:", error);
      throw error;
    }
  }

  async getAllCompanies(): Promise<schema.Company[]> {
    try {
      const results = await db
        .select()
        .from(schema.companies);
      return results;
    } catch (error) {
      console.error("Database error in getAllCompanies:", error);
      throw error;
    }
  }

  async findTaskByReference(
    companyId: string,
    referenceType: string,
    referenceId: string
  ): Promise<schema.Note | undefined> {
    try {
      const [task] = await db
        .select()
        .from(schema.notes)
        .where(
          and(
            eq(schema.notes.companyId, companyId),
            eq(schema.notes.type, "task"),
            eq(schema.notes.referenceType, referenceType),
            eq(schema.notes.referenceId, referenceId)
          )
        )
        .limit(1);
      return task;
    } catch (error) {
      console.error("Database error in findTaskByReference:", error);
      throw error;
    }
  }

  async getUserColumnPreferences(userId: string, pageKey: string): Promise<UserColumnPreferences | undefined> {
    const [preference] = await db
      .select()
      .from(schema.userColumnPreferences)
      .where(
        and(
          eq(schema.userColumnPreferences.userId, userId),
          eq(schema.userColumnPreferences.pageKey, pageKey)
        )
      )
      .limit(1);
    return preference;
  }

  async saveUserColumnPreferences(preferences: InsertUserColumnPreferences): Promise<UserColumnPreferences> {
    const existing = await this.getUserColumnPreferences(preferences.userId, preferences.pageKey);
    
    if (existing) {
      const [updated] = await db
        .update(schema.userColumnPreferences)
        .set({
          columnConfig: preferences.columnConfig,
          updatedAt: new Date(),
        })
        .where(eq(schema.userColumnPreferences.id, existing.id))
        .returning();
      return updated;
    }
    
    const [newPreference] = await db
      .insert(schema.userColumnPreferences)
      .values(preferences)
      .returning();
    return newPreference;
  }

  async getUserViewPreferences(userId: string, viewKey: string): Promise<UserViewPreferences | undefined> {
    const [preference] = await db
      .select()
      .from(schema.userViewPreferences)
      .where(
        and(
          eq(schema.userViewPreferences.userId, userId),
          eq(schema.userViewPreferences.viewKey, viewKey)
        )
      )
      .limit(1);
    return preference;
  }

  async saveUserViewPreferences(preferences: InsertUserViewPreferences): Promise<UserViewPreferences> {
    const existing = await this.getUserViewPreferences(preferences.userId, preferences.viewKey);
    
    if (existing) {
      const [updated] = await db
        .update(schema.userViewPreferences)
        .set({
          preferences: preferences.preferences,
          updatedAt: new Date(),
        })
        .where(eq(schema.userViewPreferences.id, existing.id))
        .returning();
      return updated;
    }
    
    const [newPreference] = await db
      .insert(schema.userViewPreferences)
      .values(preferences)
      .returning();
    return newPreference;
  }

  // Tasks CRUD operations
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }): Promise<Task[]> {
    const conditions = [eq(schema.notes.type, "task")];
    
    if (businessTasks) {
      // Business tasks: use new taskContextType='business' or fallback to legacy (null projectId)
      conditions.push(
        or(
          eq(schema.notes.taskContextType, "business"),
          // Legacy fallback for tasks not yet migrated
          and(isNull(schema.notes.taskContextType), isNull(schema.notes.projectId))
        )!
      );
    } else if (projectId) {
      // Project tasks: use new taskContextType='project' and matching contextId, or legacy projectId
      conditions.push(
        or(
          and(eq(schema.notes.taskContextType, "project"), eq(schema.notes.taskContextId, projectId)),
          // Legacy fallback
          and(isNull(schema.notes.taskContextType), eq(schema.notes.projectId, projectId))
        )!
      );
    }
    if (status) {
      conditions.push(eq(schema.notes.status, status));
    }
    if (assigneeId) {
      // Filter by assigneeId - notes table uses single assigneeId field
      conditions.push(eq(schema.notes.assigneeId, assigneeId));
    }
    
    // Add date range filtering for calendar performance
    if (dateRange?.startDate) {
      conditions.push(gte(schema.notes.dueDate, new Date(dateRange.startDate)));
    }
    if (dateRange?.endDate) {
      conditions.push(lte(schema.notes.dueDate, new Date(dateRange.endDate)));
    }
    
    const tasks = await db.select().from(schema.notes).where(
      conditions.length === 1 ? conditions[0] : and(...conditions)
    );
    return tasks as Task[];
  }

  async getTasksByCompany(companyId: string): Promise<Task[]> {
    const tasks = await db.select()
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.type, "task"),
          eq(schema.notes.companyId, companyId)
        )
      );
    return tasks as Task[];
  }

  async getTasksByUser(userId: string, companyId: string): Promise<Task[]> {
    // Get all tasks in this company that are assigned to this user
    // Check both assigneeId (single user) and assignedTo array (multiple users)
    const allCompanyTasks = await db.select()
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.type, "task"),
          eq(schema.notes.companyId, companyId)
        )
      )
      .orderBy(desc(schema.notes.createdAt));
    
    // Get valid project IDs for this company
    const projectIds = new Set(
      (await db.select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.companyId, companyId))
      ).map(p => p.id)
    );
    
    const filteredTasks = allCompanyTasks.filter(task => {
      // Check if user is assigned via:
      // 1. Legacy assigneeId field
      // 2. Polymorphic model (assigneeType='user' and assigneeUserId matches)
      // 3. assignedTo array (multiple assignees)
      const isAssignedLegacy = task.assigneeId === userId;
      const isAssignedPolymorphic = task.assigneeType === 'user' && task.assigneeUserId === userId;
      const isAssignedArray = Array.isArray(task.assignedTo) && task.assignedTo.includes(userId);
      const isAssigned = isAssignedLegacy || isAssignedPolymorphic || isAssignedArray;
      if (!isAssigned) return false;
      
      // Business-level tasks - always include if assigned
      if (task.taskContextType === "business") return true;
      if (!task.taskContextType && !task.projectId) return true; // Legacy business task
      
      // Project-level tasks - verify project belongs to company
      const taskProjectId = task.taskContextId || task.projectId;
      if (taskProjectId && projectIds.has(taskProjectId)) return true;
      
      return false;
    });
    
    return filteredTasks as Task[];
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(schema.notes)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.type, "task")))
      .limit(1);
    return task as Task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    // Enforce polymorphic context - derive from projectId if not provided
    let taskContextType = insertTask.taskContextType;
    let taskContextId = insertTask.taskContextId;
    
    if (!taskContextType) {
      if (insertTask.projectId) {
        taskContextType = "project";
        taskContextId = insertTask.projectId;
      } else if (insertTask.companyId) {
        taskContextType = "business";
        taskContextId = insertTask.companyId;
      }
    }
    
    // Strict enforcement: reject task creation if context cannot be resolved
    if (!taskContextType || !taskContextId) {
      throw new Error('[createTask] Cannot create task without valid context - either projectId or companyId must be provided');
    }
    
    const [task] = await db.insert(schema.notes).values({
      ...insertTask,
      type: "task",
      taskContextType,
      taskContextId
    }).returning();
    return task as Task;
  }

  async updateTask(id: string, taskData: Partial<InsertTask>): Promise<Task | undefined> {
    // If assigneeId is being updated, look up the assignee name
    let updateData: any = { ...taskData };
    if ('assigneeId' in taskData) {
      if (taskData.assigneeId) {
        // Fetch the user to get their name
        const [user] = await db.select()
          .from(schema.users)
          .where(eq(schema.users.id, taskData.assigneeId))
          .limit(1);
        if (user) {
          updateData.assigneeName = `${user.firstName} ${user.lastName}`.trim();
        }
      } else {
        // assigneeId is being cleared
        updateData.assigneeName = null;
      }
    }
    
    const [task] = await db.update(schema.notes).set({
      ...updateData,
      updatedAt: new Date()
    }).where(eq(schema.notes.id, id)).returning();
    return task as Task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await db.delete(schema.notes).where(eq(schema.notes.id, id));
    return result.rowCount > 0;
  }

  async updateTaskStatus(id: string, status: "todo" | "in-progress" | "done"): Promise<Task | undefined> {
    const completedAt = status === "done" ? new Date() : null;
    const [task] = await db.update(schema.notes).set({
      status,
      completedAt,
      updatedAt: new Date()
    }).where(eq(schema.notes.id, id)).returning();
    return task as Task;
  }

  // Selections CRUD
  async getSelections(projectId: string): Promise<Selection[]> {
    return await db.select().from(schema.selections).where(eq(schema.selections.projectId, projectId));
  }

  async getSelection(id: string): Promise<Selection | undefined> {
    const [selection] = await db.select().from(schema.selections).where(eq(schema.selections.id, id)).limit(1);
    return selection;
  }

  async getSelectionWithOptions(id: string): Promise<SelectionWithOptions | undefined> {
    const selection = await this.getSelection(id);
    if (!selection) return undefined;

    const options = await this.getSelectionOptions(id);
    return {
      ...selection,
      options
    };
  }

  async createSelection(insertSelection: InsertSelection): Promise<Selection> {
    const [selection] = await db.insert(schema.selections).values(insertSelection).returning();
    return selection;
  }

  async updateSelection(id: string, selectionData: Partial<InsertSelection>): Promise<Selection | undefined> {
    const [selection] = await db.update(schema.selections).set({
      ...selectionData,
      updatedAt: new Date()
    }).where(eq(schema.selections.id, id)).returning();
    return selection;
  }

  async deleteSelection(id: string): Promise<boolean> {
    const result = await db.delete(schema.selections).where(eq(schema.selections.id, id));
    return result.rowCount > 0;
  }

  // Selection Options CRUD
  async getSelectionOptions(selectionId: string): Promise<SelectionOption[]> {
    return await db.select().from(schema.selectionOptions).where(eq(schema.selectionOptions.selectionId, selectionId));
  }

  async getSelectionOption(id: string): Promise<SelectionOption | undefined> {
    const [option] = await db.select().from(schema.selectionOptions).where(eq(schema.selectionOptions.id, id)).limit(1);
    return option;
  }

  async createSelectionOption(insertOption: InsertSelectionOption): Promise<SelectionOption> {
    const [option] = await db.insert(schema.selectionOptions).values(insertOption).returning();
    return option;
  }

  async updateSelectionOption(id: string, optionData: Partial<InsertSelectionOption>): Promise<SelectionOption | undefined> {
    const [option] = await db.update(schema.selectionOptions).set({
      ...optionData,
      updatedAt: new Date()
    }).where(eq(schema.selectionOptions.id, id)).returning();
    return option;
  }

  async deleteSelectionOption(id: string): Promise<boolean> {
    const result = await db.delete(schema.selectionOptions).where(eq(schema.selectionOptions.id, id));
    return result.rowCount > 0;
  }

  // User Roles CRUD
  async getUserRoles(category?: UserCategory, companyId?: string): Promise<UserRole[]> {
    try {
      const conditions = [];
      if (category) {
        conditions.push(eq(schema.userRoles.userCategory, category));
      }
      if (companyId) {
        conditions.push(eq(schema.userRoles.companyId, companyId));
      }
      
      if (conditions.length > 0) {
        return await db.select()
          .from(schema.userRoles)
          .where(and(...conditions))
          .orderBy(asc(schema.userRoles.displayOrder), asc(schema.userRoles.name));
      }
      
      return await db.select()
        .from(schema.userRoles)
        .orderBy(asc(schema.userRoles.displayOrder), asc(schema.userRoles.name));
    } catch (error) {
      console.error("Database error in getUserRoles:", error);
      throw error;
    }
  }

  async getUserRole(id: string, companyId?: string): Promise<UserRole | undefined> {
    try {
      const conditions = [eq(schema.userRoles.id, id)];
      if (companyId) {
        conditions.push(eq(schema.userRoles.companyId, companyId));
      }
      
      const results = await db.select()
        .from(schema.userRoles)
        .where(and(...conditions))
        .limit(1);
      return results[0];
    } catch (error) {
      console.error("Database error in getUserRole:", error);
      throw error;
    }
  }

  async createUserRole(role: InsertUserRole): Promise<UserRole> {
    try {
      // Calculate displayOrder: max(existing displayOrder) + 1 per company
      let displayOrder = role.displayOrder;
      if (displayOrder === undefined || displayOrder === null) {
        const maxResult = await db.select({ maxOrder: sql<number>`COALESCE(MAX(${schema.userRoles.displayOrder}), -1)` })
          .from(schema.userRoles)
          .where(eq(schema.userRoles.companyId, role.companyId));
        displayOrder = (maxResult[0]?.maxOrder ?? -1) + 1;
      }
      
      const results = await db.insert(schema.userRoles)
        .values({ ...role, displayOrder })
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in createUserRole:", error);
      throw error;
    }
  }

  async updateUserRole(id: string, role: Partial<InsertUserRole>, companyId?: string): Promise<UserRole | undefined> {
    try {
      const conditions = [eq(schema.userRoles.id, id)];
      if (companyId) {
        conditions.push(eq(schema.userRoles.companyId, companyId));
      }
      
      const results = await db.update(schema.userRoles)
        .set({ ...role, updatedAt: new Date() })
        .where(and(...conditions))
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in updateUserRole:", error);
      throw error;
    }
  }

  async deleteUserRole(id: string, companyId?: string): Promise<boolean> {
    try {
      // First check if role exists
      const role = await this.getUserRole(id, companyId);
      if (!role) {
        return false; // Role doesn't exist or doesn't belong to company
      }

      // Check if role is built-in
      if (role.isBuiltIn) {
        return false; // Cannot delete built-in roles
      }

      // Check if any active users have this roleId assigned
      const userCount = await db.select({ count: sql<number>`COUNT(*)` })
        .from(schema.users)
        .where(and(
          eq(schema.users.roleId, id),
          eq(schema.users.isActive, true)
        ));
      
      if (userCount[0]?.count > 0) {
        return false; // Cannot delete role with assigned users
      }

      // Hard delete the role
      const conditions = [eq(schema.userRoles.id, id)];
      if (companyId) {
        conditions.push(eq(schema.userRoles.companyId, companyId));
      }
      
      const results = await db.delete(schema.userRoles)
        .where(and(...conditions))
        .returning();
      return results.length > 0;
    } catch (error) {
      console.error("Database error in deleteUserRole:", error);
      throw error;
    }
  }

  async updateUserRolesOrder(updates: Array<{id: string, displayOrder: number}>, companyId?: string): Promise<void> {
    try {
      // Update each role's displayOrder in a transaction
      await db.transaction(async (tx) => {
        for (const update of updates) {
          const conditions = [eq(schema.userRoles.id, update.id)];
          if (companyId) {
            conditions.push(eq(schema.userRoles.companyId, companyId));
          }
          
          await tx.update(schema.userRoles)
            .set({ displayOrder: update.displayOrder, updatedAt: new Date() })
            .where(and(...conditions));
        }
      });
    } catch (error) {
      console.error("Database error in updateUserRolesOrder:", error);
      throw error;
    }
  }

  async seedDefaultRolesForCompany(companyId: string): Promise<string> {
    try {
      const builtInRoles = [
        { companyId, name: "General Manager", description: "Full system administration access", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 0 },
        { companyId, name: "Office Manager", description: "Office operations management", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 1 },
        { companyId, name: "Construction Manager", description: "Construction oversight and management", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 2 },
        { companyId, name: "Foreman", description: "Site-based team lead", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 3 },
        { companyId, name: "Carpenter", description: "Carpentry specialist", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 4 },
        { companyId, name: "Apprentice", description: "Learning team member", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 5 },
        { companyId, name: "Subcontractor", description: "External subcontractor with limited access", userCategory: "supplier" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 6 },
      ];

      let generalManagerRoleId = '';

      await db.transaction(async (tx) => {
        // Insert all roles
        const insertedRoles = await tx.insert(schema.userRoles)
          .values(builtInRoles)
          .returning();

        // Find General Manager role
        const generalManagerRole = insertedRoles.find(r => r.name === "General Manager");
        if (!generalManagerRole) {
          throw new Error("Failed to create General Manager role");
        }
        generalManagerRoleId = generalManagerRole.id;

        // Get all permissions
        const allPermissions = await tx.select().from(schema.permissions);

        // Create role permissions for General Manager (full access)
        const rolePermissions = allPermissions.map(permission => ({
          roleId: generalManagerRoleId,
          permissionId: permission.id,
          allowedActions: permission.actions as PermissionAction[],
        }));

        if (rolePermissions.length > 0) {
          await tx.insert(schema.rolePermissions).values(rolePermissions);
        }
      });

      return generalManagerRoleId;
    } catch (error) {
      console.error("Database error in seedDefaultRolesForCompany:", error);
      throw error;
    }
  }

  // Permissions CRUD
  async getPermissions(category?: string): Promise<Permission[]> {
    try {
      if (category) {
        return await db.select()
          .from(schema.permissions)
          .where(eq(schema.permissions.category, category))
          .orderBy(schema.permissions.key);
      }
      return await db.select()
        .from(schema.permissions)
        .orderBy(schema.permissions.key);
    } catch (error) {
      console.error("Database error in getPermissions:", error);
      throw error;
    }
  }

  async getPermission(id: string): Promise<Permission | undefined> {
    try {
      const results = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.id, id))
        .limit(1);
      return results[0];
    } catch (error) {
      console.error("Database error in getPermission:", error);
      throw error;
    }
  }

  async createPermission(permission: InsertPermission): Promise<Permission> {
    try {
      const results = await db.insert(schema.permissions)
        .values(permission)
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in createPermission:", error);
      throw error;
    }
  }

  async updatePermission(id: string, permission: Partial<InsertPermission>): Promise<Permission | undefined> {
    try {
      const results = await db.update(schema.permissions)
        .set({ ...permission, updatedAt: new Date() })
        .where(eq(schema.permissions.id, id))
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in updatePermission:", error);
      throw error;
    }
  }

  async deletePermission(id: string): Promise<boolean> {
    try {
      const results = await db.delete(schema.permissions)
        .where(eq(schema.permissions.id, id))
        .returning();
      return results.length > 0;
    } catch (error) {
      console.error("Database error in deletePermission:", error);
      throw error;
    }
  }

  // Role Permissions CRUD
  async getRolePermissions(roleId: string): Promise<RolePermission[]> {
    try {
      return await db.select()
        .from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, roleId));
    } catch (error) {
      console.error("Database error in getRolePermissions:", error);
      throw error;
    }
  }

  async createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission> {
    try {
      const results = await db.insert(schema.rolePermissions)
        .values(rolePermission)
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in createRolePermission:", error);
      throw error;
    }
  }

  async updateRolePermission(id: string, rolePermission: Partial<InsertRolePermission>): Promise<RolePermission | undefined> {
    try {
      const results = await db.update(schema.rolePermissions)
        .set({ ...rolePermission, updatedAt: new Date() })
        .where(eq(schema.rolePermissions.id, id))
        .returning();
      return results[0];
    } catch (error) {
      console.error("Database error in updateRolePermission:", error);
      throw error;
    }
  }

  async deleteRolePermission(id: string): Promise<boolean> {
    try {
      const results = await db.delete(schema.rolePermissions)
        .where(eq(schema.rolePermissions.id, id))
        .returning();
      return results.length > 0;
    } catch (error) {
      console.error("Database error in deleteRolePermission:", error);
      throw error;
    }
  }

  async setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[], viewScope?: string, viewableRoleIds?: string[] }[]): Promise<void> {
    try {
      await db.delete(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, roleId));

      if (permissions.length > 0) {
        await db.insert(schema.rolePermissions)
          .values(permissions.map(p => ({
            roleId,
            permissionId: p.permissionId,
            allowedActions: p.allowedActions,
            viewScope: p.viewScope || "own",
            viewableRoleIds: p.viewableRoleIds || [],
          })));
      }
    } catch (error) {
      console.error("Database error in setRolePermissions:", error);
      throw error;
    }
  }

  async getUserTimesheetViewScope(userId: string): Promise<{ viewScope: string; viewableRoleIds: string[] }> {
    try {
      const user = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user.length || !user[0].roleId) {
        return { viewScope: "own", viewableRoleIds: [] };
      }

      const role = await db.select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.id, user[0].roleId))
        .limit(1);

      if (role.length) {
        const roleName = role[0].name?.toLowerCase() || '';
        const isAdminRole = 
          roleName.includes('admin') || 
          roleName.includes('general manage') || 
          roleName.includes('owner') ||
          roleName === 'general manager';
        if (isAdminRole) {
          return { viewScope: "all", viewableRoleIds: [] };
        }
      }

      const timesheetPermission = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'projects.timesheet'))
        .limit(1);

      if (!timesheetPermission.length) {
        return { viewScope: "own", viewableRoleIds: [] };
      }

      const rolePermission = await db.select()
        .from(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, user[0].roleId),
            eq(schema.rolePermissions.permissionId, timesheetPermission[0].id)
          )
        )
        .limit(1);

      if (!rolePermission.length) {
        return { viewScope: "own", viewableRoleIds: [] };
      }

      return {
        viewScope: (rolePermission[0].viewScope as string) || "own",
        viewableRoleIds: (rolePermission[0].viewableRoleIds as string[]) || [],
      };
    } catch (error) {
      console.error("Database error in getUserTimesheetViewScope:", error);
      return { viewScope: "own", viewableRoleIds: [] };
    }
  }

  async checkUserPermission(userId: string, permissionKey: string, action: string): Promise<boolean> {
    try {
      const user = await this.getUser(userId);
      if (!user || !user.roleId) return false;

      // Check if user has an admin-level built-in role (bypass permission check)
      const role = await this.getUserRole(user.roleId);
      if (role && role.isBuiltIn) {
        const roleName = role.name?.toLowerCase() || '';
        const isAdminRole = 
          roleName.includes('admin') || 
          roleName.includes('general manage') || 
          roleName.includes('owner') ||
          roleName === 'general manager';
        if (isAdminRole) {
          return true; // Full access for built-in admin roles
        }
      }

      const rolePermissions = await db
        .select({
          permission: schema.permissions,
          rolePermission: schema.rolePermissions,
        })
        .from(schema.rolePermissions)
        .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
        .where(
          and(
            eq(schema.rolePermissions.roleId, user.roleId),
            eq(schema.permissions.key, permissionKey)
          )
        );

      if (rolePermissions.length === 0) return false;

      const rp = rolePermissions[0];
      const allowedActions = rp.rolePermission.allowedActions || [];
      return allowedActions.includes(action as PermissionAction);
    } catch (error) {
      console.error("Database error in checkUserPermission:", error);
      return false;
    }
  }

  async getUserProjectAccess(userId: string): Promise<UserProjectAccess[]> {
    try {
      const results = await db
        .select()
        .from(schema.userProjectAccess)
        .where(eq(schema.userProjectAccess.userId, userId));
      return results;
    } catch (error) {
      console.error("Database error in getUserProjectAccess:", error);
      return [];
    }
  }
  async createUserProjectAccess(access: InsertUserProjectAccess): Promise<UserProjectAccess> {
    try {
      const [result] = await db
        .insert(schema.userProjectAccess)
        .values(access)
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in createUserProjectAccess:", error);
      throw error;
    }
  }

  async updateUserProjectAccess(id: string, access: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined> {
    try {
      const [result] = await db
        .update(schema.userProjectAccess)
        .set(access)
        .where(eq(schema.userProjectAccess.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in updateUserProjectAccess:", error);
      return undefined;
    }
  }

  async deleteUserProjectAccess(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(schema.userProjectAccess)
        .where(eq(schema.userProjectAccess.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteUserProjectAccess:", error);
      return false;
    }
  }

  async grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess> {
    try {
      const existing = await db
        .select()
        .from(schema.userProjectAccess)
        .where(and(
          eq(schema.userProjectAccess.userId, userId),
          eq(schema.userProjectAccess.projectId, projectId)
        ));
      if (existing.length > 0) {
        const [updated] = await db
          .update(schema.userProjectAccess)
          .set({ accessLevel, grantedBy })
          .where(eq(schema.userProjectAccess.id, existing[0].id))
          .returning();
        return updated;
      }
      const [result] = await db
        .insert(schema.userProjectAccess)
        .values({ userId, projectId, accessLevel, grantedBy })
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in grantProjectAccess:", error);
      throw error;
    }
  }

  async revokeProjectAccess(userId: string, projectId: string): Promise<boolean> {
    try {
      await db
        .delete(schema.userProjectAccess)
        .where(and(
          eq(schema.userProjectAccess.userId, userId),
          eq(schema.userProjectAccess.projectId, projectId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in revokeProjectAccess:", error);
      return false;
    }
  }

  async getProjectTeamMembers(projectId: string): Promise<UserWithRole[]> {
    try {
      const accessRecords = await db
        .select()
        .from(schema.userProjectAccess)
        .where(eq(schema.userProjectAccess.projectId, projectId));

      if (accessRecords.length === 0) return [];

      const userIds = accessRecords.map(a => a.userId);
      const users = await db
        .select()
        .from(schema.users)
        .where(inArray(schema.users.id, userIds));

      const activeUsers = users.filter(u => u.isActive);
      const roleIds = activeUsers.map(u => u.roleId).filter(Boolean) as string[];

      let rolesMap: Record<string, any> = {};
      if (roleIds.length > 0) {
        const roles = await db
          .select()
          .from(schema.userRoles)
          .where(inArray(schema.userRoles.id, roleIds));
        rolesMap = Object.fromEntries(roles.map(r => [r.id, r]));
      }

      return activeUsers.map(user => ({
        ...user,
        role: user.roleId ? rolesMap[user.roleId] : undefined,
        userCategory: accessRecords.find(a => a.userId === user.id)?.accessLevel === 'supplier' ? 'supplier' as const : 'team' as const,
      })) as UserWithRole[];
    } catch (error) {
      console.error("Database error in getProjectTeamMembers:", error);
      return [];
    }
  }

  async getUserInvitations(status?: string): Promise<UserInvitation[]> {
    try {
      const conditions = [];
      if (status) {
        conditions.push(eq(schema.userInvitations.status, status));
      }
      
      const results = await db
        .select()
        .from(schema.userInvitations)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(schema.userInvitations.createdAt));
      
      return results;
    } catch (error) {
      console.error("Database error in getUserInvitations:", error);
      throw error;
    }
  }

  async getUserInvitationsByCompany(companyId: string, status?: string): Promise<UserInvitation[]> {
    try {
      const conditions = [eq(schema.userInvitations.companyId, companyId)];
      if (status) {
        conditions.push(eq(schema.userInvitations.status, status));
      }
      
      const results = await db
        .select()
        .from(schema.userInvitations)
        .where(and(...conditions))
        .orderBy(desc(schema.userInvitations.createdAt));
      
      return results;
    } catch (error) {
      console.error("Database error in getUserInvitationsByCompany:", error);
      throw error;
    }
  }
  async getUserInvitation(id: string): Promise<UserInvitation | undefined> { return undefined; }
  
  async getUserInvitationByToken(token: string): Promise<UserInvitation | undefined> {
    try {
      const [invitation] = await db.select()
        .from(schema.userInvitations)
        .where(eq(schema.userInvitations.inviteToken, token))
        .limit(1);
      return invitation;
    } catch (error) {
      console.error("Database error in getUserInvitationByToken:", error);
      throw error;
    }
  }
  
  async createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation> {
    try {
      const inviteToken = PasswordUtils.generateSecureToken();
      const expiresAt = PasswordUtils.generateInviteExpiry();
      
      const [created] = await db.insert(schema.userInvitations)
        .values({
          ...invitation,
          inviteToken,
          expiresAt,
          status: 'pending',
        })
        .returning();
      
      return created;
    } catch (error) {
      console.error("Database error in createUserInvitation:", error);
      throw error;
    }
  }
  
  async updateUserInvitation(id: string, invitation: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined> {
    try {
      const [updated] = await db.update(schema.userInvitations)
        .set({ ...invitation, updatedAt: new Date() })
        .where(eq(schema.userInvitations.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateUserInvitation:", error);
      throw error;
    }
  }
  
  async deleteUserInvitation(id: string): Promise<boolean> { return false; }
  
  async acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined> {
    try {
      console.log(`[DbStorage.acceptInvitation] Looking up invitation token: ${token?.substring(0, 8)}...`);
      const invitation = await this.getUserInvitationByToken(token);
      
      // SECURITY: Validate token, status, and expiry
      if (!invitation) {
        console.log('[DbStorage.acceptInvitation] Invitation not found');
        return undefined;
      }
      if (invitation.status !== "pending") {
        console.log(`[DbStorage.acceptInvitation] Invalid status: ${invitation.status}`);
        return undefined;
      }
      if (invitation.expiresAt && invitation.expiresAt < new Date()) {
        console.log(`[DbStorage.acceptInvitation] Invitation expired: ${invitation.expiresAt}`);
        return undefined;
      }

      // SECURITY: Ensure password is provided and validate
      if (!userData.password) {
        throw new Error("Password is required to accept invitation");
      }

      // Normalize firstName/lastName: prefer user input, fall back to invitation values
      // Trim and convert empty strings to null to avoid overwriting valid data
      const normalizedFirstName = userData.firstName?.trim() || invitation.firstName || null;
      const normalizedLastName = userData.lastName?.trim() || invitation.lastName || null;
      
      console.log(`[DbStorage.acceptInvitation] Processing for email: ${invitation.email}, firstName: ${normalizedFirstName}, lastName: ${normalizedLastName}`);
      
      // Check if a user already exists with this email (e.g., from Replit Auth)
      const existingUser = await this.getUserByEmail(invitation.email);
      
      let newUser: User;
      
      if (existingUser) {
        // User exists - update them with invitation data and activate
        console.log(`[DbStorage.acceptInvitation] Found existing user ${existingUser.id}, updating with invitation data`);
        const hashedPassword = await PasswordUtils.hashPassword(userData.password);
        
        const [updated] = await db.update(schema.users)
          .set({
            password: hashedPassword,
            firstName: normalizedFirstName,
            lastName: normalizedLastName,
            phone: invitation.phone || existingUser.phone,
            company: invitation.company || existingUser.company,
            userCategory: (invitation.userCategory as UserCategory) || existingUser.userCategory,
            roleId: invitation.roleId,
            companyId: invitation.companyId,
            isActive: true,
            isInvitePending: false,
            invitedBy: invitation.invitedBy,
            invitedAt: invitation.createdAt,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, existingUser.id))
          .returning();
        
        newUser = updated;
        console.log(`[DbStorage.acceptInvitation] Updated existing user: ${newUser.id}`);
      } else {
        // Create new user account with secure password handling
        newUser = await this.createUser({
          username: userData.username || invitation.email,
          password: userData.password,
          email: invitation.email,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          phone: invitation.phone,
          company: invitation.company,
          userCategory: invitation.userCategory as UserCategory,
          roleId: invitation.roleId,
          companyId: invitation.companyId,
          isActive: true,
          isInvitePending: false,
          invitedBy: invitation.invitedBy,
          invitedAt: invitation.createdAt,
        });
        console.log(`[DbStorage.acceptInvitation] Created new user: ${newUser.id}`);
      }

      // SECURITY: Mark invitation as used (single-use tokens)
      const updatedInvitation = await this.updateUserInvitation(invitation.id, {
        status: "accepted",
        acceptedAt: new Date(),
        createdUserId: newUser.id,
      });

      console.log(`[DbStorage.acceptInvitation] Success! User ${newUser.id} joined company ${newUser.companyId}`);
      return { user: newUser, invitation: updatedInvitation! };
    } catch (error: any) {
      console.error("[DbStorage.acceptInvitation] Error:", error.message || error);
      throw error;
    }
  }
  
  async createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date; requestedBy?: string }): Promise<void> {
    try {
      await db.insert(schema.passwordResetTokens).values({
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
        requestedBy: data.requestedBy || null,
      });
    } catch (error) {
      console.error("Database error in createPasswordResetToken:", error);
      throw error;
    }
  }
  
  async getNotes(projectId?: string | null, companyId?: string, userId?: string): Promise<Note[]> {
    try {
      // Simple query without join - filter by companyId on notes table
      const baseConditions: any[] = [eq(schema.notes.type, "note")];
      
      // Always filter by company if provided
      if (companyId) {
        baseConditions.push(eq(schema.notes.companyId, companyId));
      }
      
      // Build project filter condition
      // When a specific projectId is provided, ONLY show notes from that project
      // This prevents cross-project note leakage
      if (projectId === null) {
        // null means business/company-wide notes (projectId IS NULL)
        baseConditions.push(isNull(schema.notes.projectId));
      } else if (projectId !== undefined) {
        // specific project - strictly filter to this project only
        // Do NOT apply assignee filter here to prevent cross-project leakage
        baseConditions.push(eq(schema.notes.projectId, projectId));
      } else if (userId) {
        // No project filter specified, but userId is provided
        // Filter by assignee for user-specific views (dashboard widgets, personal notes)
        baseConditions.push(eq(schema.notes.assigneeId, userId));
      }
      // If projectId is undefined and no userId, return all notes for company
      
      const notes = await db
        .select()
        .from(schema.notes)
        .where(and(...baseConditions))
        .orderBy(desc(schema.notes.createdAt));
      
      return notes as Note[];
    } catch (error) {
      console.error("Database error in getNotes:", error);
      return [];
    }
  }
  async getNote(id: string, companyId?: string): Promise<Note | undefined> {
    if (!companyId) {
      // If no companyId provided, just return the note (backwards compatibility)
      const result = await db.select().from(schema.notes).where(eq(schema.notes.id, id));
      return result[0] as Note | undefined;
    }
    
    // First, try to get the note directly by id
    const noteResult = await db.select().from(schema.notes).where(eq(schema.notes.id, id));
    const note = noteResult[0];
    
    if (!note) return undefined;
    
    // Security check: If note has a companyId set, it MUST match the requested company
    // This prevents cross-tenant access for notes with explicit company assignment
    if (note.companyId) {
      if (note.companyId === companyId) {
        return note as Note;
      }
      // companyId is set but doesn't match - reject access
      return undefined;
    }
    
    // For legacy notes without companyId, verify through fallback paths:
    // 1. Via projectId → project.companyId
    // 2. Via ownerId → user.companyId (for personal notes without projects)
    
    if (note.projectId) {
      // Check via project
      const projectResult = await db.select()
        .from(schema.projects)
        .where(and(
          eq(schema.projects.id, note.projectId),
          eq(schema.projects.companyId, companyId)
        ));
      if (projectResult.length > 0) {
        return note as Note;
      }
    }
    
    if (note.ownerId && !note.projectId) {
      // Only check via owner for notes without projects (personal notes)
      const ownerResult = await db.select()
        .from(schema.users)
        .where(and(
          eq(schema.users.id, note.ownerId),
          eq(schema.users.companyId, companyId)
        ));
      if (ownerResult.length > 0) {
        return note as Note;
      }
    }
    
    // No valid company association found
    return undefined;
  }

  async getPersonalNotesByUser(userId: string, companyId: string): Promise<Note[]> {
    try {
      // Get personal notes for this user with proper security filtering
      // Join with users table to verify the user belongs to the specified company
      const result = await db
        .select({
          id: schema.notes.id,
          companyId: schema.notes.companyId,
          title: schema.notes.title,
          content: schema.notes.content,
          contentHtml: schema.notes.contentHtml,
          contentText: schema.notes.contentText,
          category: schema.notes.category,
          priority: schema.notes.priority,
          author: schema.notes.author,
          ownerId: schema.notes.ownerId,
          ownerName: schema.notes.ownerName,
          visibility: schema.notes.visibility,
          pinned: schema.notes.pinned,
          customFields: schema.notes.customFields,
          projectId: schema.notes.projectId,
          scope: schema.notes.scope,
          type: schema.notes.type,
          status: schema.notes.status,
          assigneeId: schema.notes.assigneeId,
          assigneeName: schema.notes.assigneeName,
          dueDate: schema.notes.dueDate,
          startTime: schema.notes.startTime,
          endTime: schema.notes.endTime,
          completedAt: schema.notes.completedAt,
          tags: schema.notes.tags,
          labels: schema.notes.labels,
          parentTaskId: schema.notes.parentTaskId,
          subtaskOrder: schema.notes.subtaskOrder,
          isRecurring: schema.notes.isRecurring,
          recurringType: schema.notes.recurringType,
          recurringInterval: schema.notes.recurringInterval,
          recurringDays: schema.notes.recurringDays,
          recurringStartDate: schema.notes.recurringStartDate,
          recurringEndDate: schema.notes.recurringEndDate,
          lastRecurringDate: schema.notes.lastRecurringDate,
          templateId: schema.notes.templateId,
          createdAt: schema.notes.createdAt,
          updatedAt: schema.notes.updatedAt,
        })
        .from(schema.notes)
        .innerJoin(schema.users, eq(schema.notes.ownerId, schema.users.id))
        .where(and(
          eq(schema.notes.ownerId, userId),
          eq(schema.notes.scope, 'personal'),
          eq(schema.users.companyId, companyId), // Security: verify user belongs to company
          eq(schema.notes.type, 'note') // Only notes, not tasks
        ))
        .orderBy(desc(schema.notes.createdAt));
      
      return result as Note[];
    } catch (error) {
      console.error("Database error in getPersonalNotesByUser:", error);
      return [];
    }
  }

  async createNote(insertNote: InsertNote): Promise<Note> {
    const now = new Date();
    const noteData = {
      ...insertNote,
      category: insertNote.category || "General",
      priority: insertNote.priority || "low",
      type: insertNote.type || "note",
      customFields: insertNote.customFields || {},
      tags: insertNote.tags || [],
      createdAt: now,
      updatedAt: now
    };
    
    const result = await db.insert(schema.notes).values(noteData).returning();
    return result[0];
  }
  async updateNote(id: string, note: Partial<InsertNote>): Promise<Note | undefined> {
    const now = new Date();
    const updateData = {
      ...note,
      updatedAt: now
    };
    
    const result = await db.update(schema.notes)
      .set(updateData)
      .where(eq(schema.notes.id, id))
      .returning();
    
    return result[0];
  }
  async deleteNote(id: string): Promise<boolean> {
    const result = await db.delete(schema.notes).where(eq(schema.notes.id, id)).returning({ id: schema.notes.id });
    return result.length > 0;
  }

  async archiveNote(id: string, userId: string): Promise<Note | undefined> {
    try {
      const now = new Date();
      const result = await db.update(schema.notes)
        .set({
          archivedAt: now,
          archivedById: userId,
          updatedAt: now,
        })
        .where(eq(schema.notes.id, id))
        .returning();
      return result[0] as Note | undefined;
    } catch (error) {
      console.error("Database error in archiveNote:", error);
      return undefined;
    }
  }

  async unarchiveNote(id: string): Promise<Note | undefined> {
    try {
      const now = new Date();
      const result = await db.update(schema.notes)
        .set({
          archivedAt: null,
          archivedById: null,
          updatedAt: now,
        })
        .where(eq(schema.notes.id, id))
        .returning();
      return result[0] as Note | undefined;
    } catch (error) {
      console.error("Database error in unarchiveNote:", error);
      return undefined;
    }
  }

  // Note Groups CRUD operations
  async getNoteGroups(companyId: string, projectId?: string | null): Promise<NoteGroup[]> {
    try {
      let conditions: any[] = [eq(schema.noteGroups.companyId, companyId)];
      
      if (projectId === null) {
        conditions.push(isNull(schema.noteGroups.projectId));
      } else if (projectId !== undefined) {
        conditions.push(eq(schema.noteGroups.projectId, projectId));
      }
      
      const result = await db.select()
        .from(schema.noteGroups)
        .where(and(...conditions))
        .orderBy(asc(schema.noteGroups.sortOrder));
      
      return result as NoteGroup[];
    } catch (error) {
      console.error("Database error in getNoteGroups:", error);
      return [];
    }
  }

  async getNoteGroup(id: string, companyId: string): Promise<NoteGroup | undefined> {
    try {
      const result = await db.select()
        .from(schema.noteGroups)
        .where(and(
          eq(schema.noteGroups.id, id),
          eq(schema.noteGroups.companyId, companyId)
        ));
      return result[0] as NoteGroup | undefined;
    } catch (error) {
      console.error("Database error in getNoteGroup:", error);
      return undefined;
    }
  }

  async createNoteGroup(insertGroup: InsertNoteGroup): Promise<NoteGroup> {
    const now = new Date();
    const groupData = {
      ...insertGroup,
      createdAt: now,
      updatedAt: now,
    };
    
    const result = await db.insert(schema.noteGroups).values(groupData).returning();
    return result[0];
  }

  async updateNoteGroup(id: string, updateData: Partial<InsertNoteGroup>, companyId: string): Promise<NoteGroup | undefined> {
    try {
      const now = new Date();
      const result = await db.update(schema.noteGroups)
        .set({ ...updateData, updatedAt: now })
        .where(and(
          eq(schema.noteGroups.id, id),
          eq(schema.noteGroups.companyId, companyId)
        ))
        .returning();
      return result[0] as NoteGroup | undefined;
    } catch (error) {
      console.error("Database error in updateNoteGroup:", error);
      return undefined;
    }
  }

  async deleteNoteGroup(id: string, companyId: string): Promise<boolean> {
    try {
      // First, remove group reference from all notes in this group
      await db.update(schema.notes)
        .set({ groupId: null })
        .where(eq(schema.notes.groupId, id));
      
      // Then delete the group
      const result = await db.delete(schema.noteGroups)
        .where(and(
          eq(schema.noteGroups.id, id),
          eq(schema.noteGroups.companyId, companyId)
        ))
        .returning({ id: schema.noteGroups.id });
      
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteNoteGroup:", error);
      return false;
    }
  }

  async reorderNoteGroups(companyId: string, projectId: string | null, groupIds: string[]): Promise<NoteGroup[]> {
    try {
      const updatedGroups: NoteGroup[] = [];
      const now = new Date();
      
      for (let i = 0; i < groupIds.length; i++) {
        const result = await db.update(schema.noteGroups)
          .set({ sortOrder: i, updatedAt: now })
          .where(and(
            eq(schema.noteGroups.id, groupIds[i]),
            eq(schema.noteGroups.companyId, companyId),
            projectId === null
              ? isNull(schema.noteGroups.projectId)
              : eq(schema.noteGroups.projectId, projectId)
          ))
          .returning();
        
        if (result[0]) {
          updatedGroups.push(result[0] as NoteGroup);
        }
      }
      
      return updatedGroups.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    } catch (error) {
      console.error("Database error in reorderNoteGroups:", error);
      return [];
    }
  }

  async getCustomFieldDefs(): Promise<CustomFieldDef[]> { return []; }
  async getCustomFieldDef(id: string): Promise<CustomFieldDef | undefined> { return undefined; }
  async createCustomFieldDef(fieldDef: InsertCustomFieldDef): Promise<CustomFieldDef> { throw new Error("Not implemented"); }
  async updateCustomFieldDef(id: string, fieldDef: Partial<InsertCustomFieldDef>): Promise<CustomFieldDef | undefined> { return undefined; }
  async deleteCustomFieldDef(id: string): Promise<boolean> { return false; }
  async getCustomFieldOptions(fieldDefId: string): Promise<CustomFieldOption[]> { return []; }
  async getCustomFieldOption(id: string): Promise<CustomFieldOption | undefined> { return undefined; }
  async createCustomFieldOption(option: InsertCustomFieldOption): Promise<CustomFieldOption> { throw new Error("Not implemented"); }
  async updateCustomFieldOption(id: string, option: Partial<InsertCustomFieldOption>): Promise<CustomFieldOption | undefined> { return undefined; }
  async deleteCustomFieldOption(id: string): Promise<boolean> { return false; }
  async getNoteTemplates(companyId: string): Promise<NoteTemplate[]> {
    try {
      const result = await db.select().from(schema.noteTemplates)
        .where(and(
          eq(schema.noteTemplates.companyId, companyId),
          eq(schema.noteTemplates.isActive, true)
        ))
        .orderBy(desc(schema.noteTemplates.createdAt));
      return result;
    } catch (error) {
      console.error("Database error in getNoteTemplates:", error);
      return [];
    }
  }

  async getNoteTemplate(id: string, companyId: string): Promise<NoteTemplate | undefined> {
    try {
      const result = await db.select().from(schema.noteTemplates)
        .where(and(
          eq(schema.noteTemplates.id, id),
          eq(schema.noteTemplates.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getNoteTemplate:", error);
      return undefined;
    }
  }

  async getNoteTemplateWithFields(id: string, companyId: string): Promise<{ template: NoteTemplate; fields: NoteTemplateField[] } | undefined> {
    try {
      const template = await this.getNoteTemplate(id, companyId);
      if (!template) return undefined;
      const fields = await this.getNoteTemplateFields(id);
      return { template, fields };
    } catch (error) {
      console.error("Database error in getNoteTemplateWithFields:", error);
      return undefined;
    }
  }

  async createNoteTemplate(insertTemplate: InsertNoteTemplate): Promise<NoteTemplate> {
    const now = new Date();
    const templateData = {
      ...insertTemplate,
      createdAt: now,
      updatedAt: now
    };
    const result = await db.insert(schema.noteTemplates).values(templateData).returning();
    return result[0];
  }

  async updateNoteTemplate(id: string, updateData: Partial<InsertNoteTemplate>, companyId: string): Promise<NoteTemplate | undefined> {
    try {
      const now = new Date();
      const result = await db.update(schema.noteTemplates)
        .set({ ...updateData, updatedAt: now })
        .where(and(
          eq(schema.noteTemplates.id, id),
          eq(schema.noteTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateNoteTemplate:", error);
      return undefined;
    }
  }

  async deleteNoteTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.update(schema.noteTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(schema.noteTemplates.id, id),
          eq(schema.noteTemplates.companyId, companyId)
        ))
        .returning({ id: schema.noteTemplates.id });
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteNoteTemplate:", error);
      return false;
    }
  }

  // Note Template Fields CRUD
  async getNoteTemplateFields(templateId: string): Promise<NoteTemplateField[]> {
    try {
      const result = await db.select().from(schema.noteTemplateFields)
        .where(eq(schema.noteTemplateFields.templateId, templateId))
        .orderBy(asc(schema.noteTemplateFields.order));
      return result;
    } catch (error) {
      console.error("Database error in getNoteTemplateFields:", error);
      return [];
    }
  }

  async createNoteTemplateField(insertField: InsertNoteTemplateField): Promise<NoteTemplateField> {
    const now = new Date();
    const fieldData = {
      ...insertField,
      createdAt: now,
      updatedAt: now
    };
    const result = await db.insert(schema.noteTemplateFields).values(fieldData).returning();
    return result[0];
  }

  async updateNoteTemplateField(id: string, updateData: Partial<InsertNoteTemplateField>): Promise<NoteTemplateField | undefined> {
    try {
      const now = new Date();
      const result = await db.update(schema.noteTemplateFields)
        .set({ ...updateData, updatedAt: now })
        .where(eq(schema.noteTemplateFields.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateNoteTemplateField:", error);
      return undefined;
    }
  }

  async deleteNoteTemplateField(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.noteTemplateFields)
        .where(eq(schema.noteTemplateFields.id, id))
        .returning({ id: schema.noteTemplateFields.id });
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteNoteTemplateField:", error);
      return false;
    }
  }

  async reorderNoteTemplateFields(templateId: string, fieldIds: string[]): Promise<NoteTemplateField[]> {
    try {
      const reorderedFields: NoteTemplateField[] = [];
      for (let i = 0; i < fieldIds.length; i++) {
        const result = await db.update(schema.noteTemplateFields)
          .set({ order: i, updatedAt: new Date() })
          .where(and(
            eq(schema.noteTemplateFields.id, fieldIds[i]),
            eq(schema.noteTemplateFields.templateId, templateId)
          ))
          .returning();
        if (result[0]) {
          reorderedFields.push(result[0]);
        }
      }
      return reorderedFields.sort((a, b) => a.order - b.order);
    } catch (error) {
      console.error("Database error in reorderNoteTemplateFields:", error);
      return [];
    }
  }
  
  async getProjects(ownerId?: string): Promise<Project[]> {
    if (ownerId) {
      // Filter by owner
      return await db.select().from(schema.projects)
        .where(
          and(
            eq(schema.projects.isActive, true),
            eq(schema.projects.ownerId, ownerId)
          )
        )
        .orderBy(schema.projects.createdAt);
    } else {
      // Return all active projects
      return await db.select().from(schema.projects)
        .where(eq(schema.projects.isActive, true))
        .orderBy(schema.projects.createdAt);
    }
  }
  async getProject(id: string): Promise<Project | undefined> {
    try {
      const result = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getProject:", error);
      return undefined;
    }
  }
  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
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
      updatedAt: now,
    };

    await db.insert(schema.projects).values(project);
    console.log(`createProject: Successfully saved project ${project.name} to database`);
    return project;
  }
  async updateProject(id: string, updates: Partial<InsertProject>): Promise<Project | undefined> {
    try {
      const result = await db
        .update(schema.projects)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.projects.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateProject:", error);
      return undefined;
    }
  }
  
  async deleteProject(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(schema.projects)
        .where(eq(schema.projects.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteProject:", error);
      return false;
    }
  }
  async getTaskViews(companyId: string, userId?: string): Promise<TaskView[]> {
    try {
      let query = db.select().from(schema.taskViews)
        .where(eq(schema.taskViews.companyId, companyId));
      
      if (userId) {
        query = query.where(eq(schema.taskViews.userId, userId)) as any;
      }
      
      const views = await query.orderBy(schema.taskViews.sortOrder, desc(schema.taskViews.createdAt));
      return views;
    } catch (error) {
      console.error("Database error in getTaskViews:", error);
      return [];
    }
  }

  async getTaskView(id: string, companyId: string): Promise<TaskView | undefined> {
    try {
      const result = await db.select().from(schema.taskViews)
        .where(and(
          eq(schema.taskViews.id, id),
          eq(schema.taskViews.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getTaskView:", error);
      return undefined;
    }
  }

  async createTaskView(insertTaskView: InsertTaskView, userId: string, companyId: string): Promise<TaskView> {
    try {
      const result = await db.insert(schema.taskViews)
        .values({
          ...insertTaskView,
          userId,
          companyId,
          viewType: insertTaskView.viewType || "board",
          filters: insertTaskView.filters || {},
          groupBy: insertTaskView.groupBy || "none",
          columnConfig: insertTaskView.columnConfig || {},
          isDefault: insertTaskView.isDefault ?? false,
        })
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTaskView:", error);
      throw error;
    }
  }

  async updateTaskView(id: string, updateData: Partial<InsertTaskView>, companyId: string): Promise<TaskView | undefined> {
    try {
      const result = await db.update(schema.taskViews)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.taskViews.id, id),
          eq(schema.taskViews.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTaskView:", error);
      return undefined;
    }
  }

  async deleteTaskView(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.taskViews)
        .where(and(
          eq(schema.taskViews.id, id),
          eq(schema.taskViews.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteTaskView:", error);
      return false;
    }
  }

  async reorderTaskViews(viewIds: string[], companyId: string): Promise<void> {
    try {
      for (let i = 0; i < viewIds.length; i++) {
        await db.update(schema.taskViews)
          .set({ sortOrder: i })
          .where(and(
            eq(schema.taskViews.id, viewIds[i]),
            eq(schema.taskViews.companyId, companyId)
          ));
      }
    } catch (error) {
      console.error("Database error in reorderTaskViews:", error);
      throw error;
    }
  }

  async getSubtasks(parentTaskId: string): Promise<Task[]> { return []; }
  async createSubtask(parentTaskId: string, subtask: InsertTask): Promise<Task> { throw new Error("Not implemented"); }
  async getEstimates(projectId?: string): Promise<Estimate[]> {
    try {
      let query = db.select().from(schema.estimates);
      if (projectId) {
        query = query.where(eq(schema.estimates.projectId, projectId)) as any;
      }
      const estimates = await query.orderBy(schema.estimates.updatedAt);
      return estimates;
    } catch (error) {
      console.error("Database error in getEstimates:", error);
      return [];
    }
  }
  
  async getEstimate(id: string): Promise<Estimate | undefined> {
    try {
      const result = await db.select().from(schema.estimates).where(eq(schema.estimates.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getEstimate:", error);
      return undefined;
    }
  }
  async createEstimate(insertEstimate: InsertEstimate): Promise<Estimate> {
    try {
      const estimate = {
        ...insertEstimate,
        status: insertEstimate.status || "draft",
        version: 1,
        isLocked: false,
      };
      
      const result = await db.insert(schema.estimates).values(estimate).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimate:", error);
      throw error;
    }
  }
  async updateEstimate(id: string, updateEstimate: Partial<InsertEstimate>): Promise<Estimate | undefined> {
    try {
      const estimate = await this.getEstimate(id);
      if (!estimate) {
        return undefined;
      }
      
      if (estimate.isLocked) {
        throw new Error("Cannot update locked estimate. Unlock the estimate first.");
      }
      
      const sanitizedUpdate = { ...updateEstimate };
      delete sanitizedUpdate.version;
      delete sanitizedUpdate.isLocked;
      
      const result = await db.update(schema.estimates)
        .set({ ...sanitizedUpdate, updatedAt: new Date() })
        .where(eq(schema.estimates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimate:", error);
      throw error;
    }
  }
  
  async deleteEstimate(id: string): Promise<boolean> {
    try {
      const estimate = await this.getEstimate(id);
      if (!estimate) {
        return false;
      }

      if (estimate.isLocked) {
        throw new Error("Cannot delete locked estimate. Unlock the estimate first.");
      }

      await db.delete(schema.estimateItems).where(eq(schema.estimateItems.estimateId, id));
      await db.delete(schema.estimateGroups).where(eq(schema.estimateGroups.estimateId, id));
      await db.delete(schema.estimates).where(eq(schema.estimates.id, id));
      
      return true;
    } catch (error) {
      console.error("Database error in deleteEstimate:", error);
      return false;
    }
  }
  async getEstimateItems(estimateId: string): Promise<EstimateItem[]> {
    try {
      const items = await db.select().from(schema.estimateItems)
        .where(eq(schema.estimateItems.estimateId, estimateId))
        .orderBy(schema.estimateItems.order);
      return items;
    } catch (error) {
      console.error("Database error in getEstimateItems:", error);
      return [];
    }
  }
  
  async getEstimateItem(id: string): Promise<EstimateItem | undefined> {
    try {
      const result = await db.select().from(schema.estimateItems)
        .where(eq(schema.estimateItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getEstimateItem:", error);
      return undefined;
    }
  }
  
  async createEstimateItem(insertItem: InsertEstimateItem): Promise<EstimateItem> {
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
        order: insertItem.order || 0,
      };
      
      const result = await db.insert(schema.estimateItems).values(estimateItem).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimateItem:", error);
      throw error;
    }
  }

  async bulkCreateEstimateItems(insertItems: InsertEstimateItem[]): Promise<EstimateItem[]> {
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
      
      const preparedItems = insertItems.map(insertItem => {
        const unitCostExTax = insertItem.unitCostExTax || 0;
        const taxAmount = Math.round(unitCostExTax * taxRate / 100);
        const priceIncTax = unitCostExTax + taxAmount;
        
        return {
          ...insertItem,
          taxAmount,
          priceIncTax,
          type: insertItem.type || "Material",
          status: insertItem.status || "incomplete",
          order: insertItem.order || 0,
        };
      });

      const result = await db.insert(schema.estimateItems).values(preparedItems).returning();
      return result;
    } catch (error) {
      console.error("Database error in bulkCreateEstimateItems:", error);
      throw error;
    }
  }

  async updateEstimateItem(id: string, item: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined> {
    try {
      // Get the existing item to check if it exists and get the estimateId
      const existingItem = await db.query.estimateItems.findFirst({
        where: eq(schema.estimateItems.id, id),
      });

      if (!existingItem) {
        return undefined;
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(existingItem.estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot update item in locked estimate. Unlock the estimate first.");
      }

      // Prepare update data with tax recalculation if needed
      const updateData: any = { ...item };
      
      if (item.unitCostExTax !== undefined || item.quantity !== undefined) {
        const taxRate = estimate?.taxRate || 10;
        const unitCostExTax = item.unitCostExTax !== undefined ? item.unitCostExTax : existingItem.unitCostExTax;
        const quantity = item.quantity !== undefined ? item.quantity : existingItem.quantity;
        
        // Recalculate all amounts based on line total (all values in cents)
        const amountExTax = Math.round(unitCostExTax * quantity / 100); // Convert from quantity with 2 decimals
        const taxAmount = Math.round(amountExTax * taxRate / 100);
        const amountIncTax = amountExTax + taxAmount;
        const priceIncTax = unitCostExTax + Math.round(unitCostExTax * taxRate / 100);
        
        updateData.taxAmount = taxAmount;
        updateData.priceIncTax = priceIncTax;
        updateData.amountExTax = amountExTax;
        updateData.amountIncTax = amountIncTax;
      }

      updateData.updatedAt = new Date();

      const result = await db
        .update(schema.estimateItems)
        .set(updateData)
        .where(eq(schema.estimateItems.id, id))
        .returning();

      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimateItem:", error);
      throw error;
    }
  }
  async deleteEstimateItem(id: string): Promise<boolean> {
    try {
      // Get the item first to check if it exists and get estimateId
      const item = await db.query.estimateItems.findFirst({
        where: eq(schema.estimateItems.id, id),
      });

      if (!item) {
        return false;
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(item.estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot delete item in locked estimate. Unlock the estimate first.");
      }

      // Delete the item
      const result = await db
        .delete(schema.estimateItems)
        .where(eq(schema.estimateItems.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteEstimateItem:", error);
      throw error;
    }
  }
  
  async verifyEstimateItemsOwnership(itemIds: string[], companyId: string): Promise<{ authorized: boolean; invalidItemId?: string }> {
    try {
      // Batched query: join items -> estimates -> projects to verify company ownership in ONE query
      const itemsWithOwnership = await db
        .select({
          itemId: schema.estimateItems.id,
          projectCompanyId: schema.projects.companyId,
        })
        .from(schema.estimateItems)
        .innerJoin(schema.estimates, eq(schema.estimateItems.estimateId, schema.estimates.id))
        .innerJoin(schema.projects, eq(schema.estimates.projectId, schema.projects.id))
        .where(inArray(schema.estimateItems.id, itemIds));

      // Check if all requested items were found and belong to the company
      if (itemsWithOwnership.length !== itemIds.length) {
        // Find which item is missing
        const foundIds = new Set(itemsWithOwnership.map(i => i.itemId));
        const missingId = itemIds.find(id => !foundIds.has(id));
        return { authorized: false, invalidItemId: missingId };
      }

      // Verify all items belong to the user's company
      const unauthorizedItem = itemsWithOwnership.find(i => i.projectCompanyId !== companyId);
      if (unauthorizedItem) {
        return { authorized: false, invalidItemId: unauthorizedItem.itemId };
      }

      return { authorized: true };
    } catch (error) {
      console.error("Database error in verifyEstimateItemsOwnership:", error);
      throw error;
    }
  }
  
  async getProjectAllowances(projectId: string): Promise<any[]> {
    try {
      // Get all estimates for this project
      const estimates = await db.select().from(schema.estimates)
        .where(eq(schema.estimates.projectId, projectId));
      
      const estimateIds = estimates.map(e => e.id);
      if (estimateIds.length === 0) return [];
      
      // Get all PC/PS items from these estimates
      const allowanceItems = await db.select().from(schema.estimateItems)
        .where(
          and(
            inArray(schema.estimateItems.estimateId, estimateIds),
            or(
              eq(schema.estimateItems.allowance, "Prime Cost"),
              eq(schema.estimateItems.allowance, "Provisional Sum")
            )
          )
        );
      
      // For each item, calculate actual costs from bills and timesheets
      const allowancesWithCosts = await Promise.all(
        allowanceItems.map(async (item) => {
          const estimate = estimates.find(e => e.id === item.estimateId);
          
          // Get bill line item allocations
          const billAllocations = await db.select({
            amount: schema.billLineItemAllowances.amount,
          })
          .from(schema.billLineItemAllowances)
          .where(eq(schema.billLineItemAllowances.estimateItemId, item.id));
          
          const billCost = billAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
          
          // Get timesheet allocations
          const timesheetAllocations = await db.select({
            amount: schema.timesheetAllowances.amount,
          })
          .from(schema.timesheetAllowances)
          .where(eq(schema.timesheetAllowances.estimateItemId, item.id));
          
          const timesheetCost = timesheetAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
          
          const actualCost = billCost + timesheetCost;
          const variance = actualCost - (item.priceIncTax || 0);
          
          return {
            item: {
              ...item,
              estimateName: estimate?.name || "Unknown",
              estimateVersion: estimate?.version || 1,
            },
            actualCost,
            variance,
          };
        })
      );
      
      return allowancesWithCosts;
    } catch (error) {
      console.error("Database error in getProjectAllowances:", error);
      return [];
    }
  }
  
  async getEstimateGroups(estimateId: string): Promise<EstimateGroup[]> {
    try {
      const groups = await db.select().from(schema.estimateGroups)
        .where(eq(schema.estimateGroups.estimateId, estimateId))
        .orderBy(asc(schema.estimateGroups.order));
      return groups;
    } catch (error) {
      console.error("Database error in getEstimateGroups:", error);
      return [];
    }
  }
  
  async getEstimateGroup(id: string): Promise<EstimateGroup | undefined> {
    try {
      const result = await db.select().from(schema.estimateGroups)
        .where(eq(schema.estimateGroups.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getEstimateGroup:", error);
      return undefined;
    }
  }
  
  async createEstimateGroup(insertGroup: InsertEstimateGroup): Promise<EstimateGroup> {
    try {
      const estimate = await this.getEstimate(insertGroup.estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot create group in locked estimate. Unlock the estimate first.");
      }

      const result = await db.insert(schema.estimateGroups).values(insertGroup).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimateGroup:", error);
      throw error;
    }
  }
  async updateEstimateGroup(id: string, updateGroup: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined> {
    try {
      // Get the group to check if parent estimate is locked
      const existingGroup = await db.query.estimateGroups.findFirst({
        where: eq(schema.estimateGroups.id, id),
      });

      if (!existingGroup) {
        return undefined;
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(existingGroup.estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot update group in locked estimate. Unlock the estimate first.");
      }

      const result = await db
        .update(schema.estimateGroups)
        .set({
          ...updateGroup,
          updatedAt: new Date(),
        })
        .where(eq(schema.estimateGroups.id, id))
        .returning();

      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimateGroup:", error);
      throw error;
    }
  }
  async deleteEstimateGroup(id: string): Promise<boolean> {
    try {
      // First check if group exists
      const group = await db
        .select()
        .from(schema.estimateGroups)
        .where(eq(schema.estimateGroups.id, id))
        .limit(1);
      
      if (!group[0]) {
        return false;
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(group[0].estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot delete group in locked estimate. Unlock the estimate first.");
      }

      // Set groupId to null for all items in this group
      await db
        .update(schema.estimateItems)
        .set({ 
          groupId: null, 
          updatedAt: new Date() 
        })
        .where(eq(schema.estimateItems.groupId, id));

      // Delete the group
      await db
        .delete(schema.estimateGroups)
        .where(eq(schema.estimateGroups.id, id));

      return true;
    } catch (error) {
      console.error("Database error in deleteEstimateGroup:", error);
      throw error;
    }
  }

  async duplicateEstimateGroup(id: string): Promise<EstimateGroup> {
    try {
      const group = await db
        .select()
        .from(schema.estimateGroups)
        .where(eq(schema.estimateGroups.id, id))
        .limit(1);
      
      if (!group[0]) {
        throw new Error("Group not found");
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(group[0].estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot duplicate group in locked estimate. Unlock the estimate first.");
      }

      // Create duplicate with new ID
      const newGroupData = {
        ...group[0],
        id: undefined,
        name: `${group[0].name} (Copy)`,
        createdAt: undefined,
        updatedAt: undefined,
      };

      const [newGroup] = await db
        .insert(schema.estimateGroups)
        .values(newGroupData)
        .returning();

      // Duplicate all items in this group
      const items = await db
        .select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.groupId, id));
      
      for (const item of items) {
        const newItemData = {
          ...item,
          id: undefined,
          groupId: newGroup.id,
          createdAt: undefined,
          updatedAt: undefined,
        };
        
        await db
          .insert(schema.estimateItems)
          .values(newItemData);
      }

      return newGroup;
    } catch (error) {
      console.error("Database error in duplicateEstimateGroup:", error);
      throw error;
    }
  }

  async copyGroupToEstimate(groupId: string, targetEstimateId: string): Promise<EstimateGroup> {
    try {
      const group = await db
        .select()
        .from(schema.estimateGroups)
        .where(eq(schema.estimateGroups.id, groupId))
        .limit(1);
      
      if (!group[0]) {
        throw new Error("Group not found");
      }

      // Check if target estimate exists and is not locked
      const targetEstimate = await this.getEstimate(targetEstimateId);
      if (!targetEstimate) {
        throw new Error("Target estimate not found");
      }
      if (targetEstimate.isLocked) {
        throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
      }

      // Create copy in target estimate
      const newGroupData = {
        ...group[0],
        id: undefined,
        estimateId: targetEstimateId,
        createdAt: undefined,
        updatedAt: undefined,
      };

      const [newGroup] = await db
        .insert(schema.estimateGroups)
        .values(newGroupData)
        .returning();

      // Copy all items in this group to target estimate
      const items = await db
        .select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.groupId, groupId));
      
      for (const item of items) {
        const newItemData = {
          ...item,
          id: undefined,
          estimateId: targetEstimateId,
          groupId: newGroup.id,
          createdAt: undefined,
          updatedAt: undefined,
        };
        
        await db
          .insert(schema.estimateItems)
          .values(newItemData);
      }

      return newGroup;
    } catch (error) {
      console.error("Database error in copyGroupToEstimate:", error);
      throw error;
    }
  }

  // Estimate Notes CRUD
  async getEstimateNotes(estimateId: string): Promise<EstimateNote[]> {
    try {
      const notes = await db
        .select()
        .from(schema.estimateNotes)
        .where(eq(schema.estimateNotes.estimateId, estimateId))
        .orderBy(desc(schema.estimateNotes.createdAt));
      return notes;
    } catch (error) {
      console.error("Database error in getEstimateNotes:", error);
      return [];
    }
  }

  async createEstimateNote(note: InsertEstimateNote): Promise<EstimateNote> {
    try {
      const [created] = await db
        .insert(schema.estimateNotes)
        .values(note)
        .returning();
      return created;
    } catch (error) {
      console.error("Database error in createEstimateNote:", error);
      throw error;
    }
  }

  async deleteEstimateNote(id: string): Promise<boolean> {
    try {
      const result = await db
        .delete(schema.estimateNotes)
        .where(eq(schema.estimateNotes.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteEstimateNote:", error);
      return false;
    }
  }

  async duplicateEstimateItem(id: string): Promise<EstimateItem> {
    try {
      const item = await db
        .select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.id, id))
        .limit(1);
      
      if (!item[0]) {
        throw new Error("Item not found");
      }

      // Check if parent estimate is locked
      const estimate = await this.getEstimate(item[0].estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot duplicate item in locked estimate. Unlock the estimate first.");
      }

      // Create duplicate with new ID
      const newItemData = {
        ...item[0],
        id: undefined,
        name: `${item[0].name} (Copy)`,
        createdAt: undefined,
        updatedAt: undefined,
      };

      const [newItem] = await db
        .insert(schema.estimateItems)
        .values(newItemData)
        .returning();

      return newItem;
    } catch (error) {
      console.error("Database error in duplicateEstimateItem:", error);
      throw error;
    }
  }

  async copyItemToEstimate(itemId: string, targetEstimateId: string): Promise<EstimateItem> {
    try {
      const item = await db
        .select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.id, itemId))
        .limit(1);
      
      if (!item[0]) {
        throw new Error("Item not found");
      }

      // Check if target estimate exists and is not locked
      const targetEstimate = await this.getEstimate(targetEstimateId);
      if (!targetEstimate) {
        throw new Error("Target estimate not found");
      }
      if (targetEstimate.isLocked) {
        throw new Error("Cannot copy to locked estimate. Unlock the estimate first.");
      }

      // Create copy in target estimate (without group assignment)
      const newItemData = {
        ...item[0],
        id: undefined,
        estimateId: targetEstimateId,
        groupId: null, // Don't assign to a group in target estimate
        createdAt: undefined,
        updatedAt: undefined,
      };

      const [newItem] = await db
        .insert(schema.estimateItems)
        .values(newItemData)
        .returning();

      return newItem;
    } catch (error) {
      console.error("Database error in copyItemToEstimate:", error);
      throw error;
    }
  }

  // Cost Categories CRUD operations (company-specific)
  async getCostCategories(companyId: string): Promise<CostCategory[]> {
    try {
      return await db
        .select()
        .from(schema.costCategories)
        .where(and(
          eq(schema.costCategories.companyId, companyId),
          eq(schema.costCategories.isActive, true)
        ))
        .orderBy(schema.costCategories.sortOrder);
    } catch (error) {
      console.error("Database error in getCostCategories:", error);
      throw error;
    }
  }

  async getCostCategory(id: string, companyId: string): Promise<CostCategory | undefined> {
    try {
      const result = await db
        .select()
        .from(schema.costCategories)
        .where(and(
          eq(schema.costCategories.id, id),
          eq(schema.costCategories.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getCostCategory:", error);
      throw error;
    }
  }

  async createCostCategory(insertCategory: InsertCostCategory): Promise<CostCategory> {
    try {
      const result = await db
        .insert(schema.costCategories)
        .values(insertCategory)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createCostCategory:", error);
      throw error;
    }
  }

  async updateCostCategory(id: string, updateCategory: Partial<InsertCostCategory>, companyId: string): Promise<CostCategory | undefined> {
    try {
      const result = await db
        .update(schema.costCategories)
        .set({
          ...updateCategory,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.costCategories.id, id),
          eq(schema.costCategories.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateCostCategory:", error);
      throw error;
    }
  }

  async deleteCostCategory(id: string, companyId: string): Promise<boolean> {
    try {
      await db
        .delete(schema.costCategories)
        .where(and(
          eq(schema.costCategories.id, id),
          eq(schema.costCategories.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteCostCategory:", error);
      return false;
    }
  }

  async archiveCostCategory(id: string, companyId: string): Promise<CostCategory | undefined> {
    try {
      const result = await db
        .update(schema.costCategories)
        .set({ isActive: false })
        .where(and(
          eq(schema.costCategories.id, id),
          eq(schema.costCategories.companyId, companyId)
        ))
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Database error in archiveCostCategory:", error);
      throw error;
    }
  }

  async mergeCostCategories(sourceId: string, targetId: string, companyId: string): Promise<void> {
    try {
      // Update all cost codes from source category to target category (within same company)
      await db
        .update(schema.costCodes)
        .set({ categoryId: targetId })
        .where(and(
          eq(schema.costCodes.categoryId, sourceId),
          eq(schema.costCodes.companyId, companyId)
        ));

      // Archive the source category
      await db
        .update(schema.costCategories)
        .set({ isActive: false })
        .where(and(
          eq(schema.costCategories.id, sourceId),
          eq(schema.costCategories.companyId, companyId)
        ));
    } catch (error) {
      console.error("Database error in mergeCostCategories:", error);
      throw error;
    }
  }

  // Payment Terms Options CRUD operations (company-specific)
  async getPaymentTermsOptions(companyId: string): Promise<PaymentTermsOption[]> {
    try {
      return await db
        .select()
        .from(schema.paymentTermsOptions)
        .where(and(
          eq(schema.paymentTermsOptions.companyId, companyId),
          eq(schema.paymentTermsOptions.isActive, true)
        ))
        .orderBy(schema.paymentTermsOptions.sortOrder);
    } catch (error: any) {
      // If table doesn't exist in production (migration not yet applied), return empty array
      if (error?.code === '42P01') {
        console.warn("payment_terms_options table does not exist yet. Returning empty array.");
        return [];
      }
      console.error("Database error in getPaymentTermsOptions:", error);
      throw error;
    }
  }

  async getPaymentTermsOption(id: string, companyId: string): Promise<PaymentTermsOption | undefined> {
    try {
      const result = await db
        .select()
        .from(schema.paymentTermsOptions)
        .where(and(
          eq(schema.paymentTermsOptions.id, id),
          eq(schema.paymentTermsOptions.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getPaymentTermsOption:", error);
      throw error;
    }
  }

  async createPaymentTermsOption(option: InsertPaymentTermsOption): Promise<PaymentTermsOption> {
    try {
      const result = await db
        .insert(schema.paymentTermsOptions)
        .values(option)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createPaymentTermsOption:", error);
      throw error;
    }
  }

  async updatePaymentTermsOption(id: string, option: Partial<InsertPaymentTermsOption>, companyId: string): Promise<PaymentTermsOption | undefined> {
    try {
      const result = await db
        .update(schema.paymentTermsOptions)
        .set({ ...option, updatedAt: new Date() })
        .where(and(
          eq(schema.paymentTermsOptions.id, id),
          eq(schema.paymentTermsOptions.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updatePaymentTermsOption:", error);
      throw error;
    }
  }

  async deletePaymentTermsOption(id: string, companyId: string): Promise<boolean> {
    try {
      await db
        .update(schema.paymentTermsOptions)
        .set({ isActive: false })
        .where(and(
          eq(schema.paymentTermsOptions.id, id),
          eq(schema.paymentTermsOptions.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deletePaymentTermsOption:", error);
      return false;
    }
  }

  async setPaymentTermsDefault(id: string, type: 'bill' | 'invoice', companyId: string): Promise<void> {
    try {
      // First, unset all defaults for this type
      const field = type === 'bill' ? 'isBillDefault' : 'isInvoiceDefault';
      await db
        .update(schema.paymentTermsOptions)
        .set({ [field]: false })
        .where(eq(schema.paymentTermsOptions.companyId, companyId));

      // Then set the new default
      await db
        .update(schema.paymentTermsOptions)
        .set({ [field]: true })
        .where(and(
          eq(schema.paymentTermsOptions.id, id),
          eq(schema.paymentTermsOptions.companyId, companyId)
        ));
    } catch (error) {
      console.error("Database error in setPaymentTermsDefault:", error);
      throw error;
    }
  }

  // Cost Codes CRUD operations (company-specific)
  async getCostCodes(companyId: string): Promise<CostCode[]> {
    try {
      return await db
        .select()
        .from(schema.costCodes)
        .where(and(
          eq(schema.costCodes.companyId, companyId),
          eq(schema.costCodes.isActive, true)
        ))
        .orderBy(schema.costCodes.sortOrder);
    } catch (error) {
      console.error("Database error in getCostCodes:", error);
      throw error;
    }
  }

  async getCostCode(id: string, companyId: string): Promise<CostCode | undefined> {
    try {
      const result = await db
        .select()
        .from(schema.costCodes)
        .where(and(
          eq(schema.costCodes.id, id),
          eq(schema.costCodes.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getCostCode:", error);
      throw error;
    }
  }

  async createCostCode(insertCode: InsertCostCode): Promise<CostCode> {
    try {
      const result = await db
        .insert(schema.costCodes)
        .values(insertCode)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createCostCode:", error);
      throw error;
    }
  }

  async updateCostCode(id: string, updateCode: Partial<InsertCostCode>, companyId: string): Promise<CostCode | undefined> {
    try {
      const result = await db
        .update(schema.costCodes)
        .set({
          ...updateCode,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.costCodes.id, id),
          eq(schema.costCodes.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateCostCode:", error);
      throw error;
    }
  }

  async deleteCostCode(id: string, companyId: string): Promise<boolean> {
    try {
      await db
        .delete(schema.costCodes)
        .where(and(
          eq(schema.costCodes.id, id),
          eq(schema.costCodes.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteCostCode:", error);
      return false;
    }
  }

  async archiveCostCode(id: string, companyId: string): Promise<CostCode | undefined> {
    try {
      const result = await db
        .update(schema.costCodes)
        .set({
          isArchived: true,
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.costCodes.id, id),
          eq(schema.costCodes.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in archiveCostCode:", error);
      throw error;
    }
  }

  async mergeCostCodes(sourceId: string, targetId: string, companyId: string): Promise<boolean> {
    try {
      // Update all bill line items that reference the source cost code (within same company)
      // Note: This assumes billLineItems also filters by company through joins/foreign keys
      await db
        .update(schema.billLineItems)
        .set({ costCodeId: targetId })
        .where(eq(schema.billLineItems.costCodeId, sourceId));
      
      // Archive the source cost code
      await this.archiveCostCode(sourceId, companyId);
      
      return true;
    } catch (error) {
      console.error("Database error in mergeCostCodes:", error);
      return false;
    }
  }

  // Task Tags CRUD operations (company-specific)
  async getTaskTags(companyId: string): Promise<TaskTag[]> {
    try {
      return await db
        .select()
        .from(schema.taskTags)
        .where(and(
          eq(schema.taskTags.companyId, companyId),
          eq(schema.taskTags.isActive, true)
        ))
        .orderBy(schema.taskTags.displayOrder);
    } catch (error) {
      console.error("Database error in getTaskTags:", error);
      throw error;
    }
  }

  async getTaskTag(id: string, companyId: string): Promise<TaskTag | undefined> {
    try {
      const result = await db
        .select()
        .from(schema.taskTags)
        .where(and(
          eq(schema.taskTags.id, id),
          eq(schema.taskTags.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getTaskTag:", error);
      throw error;
    }
  }

  async createTaskTag(insertTag: InsertTaskTag): Promise<TaskTag> {
    try {
      const result = await db
        .insert(schema.taskTags)
        .values(insertTag)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTaskTag:", error);
      throw error;
    }
  }

  async updateTaskTag(id: string, updateTag: Partial<InsertTaskTag>, companyId: string): Promise<TaskTag | undefined> {
    try {
      const result = await db
        .update(schema.taskTags)
        .set({
          ...updateTag,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.taskTags.id, id),
          eq(schema.taskTags.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTaskTag:", error);
      throw error;
    }
  }

  async deleteTaskTag(id: string, companyId: string): Promise<boolean> {
    try {
      await db
        .delete(schema.taskTags)
        .where(and(
          eq(schema.taskTags.id, id),
          eq(schema.taskTags.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteTaskTag:", error);
      return false;
    }
  }

  async updateTaskTagsOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void> {
    try {
      for (const update of updates) {
        await db
          .update(schema.taskTags)
          .set({ displayOrder: update.displayOrder })
          .where(and(
            eq(schema.taskTags.id, update.id),
            eq(schema.taskTags.companyId, companyId)
          ));
      }
    } catch (error) {
      console.error("Database error in updateTaskTagsOrder:", error);
      throw error;
    }
  }

  // Task Template Statuses CRUD operations (company-specific)
  async getTaskTemplateStatuses(companyId: string): Promise<TaskTemplateStatus[]> {
    try {
      return await db
        .select()
        .from(schema.taskTemplateStatuses)
        .where(and(
          eq(schema.taskTemplateStatuses.companyId, companyId),
          eq(schema.taskTemplateStatuses.isActive, true)
        ))
        .orderBy(schema.taskTemplateStatuses.displayOrder);
    } catch (error) {
      console.error("Database error in getTaskTemplateStatuses:", error);
      throw error;
    }
  }

  async getTaskTemplateStatus(id: string, companyId: string): Promise<TaskTemplateStatus | undefined> {
    try {
      const result = await db
        .select()
        .from(schema.taskTemplateStatuses)
        .where(and(
          eq(schema.taskTemplateStatuses.id, id),
          eq(schema.taskTemplateStatuses.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getTaskTemplateStatus:", error);
      throw error;
    }
  }

  async createTaskTemplateStatus(insertStatus: InsertTaskTemplateStatus): Promise<TaskTemplateStatus> {
    try {
      const result = await db
        .insert(schema.taskTemplateStatuses)
        .values(insertStatus)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTaskTemplateStatus:", error);
      throw error;
    }
  }

  async updateTaskTemplateStatus(id: string, updateStatus: Partial<InsertTaskTemplateStatus>, companyId: string): Promise<TaskTemplateStatus | undefined> {
    try {
      const result = await db
        .update(schema.taskTemplateStatuses)
        .set({
          ...updateStatus,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.taskTemplateStatuses.id, id),
          eq(schema.taskTemplateStatuses.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTaskTemplateStatus:", error);
      throw error;
    }
  }

  async deleteTaskTemplateStatus(id: string, companyId: string): Promise<boolean> {
    try {
      await db
        .delete(schema.taskTemplateStatuses)
        .where(and(
          eq(schema.taskTemplateStatuses.id, id),
          eq(schema.taskTemplateStatuses.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteTaskTemplateStatus:", error);
      return false;
    }
  }

  async updateTaskTemplateStatusesOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void> {
    try {
      for (const update of updates) {
        await db
          .update(schema.taskTemplateStatuses)
          .set({ displayOrder: update.displayOrder })
          .where(and(
            eq(schema.taskTemplateStatuses.id, update.id),
            eq(schema.taskTemplateStatuses.companyId, companyId)
          ));
      }
    } catch (error) {
      console.error("Database error in updateTaskTemplateStatusesOrder:", error);
      throw error;
    }
  }

  async createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate> { throw new Error("Not implemented"); }
  
  async lockEstimate(estimateId: string): Promise<Estimate | undefined> {
    try {
      const result = await db.update(schema.estimates)
        .set({ 
          isLocked: true, 
          updatedAt: new Date() 
        })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Database error in lockEstimate:", error);
      throw error;
    }
  }
  
  async unlockEstimate(estimateId: string): Promise<Estimate | undefined> {
    try {
      const result = await db.update(schema.estimates)
        .set({ 
          isLocked: false, 
          updatedAt: new Date() 
        })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Database error in unlockEstimate:", error);
      throw error;
    }
  }
  async getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    builderCostTotal: number;
    markupAmount: number;
    subtotalWithMarkup: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }> {
    try {
      const items = await this.getEstimateItems(estimateId);

      let builderCostTotal = 0; // Sum of all builder costs (what builder pays)
      let clientTaxTotal = 0; // Sum of all stored taxes
      let clientAmountIncTaxTotal = 0; // Sum of all stored client amounts inc tax

      // Calculate totals using stored values (same as frontend)
      items.forEach(item => {
        // Builder cost = unitCostExTax * quantity / 100 (calculated, same as frontend)
        // unitCostExTax is in cents, quantity is fixed-point (100 = 1.00)
        const builderCost = Math.round((item.unitCostExTax * item.quantity) / 100);
        builderCostTotal += builderCost;
        
        // Use stored client values (taxAmount, priceIncTax) - these are pre-calculated on item save
        clientTaxTotal += item.taxAmount ?? 0;
        clientAmountIncTaxTotal += item.priceIncTax ?? 0;
      });
      
      // Derive client ex-tax amount from stored values
      const clientAmountExTaxTotal = clientAmountIncTaxTotal - clientTaxTotal;
      
      // Total markup is the difference between client amount ex tax and builder cost
      const totalMarkup = clientAmountExTaxTotal - builderCostTotal;

      return {
        subtotal: builderCostTotal, // Sum of builder costs (what builder pays, no markup)
        builderCostTotal: builderCostTotal, // Same as subtotal for clarity
        markupAmount: totalMarkup, // Total markup embedded in all items
        subtotalWithMarkup: clientAmountExTaxTotal, // Client amount ex tax (builder cost + markups)
        taxAmount: clientTaxTotal, // Total GST on all items
        total: clientAmountIncTaxTotal, // Client amount inc tax
        itemCount: items.length,
      };
    } catch (error) {
      console.error("Database error in getEstimateSummary:", error);
      return { subtotal: 0, builderCostTotal: 0, markupAmount: 0, subtotalWithMarkup: 0, taxAmount: 0, total: 0, itemCount: 0 };
    }
  }
  
  // Scope Items CRUD
  async getScopeItems(projectId: string): Promise<ScopeItem[]> {
    try {
      // Get project to verify company
      const [project] = await db.select().from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);
      
      if (!project) return [];
      
      const items = await db.select().from(schema.scopeItems)
        .where(and(
          eq(schema.scopeItems.projectId, projectId),
          eq(schema.scopeItems.companyId, project.companyId)
        ))
        .orderBy(asc(schema.scopeItems.displayOrder));
      return items;
    } catch (error) {
      console.error("Database error in getScopeItems:", error);
      return [];
    }
  }

  async getScopeItem(id: string): Promise<ScopeItem | undefined> {
    try {
      const [item] = await db.select().from(schema.scopeItems)
        .where(eq(schema.scopeItems.id, id))
        .limit(1);
      return item;
    } catch (error) {
      console.error("Database error in getScopeItem:", error);
      return undefined;
    }
  }

  async createScopeItem(item: InsertScopeItem): Promise<ScopeItem> {
    const [newItem] = await db.insert(schema.scopeItems)
      .values(item)
      .returning();
    return newItem;
  }

  async bulkCreateScopeItems(items: InsertScopeItem[]): Promise<ScopeItem[]> {
    if (items.length === 0) return [];
    const newItems = await db.insert(schema.scopeItems)
      .values(items)
      .returning();
    return newItems;
  }

  async updateScopeItem(id: string, item: Partial<InsertScopeItem>): Promise<ScopeItem | undefined> {
    try {
      const [updated] = await db.update(schema.scopeItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.scopeItems.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateScopeItem:", error);
      return undefined;
    }
  }

  async deleteScopeItem(id: string): Promise<boolean> {
    try {
      await db.delete(schema.scopeItems)
        .where(eq(schema.scopeItems.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteScopeItem:", error);
      return false;
    }
  }

  async reorderScopeItems(updates: Array<{id: string, displayOrder: number, parentId?: string | null}>): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.scopeItems)
          .set({ displayOrder: update.displayOrder, parentId: update.parentId })
          .where(eq(schema.scopeItems.id, update.id));
      }
    } catch (error) {
      console.error("Database error in reorderScopeItems:", error);
    }
  }

  // Scope Stages CRUD
  async getScopeStages(projectId: string): Promise<ScopeStage[]> {
    try {
      const [project] = await db.select().from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);
      
      if (!project) return [];
      
      const stages = await db.select().from(schema.scopeStages)
        .where(and(
          eq(schema.scopeStages.projectId, projectId),
          eq(schema.scopeStages.companyId, project.companyId)
        ))
        .orderBy(asc(schema.scopeStages.displayOrder));
      return stages;
    } catch (error) {
      console.error("Database error in getScopeStages:", error);
      return [];
    }
  }

  async getScopeStage(id: string): Promise<ScopeStage | undefined> {
    try {
      const [stage] = await db.select().from(schema.scopeStages)
        .where(eq(schema.scopeStages.id, id))
        .limit(1);
      return stage;
    } catch (error) {
      console.error("Database error in getScopeStage:", error);
      return undefined;
    }
  }

  async createScopeStage(stage: InsertScopeStage): Promise<ScopeStage> {
    const [newStage] = await db.insert(schema.scopeStages)
      .values(stage)
      .returning();
    return newStage;
  }

  async updateScopeStage(id: string, stage: Partial<InsertScopeStage>): Promise<ScopeStage | undefined> {
    try {
      const [updated] = await db.update(schema.scopeStages)
        .set({ ...stage, updatedAt: new Date() })
        .where(eq(schema.scopeStages.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateScopeStage:", error);
      return undefined;
    }
  }

  async deleteScopeStage(id: string): Promise<boolean> {
    try {
      await db.delete(schema.scopeStages)
        .where(eq(schema.scopeStages.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteScopeStage:", error);
      return false;
    }
  }

  async reorderScopeStages(updates: Array<{id: string, displayOrder: number, parentId?: string | null}>): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.scopeStages)
          .set({ displayOrder: update.displayOrder, parentId: update.parentId })
          .where(eq(schema.scopeStages.id, update.id));
      }
    } catch (error) {
      console.error("Database error in reorderScopeStages:", error);
    }
  }

  async initializeDefaultStages(projectId: string, companyId: string): Promise<ScopeStage[]> {
    try {
      const defaultStages = ['Prelim', 'Frame', 'Lockup', 'Fix', 'Handover'];
      const stages: ScopeStage[] = [];
      
      for (let i = 0; i < defaultStages.length; i++) {
        const [stage] = await db.insert(schema.scopeStages)
          .values({
            projectId,
            companyId,
            name: defaultStages[i],
            displayOrder: i,
          })
          .returning();
        stages.push(stage);
      }
      
      return stages;
    } catch (error) {
      console.error("Database error in initializeDefaultStages:", error);
      return [];
    }
  }

  // Scope Templates CRUD
  async getScopeTemplates(companyId: string): Promise<ScopeTemplate[]> {
    try {
      const templates = await db.select().from(schema.scopeTemplates)
        .where(eq(schema.scopeTemplates.companyId, companyId));
      return templates;
    } catch (error) {
      console.error("Database error in getScopeTemplates:", error);
      return [];
    }
  }

  async getScopeTemplate(id: string, companyId: string): Promise<ScopeTemplate | undefined> {
    try {
      const [template] = await db.select().from(schema.scopeTemplates)
        .where(and(
          eq(schema.scopeTemplates.id, id),
          eq(schema.scopeTemplates.companyId, companyId)
        ))
        .limit(1);
      return template;
    } catch (error) {
      console.error("Database error in getScopeTemplate:", error);
      return undefined;
    }
  }

  async createScopeTemplate(template: InsertScopeTemplate): Promise<ScopeTemplate> {
    const [newTemplate] = await db.insert(schema.scopeTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updateScopeTemplate(id: string, template: Partial<InsertScopeTemplate>, companyId: string): Promise<ScopeTemplate | undefined> {
    try {
      const [updated] = await db.update(schema.scopeTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.scopeTemplates.id, id),
          eq(schema.scopeTemplates.companyId, companyId)
        ))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateScopeTemplate:", error);
      return undefined;
    }
  }

  async deleteScopeTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.scopeTemplates)
        .where(and(
          eq(schema.scopeTemplates.id, id),
          eq(schema.scopeTemplates.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteScopeTemplate:", error);
      return false;
    }
  }

  async applyScopeTemplate(templateId: string, projectId: string): Promise<ScopeItem[]> {
    try {
      // Get the template
      const [template] = await db.select().from(schema.scopeTemplates)
        .where(eq(schema.scopeTemplates.id, templateId))
        .limit(1);
      
      if (!template) {
        throw new Error("Template not found");
      }

      // Get project to get companyId
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error("Project not found");
      }
      const companyId = project.companyId;

      // Get existing stages for this project
      const existingStages = await this.getScopeStages(projectId);
      const existingStageNames = new Set(existingStages.map(s => s.name.toLowerCase().trim()));

      // Determine template format and extract stages/items
      const rawData = template.templateData as any;
      let templateStages: Array<{ name: string; sortOrder: number }> = [];
      let templateItems: any[] = [];

      if (Array.isArray(rawData)) {
        // Legacy format: array of items - extract unique stages from items
        templateItems = rawData;
        const stageNames = new Set<string>();
        rawData.forEach((item: any) => {
          if (item.stage) stageNames.add(item.stage);
        });
        templateStages = Array.from(stageNames).map((name, index) => ({
          name,
          sortOrder: index,
        }));
      } else if (rawData && typeof rawData === 'object') {
        // New format: object with stages and items
        templateStages = rawData.stages || [];
        templateItems = rawData.items || [];
      }

      // Create stages that don't already exist
      const maxExistingOrder = existingStages.length > 0 
        ? Math.max(...existingStages.map(s => s.displayOrder)) + 1 
        : 0;

      const createdStageMap: Record<string, string> = {}; // templateStageName -> actualStageName
      
      for (let i = 0; i < templateStages.length; i++) {
        const stageData = templateStages[i];
        const normalizedName = stageData.name.toLowerCase().trim();
        
        if (!existingStageNames.has(normalizedName)) {
          // Create new stage
          const newStage = await this.createScopeStage({
            projectId,
            companyId,
            name: stageData.name,
            displayOrder: maxExistingOrder + i,
          });
          createdStageMap[stageData.name] = newStage.name;
          existingStageNames.add(normalizedName);
        } else {
          // Stage already exists - map to existing name
          const existing = existingStages.find(s => s.name.toLowerCase().trim() === normalizedName);
          if (existing) {
            createdStageMap[stageData.name] = existing.name;
          }
        }
      }

      // Create scope items
      const itemsToCreate = templateItems.map((data: any, index: number) => {
        // Map stage name to actual stage (use original if mapping doesn't exist)
        const stageName = createdStageMap[data.stage] || data.stage;
        
        return {
          companyId,
          projectId,
          title: data.title || 'Untitled',
          description: data.description || null,
          stage: stageName,
          itemType: data.itemType || 'scope',
          contentType: data.contentType || 'text',
          quantity: data.quantity || null,
          rate: data.rate || null,
          gearList: data.gearList || data.gearChecklist || [],
          checklistItems: data.checklistItems || [],
          displayOrder: index,
        };
      });

      if (itemsToCreate.length === 0) {
        return [];
      }

      return await this.bulkCreateScopeItems(itemsToCreate);
    } catch (error) {
      console.error("Database error in applyScopeTemplate:", error);
      return [];
    }
  }

  async addItemToScopeTemplate(templateId: string, scopeItem: any, companyId: string): Promise<ScopeTemplate | undefined> {
    try {
      // Get the template
      const [template] = await db.select().from(schema.scopeTemplates)
        .where(and(
          eq(schema.scopeTemplates.id, templateId),
          eq(schema.scopeTemplates.companyId, companyId)
        ))
        .limit(1);
      
      if (!template) {
        throw new Error("Template not found");
      }

      // Parse existing template data
      const existingData = (template.templateData as any[]) || [];
      
      // Smart stage matching logic:
      // Check if a stage with the same name already exists in the template
      const itemStage = scopeItem.stage;
      const stageExists = existingData.some((item: any) => item.stage === itemStage);
      
      // Create the new item to add (clean data, remove IDs and project references)
      const newItem = {
        title: scopeItem.title,
        description: scopeItem.description,
        itemType: scopeItem.itemType,
        quantity: scopeItem.quantity,
        rate: scopeItem.rate,
        gearChecklist: scopeItem.gearChecklist,
        stage: scopeItem.stage, // Keep the stage name for matching later
      };
      
      // Add the new item to the template data
      const updatedData = [...existingData, newItem];
      
      // Update the template
      const [updatedTemplate] = await db.update(schema.scopeTemplates)
        .set({ 
          templateData: updatedData,
          updatedAt: new Date() 
        })
        .where(and(
          eq(schema.scopeTemplates.id, templateId),
          eq(schema.scopeTemplates.companyId, companyId)
        ))
        .returning();
      
      return updatedTemplate;
    } catch (error) {
      console.error("Database error in addItemToScopeTemplate:", error);
      return undefined;
    }
  }

  // Scope Gear Photos CRUD
  async getScopeGearPhotos(scopeItemId: string): Promise<ScopeGearPhoto[]> {
    try {
      const photos = await db.select().from(schema.scopeGearPhotos)
        .where(eq(schema.scopeGearPhotos.scopeItemId, scopeItemId));
      return photos;
    } catch (error) {
      console.error("Database error in getScopeGearPhotos:", error);
      return [];
    }
  }

  async createScopeGearPhoto(photo: InsertScopeGearPhoto): Promise<ScopeGearPhoto> {
    const [newPhoto] = await db.insert(schema.scopeGearPhotos)
      .values(photo)
      .returning();
    return newPhoto;
  }

  async deleteScopeGearPhoto(id: string): Promise<boolean> {
    try {
      await db.delete(schema.scopeGearPhotos)
        .where(eq(schema.scopeGearPhotos.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteScopeGearPhoto:", error);
      return false;
    }
  }

  // Scope Integration Helpers
  async pushScopeToEstimate(scopeItemIds: string[], estimateId: string): Promise<EstimateItem[]> {
    try {
      // Get the scope items
      const scopeItems = await db.select().from(schema.scopeItems)
        .where(inArray(schema.scopeItems.id, scopeItemIds));

      // Get the estimate to check if it exists
      const [estimate] = await db.select().from(schema.estimates)
        .where(eq(schema.estimates.id, estimateId))
        .limit(1);
      
      if (!estimate) {
        throw new Error("Estimate not found");
      }

      // Create estimate items from scope items
      const estimateItems: InsertEstimateItem[] = scopeItems.map((scopeItem, index) => ({
        estimateId,
        groupId: null,
        description: scopeItem.description || scopeItem.title,
        costCodeId: scopeItem.costCodeId,
        costCodeTitle: scopeItem.costCodeTitle,
        quantity: 1,
        unit: 'item',
        unitCost: 0,
        builderCost: 0,
        markup: estimate.markupPercentage || 0,
        clientPrice: 0,
        taxAmount: 0,
        displayOrder: index,
      }));

      const newItems = await this.bulkCreateEstimateItems(estimateItems);

      // Update scope items to link to estimate items
      for (let i = 0; i < scopeItems.length; i++) {
        await db.update(schema.scopeItems)
          .set({ estimateItemId: newItems[i].id })
          .where(eq(schema.scopeItems.id, scopeItems[i].id));
      }

      return newItems;
    } catch (error) {
      console.error("Database error in pushScopeToEstimate:", error);
      return [];
    }
  }

  async createRfqFromScope(scopeItemIds: string[], projectId: string): Promise<import("@shared/schema").Rfq> {
    try {
      // Get project to verify company ownership
      const [project] = await db.select().from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error('Project not found');
      }

      // Get scope items and validate they all belong to this project/company
      const scopeItems = await db.select().from(schema.scopeItems)
        .where(inArray(schema.scopeItems.id, scopeItemIds));

      // Security: Verify ALL scope items belong to the target project and company
      for (const item of scopeItems) {
        if (item.projectId !== projectId || item.companyId !== project.companyId) {
          throw new Error('Unauthorized: Scope item does not belong to this project/company');
        }
      }

      if (scopeItems.length !== scopeItemIds.length) {
        throw new Error('Some scope items not found');
      }

      // Create a combined description from scope items
      const description = scopeItems.map(item => item.title).join('\n');
      const scope = scopeItems.map(item => `${item.title}\n${item.description || ''}`).join('\n\n');

      // Create RFQ
      const [rfq] = await db.insert(schema.rfqs)
        .values({
          projectId,
          title: 'RFQ from Scope',
          description,
          scope,
          status: 'draft',
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 2 weeks from now
        })
        .returning();

      // Link scope items to RFQ
      for (const scopeItem of scopeItems) {
        await db.update(schema.scopeItems)
          .set({ rfqId: rfq.id })
          .where(eq(schema.scopeItems.id, scopeItem.id));
      }

      return rfq;
    } catch (error) {
      console.error("Database error in createRfqFromScope:", error);
      throw error;
    }
  }

  async createPoFromScope(scopeItemIds: string[], projectId: string): Promise<import("@shared/schema").PurchaseOrder> {
    try {
      // Get project to verify company ownership
      const [project] = await db.select().from(schema.projects)
        .where(eq(schema.projects.id, projectId))
        .limit(1);

      if (!project) {
        throw new Error('Project not found');
      }

      // Get scope items and validate they all belong to this project/company
      const scopeItems = await db.select().from(schema.scopeItems)
        .where(inArray(schema.scopeItems.id, scopeItemIds));

      // Security: Verify ALL scope items belong to the target project and company
      for (const item of scopeItems) {
        if (item.projectId !== projectId || item.companyId !== project.companyId) {
          throw new Error('Unauthorized: Scope item does not belong to this project/company');
        }
      }

      if (scopeItems.length !== scopeItemIds.length) {
        throw new Error('Some scope items not found');
      }

      // Generate PO number atomically using advisory lock
      const result = await db.transaction(async (tx) => {
        // Use PostgreSQL advisory lock to prevent concurrent PO creation for same company
        // Use hashtext to convert UUID to deterministic bigint for advisory lock
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${project.companyId}))`);

        // Now safely get the highest PO number for this company
        const existingPos = await tx.select({ poNumber: schema.purchaseOrders.poNumber })
          .from(schema.purchaseOrders)
          .where(eq(schema.purchaseOrders.companyId, project.companyId))
          .orderBy(sql`${schema.purchaseOrders.poNumber} DESC`)
          .limit(1);

        // Extract number from PO-XXXX format and increment
        let nextNumber = 1;
        if (existingPos.length > 0 && existingPos[0].poNumber) {
          const match = existingPos[0].poNumber.match(/PO-(\d+)/);
          if (match) {
            nextNumber = parseInt(match[1], 10) + 1;
          }
        }
        const poNumber = `PO-${String(nextNumber).padStart(4, '0')}`;

        // Create a combined description from scope items
        const description = scopeItems.map(item => `${item.title}\n${item.description || ''}`).join('\n\n');

        // Create Purchase Order within transaction
        const [po] = await tx.insert(schema.purchaseOrders)
          .values({
            projectId,
            companyId: project.companyId,
            poNumber,
            title: 'PO from Scope',
            description,
            status: 'draft',
            total: 0,
          })
          .returning();

        // Link scope items to PO
        for (const scopeItem of scopeItems) {
          await tx.update(schema.scopeItems)
            .set({ poId: po.id })
            .where(eq(schema.scopeItems.id, scopeItem.id));
        }

        // Advisory lock is automatically released at transaction end
        return po;
      });

      return result;
    } catch (error) {
      console.error("Database error in createPoFromScope:", error);
      throw error;
    }
  }

  async linkScopeToScheduleItem(scopeItemId: string, scheduleItemId: string): Promise<ScopeItem | undefined> {
    try {
      const [updated] = await db.update(schema.scopeItems)
        .set({ scheduleItemId })
        .where(eq(schema.scopeItems.id, scopeItemId))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in linkScopeToScheduleItem:", error);
      return undefined;
    }
  }

  // Company CRUD
  async getCompany(id: string): Promise<import("@shared/schema").Company | undefined> {
    const [company] = await db.select().from(schema.companies)
      .where(eq(schema.companies.id, id))
      .limit(1);
    return company;
  }

  async createCompany(company: import("@shared/schema").InsertCompany, ownerId: string): Promise<import("@shared/schema").Company> {
    const [newCompany] = await db.insert(schema.companies)
      .values({
        ...company,
        ownerId,
        isActive: true,
      })
      .returning();
    
    // Seed default roles for the company and get General Manager roleId
    const generalManagerRoleId = await this.seedDefaultRolesForCompany(newCompany.id);
    
    // Update user's companyId and assign General Manager role
    await db.update(schema.users)
      .set({ 
        companyId: newCompany.id,
        roleId: generalManagerRoleId,
        updatedAt: new Date()
      })
      .where(eq(schema.users.id, ownerId));
    
    return newCompany;
  }

  async updateCompany(id: string, company: Partial<import("@shared/schema").InsertCompany>): Promise<import("@shared/schema").Company | undefined> {
    const [updated] = await db.update(schema.companies)
      .set({ ...company, updatedAt: new Date() })
      .where(eq(schema.companies.id, id))
      .returning();
    return updated;
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> { 
    // Get first (and only) company settings record
    const [settings] = await db.select().from(schema.companySettings).limit(1);
    return settings;
  }
  
  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    // Get existing settings
    const existing = await this.getCompanySettings();
    
    if (existing) {
      // Update existing record
      const [updated] = await db.update(schema.companySettings)
        .set({ ...settings, updatedAt: new Date() })
        .where(eq(schema.companySettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record
      const [created] = await db.insert(schema.companySettings)
        .values(settings as InsertCompanySettings)
        .returning();
      return created;
    }
  }

  async getSystemConfiguration(): Promise<SystemConfiguration | undefined> {
    // Get first (and only) system configuration record
    const [config] = await db.select().from(schema.systemConfiguration).limit(1);
    return config;
  }
  
  async updateSystemConfiguration(config: Partial<InsertSystemConfiguration>): Promise<SystemConfiguration | undefined> {
    // Get existing config
    const existing = await this.getSystemConfiguration();
    
    if (existing) {
      // Update existing record
      const [updated] = await db.update(schema.systemConfiguration)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(schema.systemConfiguration.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record with defaults
      const [created] = await db.insert(schema.systemConfiguration)
        .values(config as InsertSystemConfiguration)
        .returning();
      return created;
    }
  }
  async getFieldCategories(): Promise<FieldCategory[]> {
    return await db.select().from(schema.fieldCategories)
      .where(eq(schema.fieldCategories.isActive, true))
      .orderBy(schema.fieldCategories.sortOrder);
  }
  
  async getFieldCategory(id: string): Promise<FieldCategory | undefined> {
    const [category] = await db.select().from(schema.fieldCategories)
      .where(eq(schema.fieldCategories.id, id))
      .limit(1);
    return category;
  }
  
  async getFieldCategoryByKey(key: string): Promise<FieldCategory | undefined> {
    const [category] = await db.select().from(schema.fieldCategories)
      .where(eq(schema.fieldCategories.key, key))
      .limit(1);
    return category;
  }
  
  async getFieldCategoryWithOptions(key: string): Promise<FieldCategoryWithOptions | undefined> {
    const category = await this.getFieldCategoryByKey(key);
    if (!category) return undefined;

    const options = await this.getFieldOptions(category.id);
    return {
      ...category,
      options
    };
  }
  async createFieldCategory(category: InsertFieldCategory): Promise<FieldCategory> { throw new Error("Not implemented"); }
  async updateFieldCategory(id: string, category: Partial<InsertFieldCategory>): Promise<FieldCategory | undefined> { return undefined; }
  async deleteFieldCategory(id: string): Promise<boolean> { return false; }
  async getFieldOptions(categoryId: string): Promise<FieldOption[]> {
    return await db.select().from(schema.fieldOptions)
      .where(and(
        eq(schema.fieldOptions.categoryId, categoryId),
        eq(schema.fieldOptions.isActive, true)
      ))
      .orderBy(schema.fieldOptions.sortOrder);
  }
  async getFieldOption(id: string): Promise<FieldOption | undefined> {
    const [option] = await db.select().from(schema.fieldOptions)
      .where(eq(schema.fieldOptions.id, id))
      .limit(1);
    return option;
  }
  
  async createFieldOption(option: InsertFieldOption): Promise<FieldOption> {
    const [created] = await db.insert(schema.fieldOptions)
      .values({
        ...option,
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return created;
  }
  
  async updateFieldOption(id: string, option: Partial<InsertFieldOption>): Promise<FieldOption | undefined> {
    const [updated] = await db.update(schema.fieldOptions)
      .set({
        ...option,
        updatedAt: new Date(),
      })
      .where(eq(schema.fieldOptions.id, id))
      .returning();
    return updated;
  }
  
  async deleteFieldOption(id: string): Promise<boolean> {
    const result = await db.delete(schema.fieldOptions)
      .where(eq(schema.fieldOptions.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }
  async setCategoryOptions(categoryId: string, options: Array<Partial<FieldOption> & { key: string; name: string }>): Promise<FieldOption[]> {
    try {
      // First, delete existing options for this category
      await db.delete(schema.fieldOptions)
        .where(eq(schema.fieldOptions.categoryId, categoryId));
      
      if (options.length === 0) {
        return [];
      }
      
      const now = new Date();
      
      // Ensure exactly one default option
      const hasDefault = options.some(opt => opt.isDefault);
      
      // Prepare new options for insertion
      const newOptions = options.map((optData, index) => ({
        id: optData.id || randomUUID(),
        categoryId,
        key: optData.key,
        name: optData.name,
        color: optData.color || "#6B7280",
        isActive: optData.isActive !== false, // Default to true
        isDefault: hasDefault ? (optData.isDefault === true) : (index === 0), // First option is default if none specified
        sortOrder: optData.sortOrder !== undefined ? optData.sortOrder : index,
        createdAt: optData.createdAt || now,
        updatedAt: now,
      }));
      
      // Insert new options
      const createdOptions = await db.insert(schema.fieldOptions)
        .values(newOptions)
        .returning();
      
      return createdOptions;
    } catch (error) {
      console.error("Database error in setCategoryOptions:", error);
      throw error;
    }
  }
  async getOptionAttachments(optionId: string): Promise<OptionAttachment[]> { return []; }
  async createOptionAttachment(attachment: InsertOptionAttachment): Promise<OptionAttachment> { throw new Error("Not implemented"); }
  async deleteOptionAttachment(id: string): Promise<boolean> { return false; }
  async getClientSelections(projectId: string): Promise<ClientSelection[]> { return []; }
  async createClientSelection(selection: InsertClientSelection): Promise<ClientSelection> { throw new Error("Not implemented"); }
  async deleteClientSelection(id: string): Promise<boolean> { return false; }

  async getSuppliers(companyId: string, supplierType?: "supplier" | "trade"): Promise<Supplier[]> {
    try {
      const conditions = [eq(schema.suppliers.companyId, companyId)];
      
      if (supplierType) {
        conditions.push(eq(schema.suppliers.supplierType, supplierType));
      }
      
      return await db.select()
        .from(schema.suppliers)
        .where(and(...conditions))
        .orderBy(schema.suppliers.name);
    } catch (error) {
      console.error("Database error in getSuppliers:", error);
      throw error;
    }
  }

  async getSupplierById(id: string): Promise<Supplier | null> {
    try {
      const suppliers = await db.select()
        .from(schema.suppliers)
        .where(eq(schema.suppliers.id, id));
      return suppliers[0] || null;
    } catch (error) {
      console.error("Database error in getSupplierById:", error);
      throw error;
    }
  }

  async createSupplier(supplier: InsertSupplier & { companyId: string }): Promise<Supplier> {
    try {
      const newSuppliers = await db.insert(schema.suppliers)
        .values(supplier)
        .returning();
      return newSuppliers[0];
    } catch (error) {
      console.error("Database error in createSupplier:", error);
      throw error;
    }
  }

  async updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier> {
    try {
      const updatedSuppliers = await db.update(schema.suppliers)
        .set({ ...supplier, updatedAt: new Date() })
        .where(eq(schema.suppliers.id, id))
        .returning();
      
      if (!updatedSuppliers[0]) {
        throw new Error("Supplier not found");
      }
      
      return updatedSuppliers[0];
    } catch (error) {
      console.error("Database error in updateSupplier:", error);
      throw error;
    }
  }

  async deleteSupplier(id: string): Promise<void> {
    try {
      await db.delete(schema.suppliers)
        .where(eq(schema.suppliers.id, id));
    } catch (error) {
      console.error("Database error in deleteSupplier:", error);
      throw error;
    }
  }

  // Supplier Labels CRUD
  async getSupplierLabels(companyId: string): Promise<SupplierLabel[]> {
    try {
      return await db.select()
        .from(schema.supplierLabels)
        .where(eq(schema.supplierLabels.companyId, companyId))
        .orderBy(schema.supplierLabels.displayOrder, schema.supplierLabels.name);
    } catch (error) {
      console.error("Database error in getSupplierLabels:", error);
      throw error;
    }
  }

  async createSupplierLabel(label: InsertSupplierLabel & { companyId: string }): Promise<SupplierLabel> {
    try {
      const newLabels = await db.insert(schema.supplierLabels)
        .values(label)
        .returning();
      return newLabels[0];
    } catch (error) {
      console.error("Database error in createSupplierLabel:", error);
      throw error;
    }
  }

  async updateSupplierLabel(id: string, label: Partial<InsertSupplierLabel>): Promise<SupplierLabel> {
    try {
      const updatedLabels = await db.update(schema.supplierLabels)
        .set({ ...label, updatedAt: new Date() })
        .where(eq(schema.supplierLabels.id, id))
        .returning();
      
      if (!updatedLabels[0]) {
        throw new Error("Supplier label not found");
      }
      
      return updatedLabels[0];
    } catch (error) {
      console.error("Database error in updateSupplierLabel:", error);
      throw error;
    }
  }

  async deleteSupplierLabel(id: string): Promise<void> {
    try {
      await db.delete(schema.supplierLabels)
        .where(eq(schema.supplierLabels.id, id));
    } catch (error) {
      console.error("Database error in deleteSupplierLabel:", error);
      throw error;
    }
  }

  async getSupplierLabelAssignments(supplierId: string): Promise<SupplierLabelAssignment[]> {
    try {
      return await db.select()
        .from(schema.supplierLabelAssignments)
        .where(eq(schema.supplierLabelAssignments.supplierId, supplierId));
    } catch (error) {
      console.error("Database error in getSupplierLabelAssignments:", error);
      throw error;
    }
  }

  async setSupplierLabels(supplierId: string, labelIds: string[]): Promise<void> {
    try {
      // Delete existing assignments
      await db.delete(schema.supplierLabelAssignments)
        .where(eq(schema.supplierLabelAssignments.supplierId, supplierId));
      
      // Insert new assignments
      if (labelIds.length > 0) {
        await db.insert(schema.supplierLabelAssignments)
          .values(labelIds.map(labelId => ({
            supplierId,
            labelId,
          })));
      }
    } catch (error) {
      console.error("Database error in setSupplierLabels:", error);
      throw error;
    }
  }

  // Supplier Insurances CRUD
  async getSupplierInsurances(supplierId: string): Promise<SupplierInsurance[]> {
    try {
      return await db.select()
        .from(schema.supplierInsurances)
        .where(eq(schema.supplierInsurances.supplierId, supplierId))
        .orderBy(schema.supplierInsurances.insuranceType);
    } catch (error) {
      console.error("Database error in getSupplierInsurances:", error);
      throw error;
    }
  }

  async createSupplierInsurance(insurance: InsertSupplierInsurance): Promise<SupplierInsurance> {
    try {
      const newInsurances = await db.insert(schema.supplierInsurances)
        .values(insurance)
        .returning();
      return newInsurances[0];
    } catch (error) {
      console.error("Database error in createSupplierInsurance:", error);
      throw error;
    }
  }

  async updateSupplierInsurance(id: string, insurance: Partial<InsertSupplierInsurance>): Promise<SupplierInsurance> {
    try {
      const updatedInsurances = await db.update(schema.supplierInsurances)
        .set({ ...insurance, updatedAt: new Date() })
        .where(eq(schema.supplierInsurances.id, id))
        .returning();
      
      if (!updatedInsurances[0]) {
        throw new Error("Supplier insurance not found");
      }
      
      return updatedInsurances[0];
    } catch (error) {
      console.error("Database error in updateSupplierInsurance:", error);
      throw error;
    }
  }

  async deleteSupplierInsurance(id: string): Promise<void> {
    try {
      await db.delete(schema.supplierInsurances)
        .where(eq(schema.supplierInsurances.id, id));
    } catch (error) {
      console.error("Database error in deleteSupplierInsurance:", error);
      throw error;
    }
  }

  async getExpiringInsurances(companyId: string, daysAhead: number): Promise<(SupplierInsurance & { supplier: Supplier })[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      const results = await db.select({
        insurance: schema.supplierInsurances,
        supplier: schema.suppliers,
      })
        .from(schema.supplierInsurances)
        .innerJoin(schema.suppliers, eq(schema.supplierInsurances.supplierId, schema.suppliers.id))
        .where(and(
          eq(schema.suppliers.companyId, companyId),
          lte(schema.supplierInsurances.expiryDate, futureDate),
          gte(schema.supplierInsurances.expiryDate, new Date())
        ));
      
      return results.map(r => ({
        ...r.insurance,
        supplier: r.supplier,
      }));
    } catch (error) {
      console.error("Database error in getExpiringInsurances:", error);
      throw error;
    }
  }

  // Contact Insurances CRUD (for contacts with contactType='supplier')
  async getContactInsurances(contactId: string): Promise<ContactInsurance[]> {
    try {
      return await db.select()
        .from(schema.contactInsurances)
        .where(eq(schema.contactInsurances.contactId, contactId))
        .orderBy(schema.contactInsurances.insuranceType);
    } catch (error: any) {
      // If table doesn't exist in production (migration not yet applied), return empty array
      if (error?.code === '42P01') {
        console.warn("contact_insurances table does not exist yet. Returning empty array.");
        return [];
      }
      console.error("Database error in getContactInsurances:", error);
      throw error;
    }
  }

  async createContactInsurance(insurance: InsertContactInsurance): Promise<ContactInsurance> {
    try {
      const newInsurances = await db.insert(schema.contactInsurances)
        .values(insurance)
        .returning();
      return newInsurances[0];
    } catch (error) {
      console.error("Database error in createContactInsurance:", error);
      throw error;
    }
  }

  async updateContactInsurance(id: string, insurance: Partial<InsertContactInsurance>): Promise<ContactInsurance> {
    try {
      const updatedInsurances = await db.update(schema.contactInsurances)
        .set({ ...insurance, updatedAt: new Date() })
        .where(eq(schema.contactInsurances.id, id))
        .returning();
      
      if (!updatedInsurances[0]) {
        throw new Error("Contact insurance not found");
      }
      
      return updatedInsurances[0];
    } catch (error) {
      console.error("Database error in updateContactInsurance:", error);
      throw error;
    }
  }

  async deleteContactInsurance(id: string): Promise<void> {
    try {
      await db.delete(schema.contactInsurances)
        .where(eq(schema.contactInsurances.id, id));
    } catch (error) {
      console.error("Database error in deleteContactInsurance:", error);
      throw error;
    }
  }

  async getExpiringContactInsurances(companyId: string, daysAhead: number): Promise<(ContactInsurance & { contact: Contact })[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      
      const results = await db.select({
        insurance: schema.contactInsurances,
        contact: schema.contacts,
      })
        .from(schema.contactInsurances)
        .innerJoin(schema.contacts, eq(schema.contactInsurances.contactId, schema.contacts.id))
        .where(and(
          eq(schema.contacts.companyId, companyId),
          eq(schema.contacts.contactType, 'supplier'),
          lte(schema.contactInsurances.expiryDate, futureDate),
          gte(schema.contactInsurances.expiryDate, new Date())
        ));
      
      return results.map(r => ({
        ...r.insurance,
        contact: r.contact,
      }));
    } catch (error: any) {
      // If table doesn't exist in production (migration not yet applied), return empty array
      if (error?.code === '42P01') {
        console.warn("contact_insurances table does not exist yet. Returning empty array.");
        return [];
      }
      console.error("Database error in getExpiringContactInsurances:", error);
      throw error;
    }
  }

  // Supplier Contacts CRUD
  async getSupplierContacts(supplierId: string): Promise<SupplierContact[]> {
    try {
      return await db.select()
        .from(schema.supplierContacts)
        .where(eq(schema.supplierContacts.supplierId, supplierId))
        .orderBy(desc(schema.supplierContacts.isPrimary), schema.supplierContacts.name);
    } catch (error) {
      console.error("Database error in getSupplierContacts:", error);
      throw error;
    }
  }

  async createSupplierContact(contact: InsertSupplierContact): Promise<SupplierContact> {
    try {
      const newContacts = await db.insert(schema.supplierContacts)
        .values(contact)
        .returning();
      return newContacts[0];
    } catch (error) {
      console.error("Database error in createSupplierContact:", error);
      throw error;
    }
  }

  async updateSupplierContact(id: string, contact: Partial<InsertSupplierContact>): Promise<SupplierContact> {
    try {
      const updatedContacts = await db.update(schema.supplierContacts)
        .set({ ...contact, updatedAt: new Date() })
        .where(eq(schema.supplierContacts.id, id))
        .returning();
      
      if (!updatedContacts[0]) {
        throw new Error("Supplier contact not found");
      }
      
      return updatedContacts[0];
    } catch (error) {
      console.error("Database error in updateSupplierContact:", error);
      throw error;
    }
  }

  async deleteSupplierContact(id: string): Promise<void> {
    try {
      await db.delete(schema.supplierContacts)
        .where(eq(schema.supplierContacts.id, id));
    } catch (error) {
      console.error("Database error in deleteSupplierContact:", error);
      throw error;
    }
  }

  async getContacts(companyId: string, contactType?: "team" | "supplier" | "client"): Promise<Contact[]> {
    try {
      const conditions = [eq(schema.contacts.companyId, companyId)];
      
      if (contactType) {
        conditions.push(eq(schema.contacts.contactType, contactType));
      }
      
      return await db.select()
        .from(schema.contacts)
        .where(and(...conditions))
        .orderBy(schema.contacts.name);
    } catch (error) {
      console.error("Database error in getContacts:", error);
      throw error;
    }
  }

  async getContact(id: string, companyId: string): Promise<Contact | undefined> {
    try {
      const contacts = await db.select()
        .from(schema.contacts)
        .where(and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.companyId, companyId)
        ));
      return contacts[0];
    } catch (error) {
      console.error("Database error in getContact:", error);
      throw error;
    }
  }

  async createContact(contact: InsertContact & { companyId: string }): Promise<Contact> {
    try {
      // Auto-generate name from firstName and lastName if not provided
      const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "";
      
      const newContacts = await db.insert(schema.contacts)
        .values({ ...contact, name })
        .returning();
      return newContacts[0];
    } catch (error) {
      console.error("Database error in createContact:", error);
      throw error;
    }
  }

  async updateContact(id: string, contact: Partial<InsertContact>, companyId: string): Promise<Contact | undefined> {
    try {
      // Auto-generate name from firstName and lastName if either is being updated with a non-empty value
      let updateData = { ...contact, updatedAt: new Date() };
      
      if (contact.firstName !== undefined || contact.lastName !== undefined) {
        // Get existing contact to merge firstName/lastName
        const existing = await this.getContact(id, companyId);
        if (existing) {
          const firstName = contact.firstName !== undefined ? contact.firstName : existing.firstName;
          const lastName = contact.lastName !== undefined ? contact.lastName : existing.lastName;
          
          // Only regenerate name if at least one name component is non-empty
          const trimmedFirst = (firstName || "").trim();
          const trimmedLast = (lastName || "").trim();
          
          if (trimmedFirst || trimmedLast) {
            updateData.name = [trimmedFirst, trimmedLast].filter(Boolean).join(" ");
          }
          // If both are empty, preserve the existing name (don't overwrite with "")
        }
      }
      
      const updatedContacts = await db.update(schema.contacts)
        .set(updateData)
        .where(and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.companyId, companyId)
        ))
        .returning();
      return updatedContacts[0];
    } catch (error) {
      console.error("Database error in updateContact:", error);
      throw error;
    }
  }

  async archiveContact(id: string, companyId: string): Promise<Contact | undefined> {
    try {
      const archivedContacts = await db.update(schema.contacts)
        .set({ isArchived: true, archivedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.companyId, companyId)
        ))
        .returning();
      return archivedContacts[0];
    } catch (error) {
      console.error("Database error in archiveContact:", error);
      throw error;
    }
  }

  async restoreContact(id: string, companyId: string): Promise<Contact | undefined> {
    try {
      const restoredContacts = await db.update(schema.contacts)
        .set({ isArchived: false, archivedAt: null, updatedAt: new Date() })
        .where(and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.companyId, companyId)
        ))
        .returning();
      return restoredContacts[0];
    } catch (error) {
      console.error("Database error in restoreContact:", error);
      throw error;
    }
  }

  async deleteArchivedContactsOlderThan(date: Date): Promise<number> {
    try {
      const deleted = await db.delete(schema.contacts)
        .where(and(
          eq(schema.contacts.isArchived, true),
          lte(schema.contacts.archivedAt, date)
        ))
        .returning();
      return deleted.length;
    } catch (error) {
      console.error("Database error in deleteArchivedContactsOlderThan:", error);
      return 0;
    }
  }

  async deleteContact(id: string, companyId: string): Promise<void> {
    try {
      await db.delete(schema.contacts)
        .where(and(
          eq(schema.contacts.id, id),
          eq(schema.contacts.companyId, companyId)
        ));
    } catch (error) {
      console.error("Database error in deleteContact:", error);
      throw error;
    }
  }

  async mergeContacts(sourceId: string, targetId: string, companyId: string): Promise<{ success: boolean; transferredCounts: Record<string, number> }> {
    try {
      const transferredCounts: Record<string, number> = {};
      console.log(`[mergeContacts] Starting merge: source=${sourceId}, target=${targetId}, company=${companyId}`);

      // Get target contact name for cached fields
      const targetContact = await db.select().from(schema.contacts).where(eq(schema.contacts.id, targetId)).limit(1);
      const targetName = targetContact[0]?.name || targetContact[0]?.company || '';
      console.log(`[mergeContacts] Target contact name: ${targetName}`);

      // Update projects.clientId
      const projectsResult = await db
        .update(schema.projects)
        .set({ clientId: targetId })
        .where(and(
          eq(schema.projects.clientId, sourceId),
          eq(schema.projects.companyId, companyId)
        ))
        .returning();
      transferredCounts.projects = projectsResult.length;

      // Note: Tasks (notes table) use assigneeId which references users, not contacts
      // So we don't transfer tasks during contact merge

      // Update scheduleItems.assignedToId (correct column name)
      const scheduleItemsResult = await db
        .update(schema.scheduleItems)
        .set({ 
          assignedToId: targetId,
          assignedToName: targetName
        })
        .where(eq(schema.scheduleItems.assignedToId, sourceId))
        .returning();
      transferredCounts.scheduleItems = scheduleItemsResult.length;

      // Update purchaseOrders.supplierId
      const purchaseOrdersResult = await db
        .update(schema.purchaseOrders)
        .set({ 
          supplierId: targetId,
          supplierName: targetName
        })
        .where(and(
          eq(schema.purchaseOrders.supplierId, sourceId),
          eq(schema.purchaseOrders.companyId, companyId)
        ))
        .returning();
      transferredCounts.purchaseOrders = purchaseOrdersResult.length;

      // Update rfis.directedToContactId
      const rfisResult = await db
        .update(schema.rfis)
        .set({ directedToContactId: targetId })
        .where(eq(schema.rfis.directedToContactId, sourceId))
        .returning();
      transferredCounts.rfis = rfisResult.length;

      // Update favoriteSuppliers.supplierId (contacts as suppliers)
      const favoriteSuppliersResult = await db
        .update(schema.favoriteSuppliers)
        .set({ supplierId: targetId })
        .where(eq(schema.favoriteSuppliers.supplierId, sourceId))
        .returning();
      transferredCounts.favoriteSuppliers = favoriteSuppliersResult.length;

      // Update bills.supplierId (contacts as suppliers)
      const billsResult = await db
        .update(schema.bills)
        .set({ supplierId: targetId })
        .where(eq(schema.bills.supplierId, sourceId))
        .returning();
      transferredCounts.bills = billsResult.length;

      // Update rfqQuotes.supplierId (contacts as suppliers)
      const rfqQuotesResult = await db
        .update(schema.rfqQuotes)
        .set({ supplierId: targetId })
        .where(eq(schema.rfqQuotes.supplierId, sourceId))
        .returning();
      transferredCounts.rfqQuotes = rfqQuotesResult.length;

      // Update priceListItems.supplierId (contacts as suppliers)
      const priceListItemsResult = await db
        .update(schema.priceListItems)
        .set({ supplierId: targetId })
        .where(and(
          eq(schema.priceListItems.supplierId, sourceId),
          eq(schema.priceListItems.companyId, companyId)
        ))
        .returning();
      transferredCounts.priceListItems = priceListItemsResult.length;

      // Transfer contactInsurances from source to target (using explicit import to avoid bundler issues)
      console.log(`[mergeContacts] Transferring contact insurances...`);
      const contactInsurancesResult = await db
        .update(contactInsurancesTable)
        .set({ contactId: targetId })
        .where(eq(contactInsurancesTable.contactId, sourceId))
        .returning();
      transferredCounts.contactInsurances = contactInsurancesResult.length;
      console.log(`[mergeContacts] Transferred ${contactInsurancesResult.length} contact insurances`);

      // Update RFQs supplierIds array - replace sourceId with targetId
      const rfqsWithSource = await db
        .select()
        .from(schema.rfqs)
        .where(and(
          eq(schema.rfqs.companyId, companyId),
          sql`${sourceId} = ANY(${schema.rfqs.supplierIds})`
        ));
      
      let rfqsUpdated = 0;
      for (const rfq of rfqsWithSource) {
        const newSupplierIds = (rfq.supplierIds || []).map(id => id === sourceId ? targetId : id);
        const newSupplierNames = [...(rfq.supplierNames || [])];
        const sourceIndex = (rfq.supplierIds || []).indexOf(sourceId);
        if (sourceIndex >= 0 && newSupplierNames[sourceIndex]) {
          newSupplierNames[sourceIndex] = targetName;
        }
        // Remove duplicates if target was already in the list
        const uniqueIds: string[] = [];
        const uniqueNames: string[] = [];
        newSupplierIds.forEach((id, idx) => {
          if (!uniqueIds.includes(id)) {
            uniqueIds.push(id);
            uniqueNames.push(newSupplierNames[idx] || '');
          }
        });
        
        await db
          .update(schema.rfqs)
          .set({ 
            supplierIds: uniqueIds,
            supplierNames: uniqueNames
          })
          .where(eq(schema.rfqs.id, rfq.id));
        rfqsUpdated++;
      }
      transferredCounts.rfqs = rfqsUpdated;

      // Archive the source contact (preserves history for auditing)
      console.log(`[mergeContacts] Archiving source contact ${sourceId}...`);
      await db.update(schema.contacts)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(and(
          eq(schema.contacts.id, sourceId),
          eq(schema.contacts.companyId, companyId)
        ));
      console.log(`[mergeContacts] Merge completed successfully`);

      return { success: true, transferredCounts };
    } catch (error) {
      console.error("Database error in mergeContacts:", error);
      return { success: false, transferredCounts: {} };
    }
  }

  // RFQ Methods
  async getRFQs(companyId: string, projectId?: string): Promise<Rfq[]> {
    try {
      const conditions = [eq(schema.rfqs.companyId, companyId)];
      
      if (projectId) {
        conditions.push(eq(schema.rfqs.projectId, projectId));
      }
      
      const rfqs = await db.select()
        .from(schema.rfqs)
        .where(and(...conditions))
        .orderBy(desc(schema.rfqs.createdAt));
      
      return rfqs;
    } catch (error) {
      console.error("Database error in getRFQs:", error);
      throw error;
    }
  }

  async getRFQ(id: string): Promise<Rfq | undefined> {
    try {
      const rfqs = await db.select()
        .from(schema.rfqs)
        .where(eq(schema.rfqs.id, id));
      return rfqs[0];
    } catch (error) {
      console.error("Database error in getRFQ:", error);
      throw error;
    }
  }

  async createRFQ(rfq: InsertRfq): Promise<Rfq> {
    try {
      const newRfqs = await db.insert(schema.rfqs)
        .values(rfq)
        .returning();
      return newRfqs[0];
    } catch (error) {
      console.error("Database error in createRFQ:", error);
      throw error;
    }
  }

  async updateRFQ(id: string, rfq: Partial<InsertRfq>): Promise<Rfq | undefined> {
    try {
      const updatedRfqs = await db.update(schema.rfqs)
        .set({ ...rfq, updatedAt: new Date() })
        .where(eq(schema.rfqs.id, id))
        .returning();
      return updatedRfqs[0];
    } catch (error) {
      console.error("Database error in updateRFQ:", error);
      throw error;
    }
  }

  async deleteRFQ(id: string): Promise<boolean> {
    try {
      // First delete all related RFQ items
      await db.delete(schema.rfqItems)
        .where(eq(schema.rfqItems.rfqId, id));
      
      // Then delete the RFQ
      const deletedRfqs = await db.delete(schema.rfqs)
        .where(eq(schema.rfqs.id, id))
        .returning();
      
      return deletedRfqs.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFQ:", error);
      throw error;
    }
  }

  // RFQ Items Methods
  async getRFQItems(rfqId: string): Promise<RfqItem[]> {
    try {
      const items = await db.select()
        .from(schema.rfqItems)
        .where(eq(schema.rfqItems.rfqId, rfqId))
        .orderBy(asc(schema.rfqItems.displayOrder));
      return items;
    } catch (error) {
      console.error("Database error in getRFQItems:", error);
      throw error;
    }
  }

  async createRFQItem(item: InsertRfqItem): Promise<RfqItem> {
    try {
      const newItems = await db.insert(schema.rfqItems)
        .values(item)
        .returning();
      return newItems[0];
    } catch (error) {
      console.error("Database error in createRFQItem:", error);
      throw error;
    }
  }

  async updateRFQItem(id: string, item: Partial<InsertRfqItem>): Promise<RfqItem | undefined> {
    try {
      const updatedItems = await db.update(schema.rfqItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.rfqItems.id, id))
        .returning();
      return updatedItems[0];
    } catch (error) {
      console.error("Database error in updateRFQItem:", error);
      throw error;
    }
  }

  async deleteRFQItem(id: string): Promise<boolean> {
    try {
      const deletedItems = await db.delete(schema.rfqItems)
        .where(eq(schema.rfqItems.id, id))
        .returning();
      return deletedItems.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFQItem:", error);
      throw error;
    }
  }

  // RFQ Quotes Methods
  async getRFQQuotes(rfqId: string): Promise<RfqQuote[]> {
    try {
      const quotes = await db.select()
        .from(schema.rfqQuotes)
        .where(eq(schema.rfqQuotes.rfqId, rfqId))
        .orderBy(asc(schema.rfqQuotes.createdAt));
      return quotes;
    } catch (error) {
      console.error("Database error in getRFQQuotes:", error);
      throw error;
    }
  }

  async getRFQQuote(id: string): Promise<RfqQuote | undefined> {
    try {
      const quotes = await db.select()
        .from(schema.rfqQuotes)
        .where(eq(schema.rfqQuotes.id, id));
      return quotes[0];
    } catch (error) {
      console.error("Database error in getRFQQuote:", error);
      throw error;
    }
  }

  async createRFQQuote(quote: InsertRfqQuote): Promise<RfqQuote> {
    try {
      const newQuotes = await db.insert(schema.rfqQuotes)
        .values(quote)
        .returning();
      return newQuotes[0];
    } catch (error) {
      console.error("Database error in createRFQQuote:", error);
      throw error;
    }
  }

  async updateRFQQuote(id: string, quote: Partial<InsertRfqQuote>): Promise<RfqQuote | undefined> {
    try {
      const updatedQuotes = await db.update(schema.rfqQuotes)
        .set({ ...quote, updatedAt: new Date() })
        .where(eq(schema.rfqQuotes.id, id))
        .returning();
      return updatedQuotes[0];
    } catch (error) {
      console.error("Database error in updateRFQQuote:", error);
      throw error;
    }
  }

  async deleteRFQQuote(id: string): Promise<boolean> {
    try {
      const deletedQuotes = await db.delete(schema.rfqQuotes)
        .where(eq(schema.rfqQuotes.id, id))
        .returning();
      return deletedQuotes.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFQQuote:", error);
      throw error;
    }
  }

  // RFQ Follow-ups Methods
  async getRFQFollowUps(rfqId: string): Promise<RfqFollowUp[]> {
    try {
      const followUps = await db.select()
        .from(schema.rfqFollowUps)
        .where(eq(schema.rfqFollowUps.rfqId, rfqId))
        .orderBy(asc(schema.rfqFollowUps.scheduledFor));
      return followUps;
    } catch (error) {
      console.error("Database error in getRFQFollowUps:", error);
      throw error;
    }
  }

  async createRFQFollowUp(followUp: InsertRfqFollowUp): Promise<RfqFollowUp> {
    try {
      const newFollowUps = await db.insert(schema.rfqFollowUps)
        .values(followUp)
        .returning();
      return newFollowUps[0];
    } catch (error) {
      console.error("Database error in createRFQFollowUp:", error);
      throw error;
    }
  }

  async updateRFQFollowUp(id: string, followUp: Partial<InsertRfqFollowUp>): Promise<RfqFollowUp> {
    try {
      const updatedFollowUps = await db.update(schema.rfqFollowUps)
        .set(followUp)
        .where(eq(schema.rfqFollowUps.id, id))
        .returning();
      return updatedFollowUps[0];
    } catch (error) {
      console.error("Database error in updateRFQFollowUp:", error);
      throw error;
    }
  }

  async deleteRFQFollowUp(id: string): Promise<boolean> {
    try {
      const deletedFollowUps = await db.delete(schema.rfqFollowUps)
        .where(eq(schema.rfqFollowUps.id, id))
        .returning();
      return deletedFollowUps.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFQFollowUp:", error);
      throw error;
    }
  }

  // RFQ Portal Token Methods
  async getRFQPortalTokens(rfqId: string): Promise<RfqPortalToken[]> {
    try {
      const tokens = await db.select()
        .from(schema.rfqPortalTokens)
        .where(eq(schema.rfqPortalTokens.rfqId, rfqId))
        .orderBy(desc(schema.rfqPortalTokens.createdAt));
      return tokens;
    } catch (error) {
      console.error("Database error in getRFQPortalTokens:", error);
      throw error;
    }
  }

  async getRFQPortalTokenByToken(token: string): Promise<RfqPortalToken | undefined> {
    try {
      const tokens = await db.select()
        .from(schema.rfqPortalTokens)
        .where(and(
          eq(schema.rfqPortalTokens.token, token),
          eq(schema.rfqPortalTokens.isActive, true)
        ));
      return tokens[0];
    } catch (error) {
      console.error("Database error in getRFQPortalTokenByToken:", error);
      throw error;
    }
  }

  async createRFQPortalToken(portalToken: InsertRfqPortalToken): Promise<RfqPortalToken> {
    try {
      const newTokens = await db.insert(schema.rfqPortalTokens)
        .values(portalToken)
        .returning();
      return newTokens[0];
    } catch (error) {
      console.error("Database error in createRFQPortalToken:", error);
      throw error;
    }
  }

  async updateRFQPortalToken(id: string, portalToken: Partial<InsertRfqPortalToken>): Promise<RfqPortalToken | undefined> {
    try {
      const updatedTokens = await db.update(schema.rfqPortalTokens)
        .set(portalToken)
        .where(eq(schema.rfqPortalTokens.id, id))
        .returning();
      return updatedTokens[0];
    } catch (error) {
      console.error("Database error in updateRFQPortalToken:", error);
      throw error;
    }
  }

  async deleteRFQPortalToken(id: string): Promise<boolean> {
    try {
      const deletedTokens = await db.delete(schema.rfqPortalTokens)
        .where(eq(schema.rfqPortalTokens.id, id))
        .returning();
      return deletedTokens.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFQPortalToken:", error);
      throw error;
    }
  }

  // RFI Methods
  async getRFIs(companyId: string, projectId?: string): Promise<Rfi[]> {
    try {
      const conditions = [eq(schema.rfis.companyId, companyId)];
      if (projectId) {
        conditions.push(eq(schema.rfis.projectId, projectId));
      }
      const rfis = await db.select()
        .from(schema.rfis)
        .where(and(...conditions))
        .orderBy(desc(schema.rfis.createdAt));
      return rfis;
    } catch (error) {
      console.error("Database error in getRFIs:", error);
      throw error;
    }
  }

  async getRFI(id: string): Promise<Rfi | undefined> {
    try {
      const rfis = await db.select()
        .from(schema.rfis)
        .where(eq(schema.rfis.id, id));
      return rfis[0];
    } catch (error) {
      console.error("Database error in getRFI:", error);
      throw error;
    }
  }

  async getNextRFINumber(companyId: string, projectId: string): Promise<string> {
    try {
      // Get project job number
      const projects = await db.select()
        .from(schema.projects)
        .where(eq(schema.projects.id, projectId));
      const project = projects[0];
      const jobNumber = project?.jobNumber || "";

      // Get system config for prefix
      const config = await db.select()
        .from(schema.systemConfiguration)
        .limit(1);
      const rfiPrefix = config[0]?.rfiPrefix || "RFI-";
      const startNumber = config[0]?.rfiStartNumber || 1000;

      // Get count of RFIs for this project
      const existingRfis = await db.select()
        .from(schema.rfis)
        .where(eq(schema.rfis.projectId, projectId));
      
      const nextNum = startNumber + existingRfis.length;
      const paddedNum = String(nextNum).padStart(3, '0');
      
      // Format: JOBNUMBER-RFI-001 or just RFI-001 if no job number
      if (jobNumber) {
        return `${jobNumber}-${rfiPrefix}${paddedNum}`;
      }
      return `${rfiPrefix}${paddedNum}`;
    } catch (error) {
      console.error("Database error in getNextRFINumber:", error);
      throw error;
    }
  }

  async createRFI(rfi: InsertRfi, companyId: string, userId: string, userName: string): Promise<Rfi> {
    try {
      const rfiNumber = await this.getNextRFINumber(companyId, rfi.projectId);
      const newRfis = await db.insert(schema.rfis)
        .values({
          ...rfi,
          companyId,
          createdById: userId,
          createdByName: userName,
          rfiNumber,
        })
        .returning();
      return newRfis[0];
    } catch (error) {
      console.error("Database error in createRFI:", error);
      throw error;
    }
  }

  async updateRFI(id: string, rfi: Partial<InsertRfi>): Promise<Rfi | undefined> {
    try {
      const updatedRfis = await db.update(schema.rfis)
        .set({ ...rfi, updatedAt: new Date() })
        .where(eq(schema.rfis.id, id))
        .returning();
      return updatedRfis[0];
    } catch (error) {
      console.error("Database error in updateRFI:", error);
      throw error;
    }
  }

  async deleteRFI(id: string): Promise<boolean> {
    try {
      // First delete related comments
      await db.delete(schema.rfiComments)
        .where(eq(schema.rfiComments.rfiId, id));
      
      const deletedRfis = await db.delete(schema.rfis)
        .where(eq(schema.rfis.id, id))
        .returning();
      return deletedRfis.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFI:", error);
      throw error;
    }
  }

  // RFI Comments Methods
  async getRFIComments(rfiId: string): Promise<RfiComment[]> {
    try {
      const comments = await db.select()
        .from(schema.rfiComments)
        .where(eq(schema.rfiComments.rfiId, rfiId))
        .orderBy(asc(schema.rfiComments.createdAt));
      return comments;
    } catch (error) {
      console.error("Database error in getRFIComments:", error);
      throw error;
    }
  }

  async createRFIComment(comment: InsertRfiComment): Promise<RfiComment> {
    try {
      const newComments = await db.insert(schema.rfiComments)
        .values(comment)
        .returning();
      return newComments[0];
    } catch (error) {
      console.error("Database error in createRFIComment:", error);
      throw error;
    }
  }

  async updateRFIComment(id: string, comment: Partial<InsertRfiComment>): Promise<RfiComment | undefined> {
    try {
      const updatedComments = await db.update(schema.rfiComments)
        .set({ ...comment, updatedAt: new Date() })
        .where(eq(schema.rfiComments.id, id))
        .returning();
      return updatedComments[0];
    } catch (error) {
      console.error("Database error in updateRFIComment:", error);
      throw error;
    }
  }

  async deleteRFIComment(id: string): Promise<boolean> {
    try {
      const deletedComments = await db.delete(schema.rfiComments)
        .where(eq(schema.rfiComments.id, id))
        .returning();
      return deletedComments.length > 0;
    } catch (error) {
      console.error("Database error in deleteRFIComment:", error);
      throw error;
    }
  }

  async getBills(projectId?: string, status?: string): Promise<Bill[]> {
    try {
      let query = db.select().from(schema.bills);
      const conditions = [];
      
      if (projectId) {
        conditions.push(eq(schema.bills.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.bills.status, status as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return await query.orderBy(desc(schema.bills.createdAt));
    } catch (error) {
      console.error("Database error in getBills:", error);
      throw error;
    }
  }

  async getBillById(id: string): Promise<Bill | null> {
    try {
      const bills = await db.select()
        .from(schema.bills)
        .where(eq(schema.bills.id, id));
      return bills[0] || null;
    } catch (error) {
      console.error("Database error in getBillById:", error);
      throw error;
    }
  }

  async getNextBillNumber(): Promise<string> {
    try {
      const sysConfig = await this.getSystemConfiguration();
      const prefix = sysConfig?.billPrefix || "BILL-";
      const startNumber = sysConfig?.billStartNumber || 1000;

      const existingBills = await db.select({ billNumber: schema.bills.billNumber })
        .from(schema.bills)
        .orderBy(desc(schema.bills.billNumber));

      let maxNumber = startNumber - 1;
      const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedPrefix}(\\d+)$`);
      for (const b of existingBills) {
        const match = b.billNumber.match(regex);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNumber) maxNumber = num;
        }
      }

      return `${prefix}${maxNumber + 1}`;
    } catch (error) {
      console.error("Database error in getNextBillNumber:", error);
      throw error;
    }
  }

  async createBill(bill: InsertBill): Promise<Bill> {
    try {
      const newBills = await db.insert(schema.bills)
        .values(bill)
        .returning();
      return newBills[0];
    } catch (error) {
      console.error("Database error in createBill:", error);
      throw error;
    }
  }

  async updateBill(id: string, bill: Partial<InsertBill>): Promise<Bill> {
    try {
      const updatedBills = await db.update(schema.bills)
        .set({ ...bill, updatedAt: new Date() })
        .where(eq(schema.bills.id, id))
        .returning();
      
      if (!updatedBills[0]) {
        throw new Error("Bill not found");
      }
      
      return updatedBills[0];
    } catch (error) {
      console.error("Database error in updateBill:", error);
      throw error;
    }
  }

  async deleteBill(id: string): Promise<void> {
    try {
      await db.delete(schema.bills)
        .where(eq(schema.bills.id, id));
    } catch (error) {
      console.error("Database error in deleteBill:", error);
      throw error;
    }
  }

  async getBillLineItems(billId: string): Promise<BillLineItem[]> {
    try {
      return await db.select()
        .from(schema.billLineItems)
        .where(eq(schema.billLineItems.billId, billId))
        .orderBy(schema.billLineItems.order);
    } catch (error) {
      console.error("Database error in getBillLineItems:", error);
      throw error;
    }
  }

  async getUnlinkedBillLineItems(companyId: string): Promise<any[]> {
    try {
      const items = await db.select({
        id: schema.billLineItems.id,
        billId: schema.billLineItems.billId,
        lineType: schema.billLineItems.lineType,
        description: schema.billLineItems.description,
        costCodeId: schema.billLineItems.costCodeId,
        priceListItemId: schema.billLineItems.priceListItemId,
        quantity: schema.billLineItems.quantity,
        unitPrice: schema.billLineItems.unitPrice,
        tax: schema.billLineItems.tax,
        account: schema.billLineItems.account,
        total: schema.billLineItems.total,
        order: schema.billLineItems.order,
        createdAt: schema.billLineItems.createdAt,
        bill: {
          id: schema.bills.id,
          billNumber: schema.bills.billNumber,
          supplierId: schema.bills.supplierId,
          projectId: schema.bills.projectId,
          billDate: schema.bills.billDate,
        },
      })
        .from(schema.billLineItems)
        .innerJoin(schema.bills, eq(schema.billLineItems.billId, schema.bills.id))
        .innerJoin(schema.projects, eq(schema.bills.projectId, schema.projects.id))
        .where(
          and(
            eq(schema.projects.companyId, companyId),
            isNull(schema.billLineItems.priceListItemId)
          )
        )
        .orderBy(desc(schema.bills.billDate), schema.billLineItems.order);
      
      const supplierIds = [...new Set(items.map(item => item.bill.supplierId).filter(Boolean))] as string[];
      const suppliersData = supplierIds.length > 0 
        ? await db.select()
            .from(schema.contacts)
            .where(inArray(schema.contacts.id, supplierIds))
        : [];
      
      const supplierMap = new Map(suppliersData.map(s => [s.id, s]));
      
      return items.map(item => ({
        ...item,
        bill: {
          ...item.bill,
          supplier: item.bill.supplierId ? supplierMap.get(item.bill.supplierId) : null,
        },
      }));
    } catch (error) {
      console.error("Database error in getUnlinkedBillLineItems:", error);
      throw error;
    }
  }

  async createBillLineItem(item: InsertBillLineItem): Promise<BillLineItem> {
    try {
      const newItems = await db.insert(schema.billLineItems)
        .values(item)
        .returning();
      return newItems[0];
    } catch (error) {
      console.error("Database error in createBillLineItem:", error);
      throw error;
    }
  }

  async updateBillLineItem(id: string, item: Partial<InsertBillLineItem>): Promise<BillLineItem> {
    try {
      const updatedItems = await db.update(schema.billLineItems)
        .set(item)
        .where(eq(schema.billLineItems.id, id))
        .returning();
      
      if (!updatedItems[0]) {
        throw new Error("Bill line item not found");
      }
      
      return updatedItems[0];
    } catch (error) {
      console.error("Database error in updateBillLineItem:", error);
      throw error;
    }
  }

  async deleteBillLineItem(id: string): Promise<void> {
    try {
      await db.delete(schema.billLineItems)
        .where(eq(schema.billLineItems.id, id));
    } catch (error) {
      console.error("Database error in deleteBillLineItem:", error);
      throw error;
    }
  }

  async getBillLineItemAllowances(billLineItemId: string): Promise<BillLineItemAllowance[]> {
    try {
      const allowances = await db.select()
        .from(schema.billLineItemAllowances)
        .where(eq(schema.billLineItemAllowances.billLineItemId, billLineItemId));
      return allowances;
    } catch (error) {
      console.error("Database error in getBillLineItemAllowances:", error);
      throw error;
    }
  }

  async getBillLineItemAllowancesByBillId(billId: string): Promise<BillLineItemAllowance[]> {
    try {
      const allowances = await db.select({
        id: schema.billLineItemAllowances.id,
        billLineItemId: schema.billLineItemAllowances.billLineItemId,
        estimateItemId: schema.billLineItemAllowances.estimateItemId,
        amount: schema.billLineItemAllowances.amount,
        createdAt: schema.billLineItemAllowances.createdAt,
      })
        .from(schema.billLineItemAllowances)
        .innerJoin(schema.billLineItems, eq(schema.billLineItemAllowances.billLineItemId, schema.billLineItems.id))
        .where(eq(schema.billLineItems.billId, billId));
      return allowances as BillLineItemAllowance[];
    } catch (error) {
      console.error("Database error in getBillLineItemAllowancesByBillId:", error);
      throw error;
    }
  }

  async createBillLineItemAllowance(allowance: InsertBillLineItemAllowance): Promise<BillLineItemAllowance> {
    try {
      const [newAllowance] = await db.insert(schema.billLineItemAllowances)
        .values(allowance)
        .returning();
      return newAllowance;
    } catch (error) {
      console.error("Database error in createBillLineItemAllowance:", error);
      throw error;
    }
  }

  async updateBillLineItemAllowance(id: string, allowance: Partial<InsertBillLineItemAllowance>): Promise<BillLineItemAllowance | undefined> {
    try {
      const [updatedAllowance] = await db.update(schema.billLineItemAllowances)
        .set(allowance)
        .where(eq(schema.billLineItemAllowances.id, id))
        .returning();
      return updatedAllowance;
    } catch (error) {
      console.error("Database error in updateBillLineItemAllowance:", error);
      throw error;
    }
  }

  async deleteBillLineItemAllowance(id: string): Promise<void> {
    try {
      await db.delete(schema.billLineItemAllowances)
        .where(eq(schema.billLineItemAllowances.id, id));
    } catch (error) {
      console.error("Database error in deleteBillLineItemAllowance:", error);
      throw error;
    }
  }

  async deleteBillLineItemAllowancesByLineItemId(billLineItemId: string): Promise<void> {
    try {
      await db.delete(schema.billLineItemAllowances)
        .where(eq(schema.billLineItemAllowances.billLineItemId, billLineItemId));
    } catch (error) {
      console.error("Database error in deleteBillLineItemAllowancesByLineItemId:", error);
      throw error;
    }
  }

  async getTimesheetAllowances(timesheetId: string): Promise<TimesheetAllowance[]> {
    try {
      const allowances = await db.select()
        .from(schema.timesheetAllowances)
        .where(eq(schema.timesheetAllowances.timesheetId, timesheetId));
      return allowances;
    } catch (error) {
      console.error("Database error in getTimesheetAllowances:", error);
      throw error;
    }
  }

  async getTimesheetAllowancesByProject(projectId: string): Promise<TimesheetAllowance[]> {
    try {
      const allowances = await db.select({
        id: schema.timesheetAllowances.id,
        timesheetId: schema.timesheetAllowances.timesheetId,
        estimateItemId: schema.timesheetAllowances.estimateItemId,
        hours: schema.timesheetAllowances.hours,
        amount: schema.timesheetAllowances.amount,
        createdAt: schema.timesheetAllowances.createdAt,
      })
        .from(schema.timesheetAllowances)
        .innerJoin(schema.timesheets, eq(schema.timesheetAllowances.timesheetId, schema.timesheets.id))
        .where(eq(schema.timesheets.projectId, projectId));
      return allowances as TimesheetAllowance[];
    } catch (error) {
      console.error("Database error in getTimesheetAllowancesByProject:", error);
      throw error;
    }
  }

  async createTimesheetAllowance(allowance: InsertTimesheetAllowance): Promise<TimesheetAllowance> {
    try {
      const [newAllowance] = await db.insert(schema.timesheetAllowances)
        .values(allowance)
        .returning();
      return newAllowance;
    } catch (error) {
      console.error("Database error in createTimesheetAllowance:", error);
      throw error;
    }
  }

  async updateTimesheetAllowance(id: string, allowance: Partial<InsertTimesheetAllowance>): Promise<TimesheetAllowance | undefined> {
    try {
      const [updatedAllowance] = await db.update(schema.timesheetAllowances)
        .set(allowance)
        .where(eq(schema.timesheetAllowances.id, id))
        .returning();
      return updatedAllowance;
    } catch (error) {
      console.error("Database error in updateTimesheetAllowance:", error);
      throw error;
    }
  }

  async deleteTimesheetAllowance(id: string): Promise<void> {
    try {
      await db.delete(schema.timesheetAllowances)
        .where(eq(schema.timesheetAllowances.id, id));
    } catch (error) {
      console.error("Database error in deleteTimesheetAllowance:", error);
      throw error;
    }
  }

  async deleteTimesheetAllowancesByTimesheetId(timesheetId: string): Promise<void> {
    try {
      await db.delete(schema.timesheetAllowances)
        .where(eq(schema.timesheetAllowances.timesheetId, timesheetId));
    } catch (error) {
      console.error("Database error in deleteTimesheetAllowancesByTimesheetId:", error);
      throw error;
    }
  }

  async getAllowanceItems(estimateItemId: string): Promise<AllowanceItem[]> {
    try {
      const items = await db.select()
        .from(schema.allowanceItems)
        .where(eq(schema.allowanceItems.estimateItemId, estimateItemId))
        .orderBy(schema.allowanceItems.sortOrder);
      return items;
    } catch (error) {
      console.error("Database error in getAllowanceItems:", error);
      throw error;
    }
  }

  async createAllowanceItem(item: InsertAllowanceItem): Promise<AllowanceItem> {
    try {
      const [newItem] = await db.insert(schema.allowanceItems)
        .values(item)
        .returning();
      return newItem;
    } catch (error) {
      console.error("Database error in createAllowanceItem:", error);
      throw error;
    }
  }

  async updateAllowanceItem(id: string, item: Partial<InsertAllowanceItem>): Promise<AllowanceItem | undefined> {
    try {
      const [updated] = await db.update(schema.allowanceItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.allowanceItems.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateAllowanceItem:", error);
      throw error;
    }
  }

  async deleteAllowanceItem(id: string): Promise<void> {
    try {
      await db.delete(schema.allowanceItems)
        .where(eq(schema.allowanceItems.id, id));
    } catch (error) {
      console.error("Database error in deleteAllowanceItem:", error);
      throw error;
    }
  }

  async deleteAllowanceItemsByEstimateItemId(estimateItemId: string): Promise<void> {
    try {
      await db.delete(schema.allowanceItems)
        .where(eq(schema.allowanceItems.estimateItemId, estimateItemId));
    } catch (error) {
      console.error("Database error in deleteAllowanceItemsByEstimateItemId:", error);
      throw error;
    }
  }

  async getBillApprovals(billId: string): Promise<BillApproval[]> {
    try {
      const approvals = await db
        .select({
          id: schema.billApprovals.id,
          billId: schema.billApprovals.billId,
          approvedById: schema.billApprovals.approvedById,
          approvedByName: schema.users.firstName,
          approvedByLastName: schema.users.lastName,
          status: schema.billApprovals.status,
          comments: schema.billApprovals.comments,
          createdAt: schema.billApprovals.createdAt,
        })
        .from(schema.billApprovals)
        .leftJoin(schema.users, eq(schema.billApprovals.approvedById, schema.users.id))
        .where(eq(schema.billApprovals.billId, billId))
        .orderBy(desc(schema.billApprovals.createdAt));

      return approvals.map(approval => ({
        id: approval.id,
        billId: approval.billId,
        approvedById: approval.approvedById,
        status: approval.status,
        comments: approval.comments,
        createdAt: approval.createdAt,
      })) as BillApproval[];
    } catch (error) {
      console.error("Database error in getBillApprovals:", error);
      throw error;
    }
  }

  async createBillApproval(approval: InsertBillApproval): Promise<BillApproval> {
    try {
      const [newApproval] = await db.insert(schema.billApprovals)
        .values(approval)
        .returning();
      return newApproval;
    } catch (error) {
      console.error("Database error in createBillApproval:", error);
      throw error;
    }
  }

  async canUserApproveBills(userId: string): Promise<boolean> {
    try {
      const user = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user.length || !user[0].roleId) {
        return false;
      }

      const billsApprovePermission = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'bills.approve'))
        .limit(1);

      if (!billsApprovePermission.length) {
        return false;
      }

      const rolePermission = await db.select()
        .from(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, user[0].roleId),
            eq(schema.rolePermissions.permissionId, billsApprovePermission[0].id)
          )
        )
        .limit(1);

      if (!rolePermission.length) {
        return false;
      }

      const allowedActions = rolePermission[0].allowedActions as string[];
      return allowedActions && allowedActions.includes('approve');
    } catch (error) {
      console.error("Database error in canUserApproveBills:", error);
      return false;
    }
  }

  async canUserApproveTimesheets(userId: string): Promise<boolean> {
    try {
      const user = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user.length || !user[0].roleId) {
        return false;
      }

      const role = await db.select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.id, user[0].roleId))
        .limit(1);

      if (role.length) {
        const roleName = role[0].name?.toLowerCase() || '';
        const isAdminRole = 
          roleName.includes('admin') || 
          roleName.includes('general manage') || 
          roleName.includes('owner') ||
          roleName === 'general manager';
        if (isAdminRole) {
          return true;
        }
      }

      const timesheetsApprovePermission = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'timesheets.approve'))
        .limit(1);

      if (!timesheetsApprovePermission.length) {
        return false;
      }

      const rolePermission = await db.select()
        .from(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, user[0].roleId),
            eq(schema.rolePermissions.permissionId, timesheetsApprovePermission[0].id)
          )
        )
        .limit(1);

      if (!rolePermission.length) {
        return false;
      }

      const allowedActions = rolePermission[0].allowedActions as string[];
      return allowedActions && allowedActions.includes('approve');
    } catch (error) {
      console.error("Database error in canUserApproveTimesheets:", error);
      return false;
    }
  }

  // Variations CRUD operations
  async getVariations(projectId?: string, status?: string): Promise<Variation[]> {
    try {
      let query = db.select().from(schema.variations);
      const conditions = [];
      
      if (projectId) {
        conditions.push(eq(schema.variations.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.variations.status, status as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return await query.orderBy(desc(schema.variations.createdAt));
    } catch (error) {
      console.error("Database error in getVariations:", error);
      throw error;
    }
  }

  async getVariation(id: string): Promise<Variation | undefined> {
    try {
      const result = await db.select()
        .from(schema.variations)
        .where(eq(schema.variations.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getVariation:", error);
      return undefined;
    }
  }

  async createVariation(variation: InsertVariation): Promise<Variation> {
    try {
      const result = await db.insert(schema.variations)
        .values(variation)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createVariation:", error);
      throw error;
    }
  }

  async updateVariation(id: string, variation: Partial<InsertVariation>): Promise<Variation | undefined> {
    try {
      const result = await db.update(schema.variations)
        .set({ ...variation, updatedAt: new Date() })
        .where(eq(schema.variations.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateVariation:", error);
      throw error;
    }
  }

  async deleteVariation(id: string): Promise<boolean> {
    try {
      await db.delete(schema.variations)
        .where(eq(schema.variations.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteVariation:", error);
      return false;
    }
  }

  // Variation Items CRUD operations
  async getVariationItems(variationId: string): Promise<VariationItem[]> {
    try {
      return await db.select()
        .from(schema.variationItems)
        .where(eq(schema.variationItems.variationId, variationId))
        .orderBy(schema.variationItems.sortOrder);
    } catch (error) {
      console.error("Database error in getVariationItems:", error);
      throw error;
    }
  }

  async createVariationItem(item: InsertVariationItem): Promise<VariationItem> {
    try {
      const result = await db.insert(schema.variationItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createVariationItem:", error);
      throw error;
    }
  }

  async updateVariationItem(id: string, item: Partial<InsertVariationItem>): Promise<VariationItem | undefined> {
    try {
      const result = await db.update(schema.variationItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.variationItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateVariationItem:", error);
      throw error;
    }
  }

  async deleteVariationItem(id: string): Promise<boolean> {
    try {
      await db.delete(schema.variationItems)
        .where(eq(schema.variationItems.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteVariationItem:", error);
      return false;
    }
  }

  // Client Invoices CRUD
  async getClientInvoices(projectId?: string, status?: string): Promise<ClientInvoice[]> {
    try {
      let query = db.select().from(schema.clientInvoices);
      const conditions = [];
      
      if (projectId) {
        conditions.push(eq(schema.clientInvoices.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.clientInvoices.status, status as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return await query;
    } catch (error) {
      console.error("Database error in getClientInvoices:", error);
      throw error;
    }
  }

  async getClientInvoice(id: string): Promise<ClientInvoice | undefined> {
    try {
      const result = await db.select()
        .from(schema.clientInvoices)
        .where(eq(schema.clientInvoices.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getClientInvoice:", error);
      return undefined;
    }
  }

  async createClientInvoice(invoice: InsertClientInvoice): Promise<ClientInvoice> {
    try {
      const result = await db.insert(schema.clientInvoices)
        .values(invoice)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createClientInvoice:", error);
      throw error;
    }
  }

  async updateClientInvoice(id: string, invoice: Partial<InsertClientInvoice>): Promise<ClientInvoice | undefined> {
    try {
      const result = await db.update(schema.clientInvoices)
        .set(invoice)
        .where(eq(schema.clientInvoices.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateClientInvoice:", error);
      return undefined;
    }
  }

  async deleteClientInvoice(id: string): Promise<boolean> {
    try {
      await db.delete(schema.clientInvoices)
        .where(eq(schema.clientInvoices.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteClientInvoice:", error);
      return false;
    }
  }

  // Client Invoice Items CRUD
  async getClientInvoiceItems(invoiceId: string): Promise<ClientInvoiceItem[]> {
    try {
      return await db.select()
        .from(schema.clientInvoiceItems)
        .where(eq(schema.clientInvoiceItems.invoiceId, invoiceId))
        .orderBy(schema.clientInvoiceItems.sortOrder);
    } catch (error) {
      console.error("Database error in getClientInvoiceItems:", error);
      throw error;
    }
  }

  async createClientInvoiceItem(item: InsertClientInvoiceItem): Promise<ClientInvoiceItem> {
    try {
      const result = await db.insert(schema.clientInvoiceItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createClientInvoiceItem:", error);
      throw error;
    }
  }

  async updateClientInvoiceItem(id: string, item: Partial<InsertClientInvoiceItem>): Promise<ClientInvoiceItem | undefined> {
    try {
      const result = await db.update(schema.clientInvoiceItems)
        .set(item)
        .where(eq(schema.clientInvoiceItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateClientInvoiceItem:", error);
      return undefined;
    }
  }

  async deleteClientInvoiceItem(id: string): Promise<boolean> {
    try {
      await db.delete(schema.clientInvoiceItems)
        .where(eq(schema.clientInvoiceItems.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteClientInvoiceItem:", error);
      return false;
    }
  }

  // Client Invoice Payments CRUD
  async getClientInvoicePayments(invoiceId: string): Promise<ClientInvoicePayment[]> {
    try {
      return await db.select()
        .from(schema.clientInvoicePayments)
        .where(eq(schema.clientInvoicePayments.invoiceId, invoiceId))
        .orderBy(desc(schema.clientInvoicePayments.paymentDate));
    } catch (error) {
      console.error("Database error in getClientInvoicePayments:", error);
      throw error;
    }
  }

  async createClientInvoicePayment(payment: InsertClientInvoicePayment): Promise<ClientInvoicePayment> {
    try {
      const result = await db.insert(schema.clientInvoicePayments)
        .values(payment)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createClientInvoicePayment:", error);
      throw error;
    }
  }

  async deleteClientInvoicePayment(id: string): Promise<boolean> {
    try {
      await db.delete(schema.clientInvoicePayments)
        .where(eq(schema.clientInvoicePayments.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteClientInvoicePayment:", error);
      return false;
    }
  }

  // Invoice-Estimate Junction Table
  async getInvoiceEstimates(invoiceId: string): Promise<InvoiceEstimate[]> {
    try {
      return await db.select()
        .from(schema.invoiceEstimates)
        .where(eq(schema.invoiceEstimates.invoiceId, invoiceId));
    } catch (error) {
      console.error("Database error in getInvoiceEstimates:", error);
      throw error;
    }
  }

  async createInvoiceEstimate(data: InsertInvoiceEstimate): Promise<InvoiceEstimate> {
    try {
      const result = await db.insert(schema.invoiceEstimates)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceEstimate:", error);
      throw error;
    }
  }

  async deleteInvoiceEstimate(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceEstimates)
        .where(eq(schema.invoiceEstimates.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceEstimate:", error);
      return false;
    }
  }

  // Invoice-Variation Junction Table
  async getInvoiceVariations(invoiceId: string): Promise<InvoiceVariation[]> {
    try {
      return await db.select()
        .from(schema.invoiceVariations)
        .where(eq(schema.invoiceVariations.invoiceId, invoiceId));
    } catch (error) {
      console.error("Database error in getInvoiceVariations:", error);
      throw error;
    }
  }

  async createInvoiceVariation(data: InsertInvoiceVariation): Promise<InvoiceVariation> {
    try {
      const result = await db.insert(schema.invoiceVariations)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceVariation:", error);
      throw error;
    }
  }

  async deleteInvoiceVariation(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceVariations)
        .where(eq(schema.invoiceVariations.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceVariation:", error);
      return false;
    }
  }

  // Invoice-Bill Junction Table
  async getInvoiceBills(invoiceId: string): Promise<InvoiceBill[]> {
    try {
      return await db.select()
        .from(schema.invoiceBills)
        .where(eq(schema.invoiceBills.invoiceId, invoiceId));
    } catch (error) {
      console.error("Database error in getInvoiceBills:", error);
      throw error;
    }
  }

  async createInvoiceBill(data: InsertInvoiceBill): Promise<InvoiceBill> {
    try {
      const result = await db.insert(schema.invoiceBills)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceBill:", error);
      throw error;
    }
  }

  async deleteInvoiceBill(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceBills)
        .where(eq(schema.invoiceBills.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceBill:", error);
      return false;
    }
  }

  // Proposals CRUD operations
  async getProposals(projectId?: string, status?: string): Promise<Proposal[]> {
    try {
      let query = db.select().from(schema.proposals);

      const conditions = [];
      if (projectId) {
        conditions.push(eq(schema.proposals.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.proposals.status, status));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      return await query.orderBy(desc(schema.proposals.createdAt));
    } catch (error) {
      console.error("Database error in getProposals:", error);
      throw error;
    }
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    try {
      const result = await db.select()
        .from(schema.proposals)
        .where(eq(schema.proposals.id, id));
      return result[0];
    } catch (error) {
      console.error("Database error in getProposal:", error);
      throw error;
    }
  }

  async createProposal(proposal: InsertProposal): Promise<Proposal> {
    try {
      const result = await db.insert(schema.proposals)
        .values(proposal)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createProposal:", error);
      throw error;
    }
  }

  async updateProposal(id: string, proposal: Partial<InsertProposal>): Promise<Proposal | undefined> {
    try {
      const result = await db.update(schema.proposals)
        .set({ ...proposal, updatedAt: new Date() })
        .where(eq(schema.proposals.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateProposal:", error);
      throw error;
    }
  }

  async deleteProposal(id: string): Promise<boolean> {
    try {
      await db.delete(schema.proposals)
        .where(eq(schema.proposals.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteProposal:", error);
      return false;
    }
  }

  // Proposal Sections CRUD operations
  async getProposalSections(proposalId: string): Promise<ProposalSection[]> {
    try {
      return await db.select()
        .from(schema.proposalSections)
        .where(eq(schema.proposalSections.proposalId, proposalId))
        .orderBy(schema.proposalSections.order);
    } catch (error) {
      console.error("Database error in getProposalSections:", error);
      throw error;
    }
  }

  async createProposalSection(section: InsertProposalSection): Promise<ProposalSection> {
    try {
      const result = await db.insert(schema.proposalSections)
        .values(section)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createProposalSection:", error);
      throw error;
    }
  }

  async updateProposalSection(id: string, section: Partial<InsertProposalSection>): Promise<ProposalSection | undefined> {
    try {
      const result = await db.update(schema.proposalSections)
        .set({ ...section, updatedAt: new Date() })
        .where(eq(schema.proposalSections.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateProposalSection:", error);
      throw error;
    }
  }

  async deleteProposalSection(id: string): Promise<boolean> {
    try {
      await db.delete(schema.proposalSections)
        .where(eq(schema.proposalSections.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteProposalSection:", error);
      return false;
    }
  }

  // Proposal Items CRUD operations
  async getProposalItems(proposalId: string): Promise<ProposalItem[]> {
    try {
      return await db.select()
        .from(schema.proposalItems)
        .where(eq(schema.proposalItems.proposalId, proposalId))
        .orderBy(schema.proposalItems.order);
    } catch (error) {
      console.error("Database error in getProposalItems:", error);
      throw error;
    }
  }

  async createProposalItem(item: InsertProposalItem): Promise<ProposalItem> {
    try {
      const result = await db.insert(schema.proposalItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createProposalItem:", error);
      throw error;
    }
  }

  async updateProposalItem(id: string, item: Partial<InsertProposalItem>): Promise<ProposalItem | undefined> {
    try {
      const result = await db.update(schema.proposalItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.proposalItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateProposalItem:", error);
      throw error;
    }
  }

  async deleteProposalItem(id: string): Promise<boolean> {
    try {
      await db.delete(schema.proposalItems)
        .where(eq(schema.proposalItems.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteProposalItem:", error);
      return false;
    }
  }

  // Proposal Acceptances CRUD operations
  async getProposalAcceptances(proposalId: string): Promise<ProposalAcceptance[]> {
    try {
      return await db.select()
        .from(schema.proposalAcceptances)
        .where(eq(schema.proposalAcceptances.proposalId, proposalId))
        .orderBy(desc(schema.proposalAcceptances.signedAt));
    } catch (error) {
      console.error("Database error in getProposalAcceptances:", error);
      throw error;
    }
  }

  async createProposalAcceptance(acceptance: InsertProposalAcceptance): Promise<ProposalAcceptance> {
    try {
      const result = await db.insert(schema.proposalAcceptances)
        .values(acceptance)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createProposalAcceptance:", error);
      throw error;
    }
  }

  async getLatestProposalAcceptance(proposalId: string): Promise<ProposalAcceptance | undefined> {
    try {
      const result = await db.select()
        .from(schema.proposalAcceptances)
        .where(eq(schema.proposalAcceptances.proposalId, proposalId))
        .orderBy(desc(schema.proposalAcceptances.signedAt))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getLatestProposalAcceptance:", error);
      throw error;
    }
  }

  // Activity Feed CRUD
  async getActivities(options: { projectId?: string; userId?: string; companyId?: string; limit?: number }): Promise<schema.Activity[]> {
    try {
      const { projectId, userId, companyId, limit = 50 } = options;
      const conditions: any[] = [];
      
      if (projectId) {
        conditions.push(eq(schema.activities.projectId, projectId));
      }
      
      if (userId) {
        conditions.push(eq(schema.activities.userId, userId));
      }
      
      if (companyId) {
        conditions.push(eq(schema.activities.companyId, companyId));
      }
      
      // Sort by pinned first (desc so pinned=true comes first), then by pinnedAt (most recent pinned first), then by createdAt
      return await db.select()
        .from(schema.activities)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(
          desc(schema.activities.pinned),
          desc(schema.activities.pinnedAt),
          desc(schema.activities.createdAt)
        )
        .limit(limit);
    } catch (error) {
      console.error("Database error in getActivities:", error);
      throw error;
    }
  }

  async createActivity(activity: schema.InsertActivity): Promise<schema.Activity> {
    try {
      // Ensure metadata has a consistent structure with changes array
      const activityWithMetadata = {
        ...activity,
        metadata: activity.metadata ?? { changes: [] }
      };
      const result = await db.insert(schema.activities)
        .values(activityWithMetadata)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createActivity:", error);
      throw error;
    }
  }

  async updateActivity(id: string, activity: Partial<schema.InsertActivity & { pinned?: boolean; pinnedAt?: Date; pinnedBy?: string }>): Promise<schema.Activity | undefined> {
    try {
      const result = await db.update(schema.activities)
        .set(activity)
        .where(eq(schema.activities.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateActivity:", error);
      throw error;
    }
  }

  // Site Diary Templates CRUD
  async getSiteDiaryTemplates(): Promise<schema.SiteDiaryTemplate[]> {
    try {
      return await db.select()
        .from(schema.siteDiaryTemplates)
        .where(eq(schema.siteDiaryTemplates.isArchived, false))
        .orderBy(desc(schema.siteDiaryTemplates.updatedAt));
    } catch (error) {
      console.error("Database error in getSiteDiaryTemplates:", error);
      throw error;
    }
  }

  async getSiteDiaryTemplate(id: string): Promise<schema.SiteDiaryTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.siteDiaryTemplates)
        .where(eq(schema.siteDiaryTemplates.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getSiteDiaryTemplate:", error);
      throw error;
    }
  }

  async getDefaultSiteDiaryTemplate(companyId: string): Promise<schema.SiteDiaryTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.siteDiaryTemplates)
        .where(
          and(
            eq(schema.siteDiaryTemplates.companyId, companyId),
            eq(schema.siteDiaryTemplates.isDefault, true),
            eq(schema.siteDiaryTemplates.isArchived, false)
          )
        )
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getDefaultSiteDiaryTemplate:", error);
      throw error;
    }
  }

  async setDefaultSiteDiaryTemplate(id: string, companyId: string): Promise<schema.SiteDiaryTemplate | undefined> {
    try {
      // First unset any existing default for this company
      await db.update(schema.siteDiaryTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.siteDiaryTemplates.companyId, companyId),
            eq(schema.siteDiaryTemplates.isDefault, true)
          )
        );
      
      // Then set the new default and update companyId
      const result = await db.update(schema.siteDiaryTemplates)
        .set({ isDefault: true, companyId, updatedAt: new Date() })
        .where(eq(schema.siteDiaryTemplates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in setDefaultSiteDiaryTemplate:", error);
      throw error;
    }
  }

  async createSiteDiaryTemplate(template: schema.InsertSiteDiaryTemplate): Promise<schema.SiteDiaryTemplate> {
    try {
      const result = await db.insert(schema.siteDiaryTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createSiteDiaryTemplate:", error);
      throw error;
    }
  }

  async updateSiteDiaryTemplate(id: string, template: Partial<schema.InsertSiteDiaryTemplate>): Promise<schema.SiteDiaryTemplate | undefined> {
    try {
      const result = await db.update(schema.siteDiaryTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(eq(schema.siteDiaryTemplates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateSiteDiaryTemplate:", error);
      throw error;
    }
  }

  async deleteSiteDiaryTemplate(id: string): Promise<boolean> {
    try {
      // Soft delete by archiving
      const result = await db.update(schema.siteDiaryTemplates)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(schema.siteDiaryTemplates.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteSiteDiaryTemplate:", error);
      throw error;
    }
  }

  // Site Diary Entries CRUD
  async getSiteDiaryEntries(projectId: string): Promise<schema.SiteDiaryEntry[]> {
    try {
      return await db.select()
        .from(schema.siteDiaryEntries)
        .where(eq(schema.siteDiaryEntries.projectId, projectId))
        .orderBy(desc(schema.siteDiaryEntries.entryDateTime));
    } catch (error) {
      console.error("Database error in getSiteDiaryEntries:", error);
      throw error;
    }
  }

  async getSiteDiaryEntriesByCompany(companyId: string, date?: string): Promise<schema.SiteDiaryEntry[]> {
    try {
      const conditions = [eq(schema.projects.companyId, companyId)];
      if (date) {
        conditions.push(sql`DATE(${schema.siteDiaryEntries.entryDateTime}) = ${date}` as any);
      }
      const rows = await db.select({
        entry: schema.siteDiaryEntries,
      })
        .from(schema.siteDiaryEntries)
        .innerJoin(schema.projects, eq(schema.siteDiaryEntries.projectId, schema.projects.id))
        .where(and(...conditions))
        .orderBy(desc(schema.siteDiaryEntries.entryDateTime));
      return rows.map(r => r.entry);
    } catch (error) {
      console.error("Database error in getSiteDiaryEntriesByCompany:", error);
      throw error;
    }
  }

  async getSiteDiaryEntryCountsByMonth(companyId: string, year: number, month: number): Promise<Record<string, number>> {
    try {
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${endMonth.toString().padStart(2, '0')}-01`;

      const rows = await db.select({
        dateStr: sql<string>`DATE(${schema.siteDiaryEntries.entryDateTime})`.as('date_str'),
        count: sql<number>`COUNT(*)`.as('count'),
      })
        .from(schema.siteDiaryEntries)
        .innerJoin(schema.projects, eq(schema.siteDiaryEntries.projectId, schema.projects.id))
        .where(and(
          eq(schema.projects.companyId, companyId),
          sql`${schema.siteDiaryEntries.entryDateTime} >= ${startDate}::date`,
          sql`${schema.siteDiaryEntries.entryDateTime} < ${endDate}::date`,
        ))
        .groupBy(sql`DATE(${schema.siteDiaryEntries.entryDateTime})`);

      const counts: Record<string, number> = {};
      rows.forEach(r => {
        counts[String(r.dateStr)] = Number(r.count);
      });
      return counts;
    } catch (error) {
      console.error("Database error in getSiteDiaryEntryCountsByMonth:", error);
      throw error;
    }
  }

  async getSiteDiaryEntry(id: string): Promise<schema.SiteDiaryEntry | undefined> {
    try {
      const result = await db.select()
        .from(schema.siteDiaryEntries)
        .where(eq(schema.siteDiaryEntries.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getSiteDiaryEntry:", error);
      throw error;
    }
  }

  async createSiteDiaryEntry(entry: schema.InsertSiteDiaryEntry): Promise<schema.SiteDiaryEntry> {
    try {
      const result = await db.insert(schema.siteDiaryEntries)
        .values(entry)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createSiteDiaryEntry:", error);
      throw error;
    }
  }

  async updateSiteDiaryEntry(id: string, entry: Partial<schema.InsertSiteDiaryEntry>): Promise<schema.SiteDiaryEntry | undefined> {
    try {
      const result = await db.update(schema.siteDiaryEntries)
        .set({ ...entry, updatedAt: new Date() })
        .where(eq(schema.siteDiaryEntries.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateSiteDiaryEntry:", error);
      throw error;
    }
  }

  async deleteSiteDiaryEntry(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.siteDiaryEntries)
        .where(eq(schema.siteDiaryEntries.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteSiteDiaryEntry:", error);
      throw error;
    }
  }

  // Checklist Templates CRUD
  async getChecklistTemplates(): Promise<ChecklistTemplate[]> {
    try {
      return await db.select()
        .from(schema.checklistTemplates)
        .where(eq(schema.checklistTemplates.isArchived, false))
        .orderBy(desc(schema.checklistTemplates.createdAt));
    } catch (error) {
      console.error("Database error in getChecklistTemplates:", error);
      throw error;
    }
  }

  async getChecklistTemplate(id: string): Promise<ChecklistTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistTemplates)
        .where(eq(schema.checklistTemplates.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistTemplate:", error);
      throw error;
    }
  }

  async createChecklistTemplate(template: InsertChecklistTemplate): Promise<ChecklistTemplate> {
    try {
      const result = await db.insert(schema.checklistTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistTemplate:", error);
      throw error;
    }
  }

  async updateChecklistTemplate(id: string, template: Partial<InsertChecklistTemplate>): Promise<ChecklistTemplate | undefined> {
    try {
      const result = await db.update(schema.checklistTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(eq(schema.checklistTemplates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistTemplate:", error);
      throw error;
    }
  }

  async deleteChecklistTemplate(id: string): Promise<boolean> {
    try {
      // Soft delete by archiving
      const result = await db.update(schema.checklistTemplates)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(schema.checklistTemplates.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistTemplate:", error);
      throw error;
    }
  }

  async hardDeleteChecklistTemplate(id: string): Promise<boolean> {
    try {
      // Hard delete - physically removes the row
      // Groups and items will cascade delete due to onDelete: cascade in schema
      const result = await db.delete(schema.checklistTemplates)
        .where(eq(schema.checklistTemplates.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in hardDeleteChecklistTemplate:", error);
      throw error;
    }
  }

  // Checklist Template Groups CRUD
  async getChecklistTemplateGroups(templateId: string): Promise<ChecklistTemplateGroup[]> {
    try {
      return await db.select()
        .from(schema.checklistTemplateGroups)
        .where(eq(schema.checklistTemplateGroups.templateId, templateId))
        .orderBy(schema.checklistTemplateGroups.order);
    } catch (error) {
      console.error("Database error in getChecklistTemplateGroups:", error);
      throw error;
    }
  }

  async getChecklistTemplateGroup(id: string): Promise<ChecklistTemplateGroup | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistTemplateGroups)
        .where(eq(schema.checklistTemplateGroups.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistTemplateGroup:", error);
      throw error;
    }
  }

  async createChecklistTemplateGroup(group: InsertChecklistTemplateGroup): Promise<ChecklistTemplateGroup> {
    try {
      const result = await db.insert(schema.checklistTemplateGroups)
        .values(group)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistTemplateGroup:", error);
      throw error;
    }
  }

  async updateChecklistTemplateGroup(id: string, group: Partial<InsertChecklistTemplateGroup>): Promise<ChecklistTemplateGroup | undefined> {
    try {
      const result = await db.update(schema.checklistTemplateGroups)
        .set({ ...group, updatedAt: new Date() })
        .where(eq(schema.checklistTemplateGroups.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistTemplateGroup:", error);
      throw error;
    }
  }

  async deleteChecklistTemplateGroup(id: string): Promise<boolean> {
    try {
      // Hard delete since cascade will handle items
      const result = await db.delete(schema.checklistTemplateGroups)
        .where(eq(schema.checklistTemplateGroups.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistTemplateGroup:", error);
      throw error;
    }
  }

  // Checklist Template Items CRUD
  async getChecklistTemplateItems(groupId: string): Promise<ChecklistTemplateItem[]> {
    try {
      return await db.select()
        .from(schema.checklistTemplateItems)
        .where(eq(schema.checklistTemplateItems.groupId, groupId))
        .orderBy(schema.checklistTemplateItems.order);
    } catch (error) {
      console.error("Database error in getChecklistTemplateItems:", error);
      throw error;
    }
  }

  async getChecklistTemplateItem(id: string): Promise<ChecklistTemplateItem | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistTemplateItems)
        .where(eq(schema.checklistTemplateItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistTemplateItem:", error);
      throw error;
    }
  }

  async createChecklistTemplateItem(item: InsertChecklistTemplateItem): Promise<ChecklistTemplateItem> {
    try {
      const result = await db.insert(schema.checklistTemplateItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistTemplateItem:", error);
      throw error;
    }
  }

  async updateChecklistTemplateItem(id: string, item: Partial<InsertChecklistTemplateItem>): Promise<ChecklistTemplateItem | undefined> {
    try {
      const result = await db.update(schema.checklistTemplateItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.checklistTemplateItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistTemplateItem:", error);
      throw error;
    }
  }

  async deleteChecklistTemplateItem(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.checklistTemplateItems)
        .where(eq(schema.checklistTemplateItems.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistTemplateItem:", error);
      throw error;
    }
  }

  // Checklist Instances CRUD
  async getChecklistInstances(projectId?: string): Promise<ChecklistInstance[]> {
    try {
      if (projectId) {
        return await db.select()
          .from(schema.checklistInstances)
          .where(eq(schema.checklistInstances.projectId, projectId))
          .orderBy(desc(schema.checklistInstances.createdAt));
      }
      return await db.select()
        .from(schema.checklistInstances)
        .orderBy(desc(schema.checklistInstances.createdAt));
    } catch (error) {
      console.error("Database error in getChecklistInstances:", error);
      throw error;
    }
  }

  async getChecklistInstance(id: string): Promise<ChecklistInstance | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistInstances)
        .where(eq(schema.checklistInstances.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistInstance:", error);
      throw error;
    }
  }

  async createChecklistInstance(instance: InsertChecklistInstance): Promise<ChecklistInstance> {
    try {
      const result = await db.insert(schema.checklistInstances)
        .values(instance)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistInstance:", error);
      throw error;
    }
  }

  async updateChecklistInstance(id: string, instance: Partial<InsertChecklistInstance>): Promise<ChecklistInstance | undefined> {
    try {
      const result = await db.update(schema.checklistInstances)
        .set({ ...instance, updatedAt: new Date() })
        .where(eq(schema.checklistInstances.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistInstance:", error);
      throw error;
    }
  }

  async deleteChecklistInstance(id: string): Promise<boolean> {
    try {
      // First delete all items
      await db.delete(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.instanceId, id));
      // Delete all groups
      await db.delete(schema.checklistInstanceGroups)
        .where(eq(schema.checklistInstanceGroups.instanceId, id));
      // Then delete the instance
      const result = await db.delete(schema.checklistInstances)
        .where(eq(schema.checklistInstances.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistInstance:", error);
      throw error;
    }
  }

  // Checklist Instance Groups CRUD (these are "Checklists" in user terminology)
  async getChecklistInstanceGroups(instanceId: string): Promise<ChecklistInstanceGroup[]> {
    try {
      return await db.select()
        .from(schema.checklistInstanceGroups)
        .where(eq(schema.checklistInstanceGroups.instanceId, instanceId))
        .orderBy(schema.checklistInstanceGroups.order);
    } catch (error) {
      console.error("Database error in getChecklistInstanceGroups:", error);
      throw error;
    }
  }

  async getChecklistInstanceGroup(id: string): Promise<ChecklistInstanceGroup | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistInstanceGroups)
        .where(eq(schema.checklistInstanceGroups.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistInstanceGroup:", error);
      throw error;
    }
  }

  async createChecklistInstanceGroup(group: InsertChecklistInstanceGroup): Promise<ChecklistInstanceGroup> {
    try {
      const result = await db.insert(schema.checklistInstanceGroups)
        .values(group)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistInstanceGroup:", error);
      throw error;
    }
  }

  async updateChecklistInstanceGroup(id: string, group: Partial<InsertChecklistInstanceGroup>): Promise<ChecklistInstanceGroup | undefined> {
    try {
      const result = await db.update(schema.checklistInstanceGroups)
        .set({ ...group, updatedAt: new Date() })
        .where(eq(schema.checklistInstanceGroups.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistInstanceGroup:", error);
      throw error;
    }
  }

  async deleteChecklistInstanceGroup(id: string): Promise<boolean> {
    try {
      // First delete all items in this group
      await db.delete(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.groupId, id));
      // Then delete the group
      const result = await db.delete(schema.checklistInstanceGroups)
        .where(eq(schema.checklistInstanceGroups.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistInstanceGroup:", error);
      throw error;
    }
  }

  // Checklist Instance Items CRUD
  async getChecklistInstanceItems(instanceId: string): Promise<ChecklistInstanceItem[]> {
    try {
      return await db.select()
        .from(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.instanceId, instanceId))
        .orderBy(schema.checklistInstanceItems.groupOrder, schema.checklistInstanceItems.order);
    } catch (error) {
      console.error("Database error in getChecklistInstanceItems:", error);
      throw error;
    }
  }

  async getChecklistInstanceItemsByGroup(groupId: string): Promise<ChecklistInstanceItem[]> {
    try {
      return await db.select()
        .from(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.groupId, groupId))
        .orderBy(schema.checklistInstanceItems.order);
    } catch (error) {
      console.error("Database error in getChecklistInstanceItemsByGroup:", error);
      throw error;
    }
  }

  async getChecklistInstanceItem(id: string): Promise<ChecklistInstanceItem | undefined> {
    try {
      const result = await db.select()
        .from(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getChecklistInstanceItem:", error);
      throw error;
    }
  }

  async createChecklistInstanceItem(item: InsertChecklistInstanceItem): Promise<ChecklistInstanceItem> {
    try {
      const result = await db.insert(schema.checklistInstanceItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createChecklistInstanceItem:", error);
      throw error;
    }
  }

  async updateChecklistInstanceItem(id: string, item: Partial<InsertChecklistInstanceItem>): Promise<ChecklistInstanceItem | undefined> {
    try {
      const result = await db.update(schema.checklistInstanceItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.checklistInstanceItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateChecklistInstanceItem:", error);
      throw error;
    }
  }

  async deleteChecklistInstanceItem(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.checklistInstanceItems)
        .where(eq(schema.checklistInstanceItems.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistInstanceItem:", error);
      throw error;
    }
  }

  async createChecklistAuditEntry(entry: InsertChecklistAuditLog): Promise<ChecklistAuditLog> {
    try {
      const [result] = await db.insert(schema.checklistAuditLog)
        .values(entry)
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in createChecklistAuditEntry:", error);
      throw error;
    }
  }

  async getChecklistAuditLog(instanceId: string): Promise<ChecklistAuditLog[]> {
    try {
      return await db.select()
        .from(schema.checklistAuditLog)
        .where(eq(schema.checklistAuditLog.instanceId, instanceId))
        .orderBy(desc(schema.checklistAuditLog.createdAt));
    } catch (error) {
      console.error("Database error in getChecklistAuditLog:", error);
      throw error;
    }
  }

  async getChecklistStatusTriggers(companyId: string): Promise<ChecklistStatusTrigger[]> {
    try {
      return await db.select()
        .from(schema.checklistStatusTriggers)
        .where(eq(schema.checklistStatusTriggers.companyId, companyId))
        .orderBy(desc(schema.checklistStatusTriggers.createdAt));
    } catch (error) {
      console.error("Database error in getChecklistStatusTriggers:", error);
      throw error;
    }
  }

  async createChecklistStatusTrigger(trigger: InsertChecklistStatusTrigger): Promise<ChecklistStatusTrigger> {
    try {
      const [result] = await db.insert(schema.checklistStatusTriggers)
        .values(trigger)
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in createChecklistStatusTrigger:", error);
      throw error;
    }
  }

  async updateChecklistStatusTrigger(id: string, trigger: Partial<InsertChecklistStatusTrigger>): Promise<ChecklistStatusTrigger | undefined> {
    try {
      const [result] = await db.update(schema.checklistStatusTriggers)
        .set({ ...trigger, updatedAt: new Date() })
        .where(eq(schema.checklistStatusTriggers.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in updateChecklistStatusTrigger:", error);
      throw error;
    }
  }

  async deleteChecklistStatusTrigger(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.checklistStatusTriggers)
        .where(eq(schema.checklistStatusTriggers.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteChecklistStatusTrigger:", error);
      throw error;
    }
  }

  // Budget CRUD
  async getBudget(projectId: string): Promise<Budget | undefined> {
    try {
      const result = await db.select()
        .from(schema.budgets)
        .where(eq(schema.budgets.projectId, projectId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getBudget:", error);
      throw error;
    }
  }

  async createBudget(budget: InsertBudget): Promise<Budget> {
    try {
      const result = await db.insert(schema.budgets)
        .values(budget)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createBudget:", error);
      throw error;
    }
  }

  async updateBudget(id: string, budget: Partial<InsertBudget>): Promise<Budget | undefined> {
    try {
      const result = await db.update(schema.budgets)
        .set({ ...budget, updatedAt: new Date() })
        .where(eq(schema.budgets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateBudget:", error);
      throw error;
    }
  }

  async deleteBudget(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.budgets)
        .where(eq(schema.budgets.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteBudget:", error);
      throw error;
    }
  }

  async calculateBudget(projectId: string): Promise<Budget | undefined> {
    try {
      // Get or create budget for this project
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

      // Calculate baseline from estimates
      const estimates = await db.select()
        .from(schema.estimates)
        .where(eq(schema.estimates.projectId, projectId));
      
      const estimateItems = estimates.length > 0 ? await db.select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.estimateId, estimates[0].id)) : [];

      const baselineAmount = estimateItems.reduce((sum, item) => sum + (item.priceIncTax || 0), 0);

      // Calculate actual from bills
      const bills = await db.select()
        .from(schema.bills)
        .where(eq(schema.bills.projectId, projectId));
      
      const actualAmount = bills.reduce((sum, bill) => {
        const amount = bill.total || 0;
        return sum + (bill.billType === 'credit' ? -amount : amount);
      }, 0);

      // Calculate variations
      const variations = await db.select()
        .from(schema.variations)
        .where(and(
          eq(schema.variations.projectId, projectId),
          eq(schema.variations.status, "approved")
        ));
      
      const variationAmount = variations.reduce((sum, v) => sum + (v.totalAmount || 0), 0);

      const revisedAmount = baselineAmount + variationAmount;
      const forecastAmount = actualAmount + (revisedAmount - actualAmount); // Simple forecast
      const varianceAmount = revisedAmount - forecastAmount;
      const profitPercent = revisedAmount > 0 ? Math.round(((revisedAmount - forecastAmount) / revisedAmount) * 100) : 0;

      // Update budget
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
  async getBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]> {
    try {
      return await db.select()
        .from(schema.budgetLineItems)
        .where(eq(schema.budgetLineItems.budgetId, budgetId))
        .orderBy(schema.budgetLineItems.sortOrder);
    } catch (error) {
      console.error("Database error in getBudgetLineItems:", error);
      throw error;
    }
  }

  async getBudgetLineItem(id: string): Promise<BudgetLineItem | undefined> {
    try {
      const result = await db.select()
        .from(schema.budgetLineItems)
        .where(eq(schema.budgetLineItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getBudgetLineItem:", error);
      throw error;
    }
  }

  async createBudgetLineItem(item: InsertBudgetLineItem): Promise<BudgetLineItem> {
    try {
      const result = await db.insert(schema.budgetLineItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createBudgetLineItem:", error);
      throw error;
    }
  }

  async updateBudgetLineItem(id: string, item: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem | undefined> {
    try {
      const result = await db.update(schema.budgetLineItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.budgetLineItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateBudgetLineItem:", error);
      throw error;
    }
  }

  async deleteBudgetLineItem(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.budgetLineItems)
        .where(eq(schema.budgetLineItems.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteBudgetLineItem:", error);
      throw error;
    }
  }

  async recalculateBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]> {
    try {
      // Get the budget
      const budgetResult = await db.select()
        .from(schema.budgets)
        .where(eq(schema.budgets.id, budgetId))
        .limit(1);
      
      if (!budgetResult[0]) {
        throw new Error("Budget not found");
      }

      const budget = budgetResult[0];
      const projectId = budget.projectId;

      // Get all cost codes
      const costCodes = await db.select()
        .from(schema.costCodes)
        .where(eq(schema.costCodes.isActive, true));

      // Get estimates for this project
      const estimates = await db.select()
        .from(schema.estimates)
        .where(eq(schema.estimates.projectId, projectId));

      const estimateItems = estimates.length > 0 ? await db.select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.estimateId, estimates[0].id)) : [];

      // Get bills for this project
      const bills = await db.select()
        .from(schema.bills)
        .where(eq(schema.bills.projectId, projectId));

      const billIds = bills.map(b => b.id);
      const billLineItems = billIds.length > 0 ? await db.select()
        .from(schema.billLineItems)
        .where(schema.billLineItems.billId) : [];

      // Group by cost code
      const costCodeMap = new Map<string, {
        budgeted: number;
        actual: number;
        costCodeTitle: string;
        categoryTitle: string;
      }>();

      // Calculate budgeted amounts from estimates
      for (const item of estimateItems) {
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

      // Calculate actual amounts from bills
      for (const billItem of billLineItems) {
        const costCode = costCodes.find(cc => cc.id === billItem.costCodeId);
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

      // Delete existing line items
      await db.delete(schema.budgetLineItems)
        .where(eq(schema.budgetLineItems.budgetId, budgetId));

      // Create new line items
      const lineItems: BudgetLineItem[] = [];
      let sortOrder = 0;

      for (const [costCodeKey, data] of costCodeMap.entries()) {
        const costCode = costCodes.find(cc => cc.code === costCodeKey);
        const forecast = data.actual + Math.max(0, data.budgeted - data.actual);
        const variance = data.budgeted - forecast;
        const variancePercent = data.budgeted > 0 ? Math.round((variance / data.budgeted) * 100) : 0;

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
  async getLabourHoursBudget(projectId: string): Promise<LabourHoursBudget[]> {
    try {
      const result = await db.select()
        .from(schema.labourHoursBudget)
        .where(eq(schema.labourHoursBudget.projectId, projectId))
        .orderBy(schema.labourHoursBudget.sortOrder);
      return result;
    } catch (error) {
      console.error("Database error in getLabourHoursBudget:", error);
      throw error;
    }
  }

  async recalculateLabourHoursBudget(projectId: string): Promise<LabourHoursBudget[]> {
    try {
      // Get project's company for scoping cost codes
      const projectRows = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
      if (!projectRows[0] || !projectRows[0].companyId) {
        return [];
      }
      const companyId = projectRows[0].companyId;

      const costCodes = await db.select()
        .from(schema.costCodes)
        .where(and(
          eq(schema.costCodes.isActive, true),
          eq(schema.costCodes.companyId, companyId)
        ));

      // Build cost code lookup by ID for fast matching
      const costCodeById = new Map(costCodes.map(cc => [cc.id, cc]));

      // Initialize costCodeMap with ALL active cost codes (so they all appear in budget)
      const costCodeMap = new Map<string, {
        budgetedHours: number;
        costCodeTitle: string;
        categoryTitle: string;
        costCodeId: string | null;
      }>();

      for (const cc of costCodes) {
        costCodeMap.set(cc.id, {
          budgetedHours: 0,
          costCodeTitle: cc.title,
          categoryTitle: "General",
          costCodeId: cc.id
        });
      }

      // Get estimates for this project
      const estimates = await db.select()
        .from(schema.estimates)
        .where(eq(schema.estimates.projectId, projectId));

      // Get labour estimate items (case-insensitive type check, no trackLabourHours filter)
      const estimateItems = estimates.length > 0 ? await db.select()
        .from(schema.estimateItems)
        .where(
          and(
            eq(schema.estimateItems.estimateId, estimates[0].id),
            sql`LOWER(${schema.estimateItems.type}) = 'labour'`
          )
        ) : [];

      // Calculate budgeted hours from labour estimate items, grouped by cost code ID
      for (const item of estimateItems) {
        const costCodeId = item.costCode || null;
        const mapKey = costCodeId || "uncategorized";
        const cc = costCodeId ? costCodeById.get(costCodeId) : null;

        const existing = costCodeMap.get(mapKey) || {
          budgetedHours: 0,
          costCodeTitle: cc?.title || "Uncategorized",
          categoryTitle: "General",
          costCodeId: costCodeId
        };

        existing.budgetedHours += item.quantity || 0;

        costCodeMap.set(mapKey, existing);
      }

      // Get timesheets for this project
      const timesheets = await db.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.projectId, projectId));

      // Get timesheet cost code splits
      const timesheetIds = timesheets.map(t => t.id);
      const timesheetCostCodes = timesheetIds.length > 0 ? await db.select()
        .from(schema.timesheetCostCodes)
        .where(inArray(schema.timesheetCostCodes.timesheetId, timesheetIds)) : [];

      // Track which timesheets are covered by the join table
      const timesheetsWithSplits = new Set(timesheetCostCodes.map(tcc => tcc.timesheetId));

      // Map pending and approved hours by cost code ID
      const pendingHoursMap = new Map<string, number>();
      const approvedHoursMap = new Map<string, number>();

      // Helper to add hours to the correct map
      const addHours = (mapKey: string, duration: number, status: string, costCodeId: string | null) => {
        if (status === "submitted") {
          pendingHoursMap.set(mapKey, (pendingHoursMap.get(mapKey) || 0) + duration);
        } else if (status === "approved") {
          approvedHoursMap.set(mapKey, (approvedHoursMap.get(mapKey) || 0) + duration);
        }
        if (!costCodeMap.has(mapKey)) {
          const cc = costCodeId ? costCodeById.get(costCodeId) : null;
          costCodeMap.set(mapKey, {
            budgetedHours: 0,
            costCodeTitle: cc?.title || "Uncategorized",
            categoryTitle: "General",
            costCodeId: costCodeId
          });
        }
      };

      // Process hours from join table splits
      for (const split of timesheetCostCodes) {
        const timesheet = timesheets.find(t => t.id === split.timesheetId);
        if (!timesheet) continue;

        const duration = parseFloat(split.duration);
        const mapKey = split.costCodeId || "uncategorized";
        addHours(mapKey, duration, timesheet.status, split.costCodeId);
      }

      // Process timesheets NOT in the join table (cost code stored directly on timesheet)
      for (const ts of timesheets) {
        if (timesheetsWithSplits.has(ts.id)) continue;
        const duration = parseFloat(ts.duration || "0");
        if (duration <= 0) continue;

        const mapKey = ts.costCodeId || "uncategorized";
        addHours(mapKey, duration, ts.status, ts.costCodeId);
      }

      // Delete existing labour hours budget for this project
      await db.delete(schema.labourHoursBudget)
        .where(eq(schema.labourHoursBudget.projectId, projectId));

      // Build all rows and batch insert
      let sortOrder = 0;
      const valuesToInsert = [];

      for (const [mapKey, data] of costCodeMap.entries()) {
        const pendingHours = pendingHoursMap.get(mapKey) || 0;
        const approvedHours = approvedHoursMap.get(mapKey) || 0;

        valuesToInsert.push({
          projectId,
          costCodeId: data.costCodeId,
          costCodeTitle: data.costCodeTitle,
          categoryTitle: data.categoryTitle,
          budgetedHours: data.budgetedHours.toString(),
          pendingHours: pendingHours.toString(),
          approvedHours: approvedHours.toString(),
          sortOrder: sortOrder++
        });
      }

      if (valuesToInsert.length === 0) return [];

      const labourHoursBudget = await db.insert(schema.labourHoursBudget)
        .values(valuesToInsert)
        .returning();

      return labourHoursBudget;
    } catch (error) {
      console.error("Database error in recalculateLabourHoursBudget:", error);
      throw error;
    }
  }

  // Timesheets CRUD
  async getTimesheets(projectId?: string, filters?: { userId?: string; startDate?: Date; endDate?: Date; status?: string; costCodeId?: string; invoiced?: boolean }): Promise<Timesheet[]> {
    try {
      let query = db.select().from(schema.timesheets);
      
      const conditions: any[] = [];
      if (projectId) conditions.push(eq(schema.timesheets.projectId, projectId));
      if (filters?.userId) conditions.push(eq(schema.timesheets.userId, filters.userId));
      if (filters?.status) conditions.push(eq(schema.timesheets.status, filters.status as any));
      if (filters?.invoiced !== undefined) conditions.push(eq(schema.timesheets.invoiced, filters.invoiced));
      if (filters?.startDate) conditions.push(gte(schema.timesheets.date, filters.startDate));
      if (filters?.endDate) conditions.push(lte(schema.timesheets.date, filters.endDate));
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const result = await query.orderBy(desc(schema.timesheets.date));
      return result;
    } catch (error) {
      console.error("Database error in getTimesheets:", error);
      throw error;
    }
  }

  async getTimesheet(id: string): Promise<Timesheet | undefined> {
    try {
      const result = await db.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getTimesheet:", error);
      throw error;
    }
  }

  async createTimesheet(timesheet: InsertTimesheet): Promise<Timesheet> {
    try {
      const result = await db.insert(schema.timesheets)
        .values(timesheet)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTimesheet:", error);
      throw error;
    }
  }

  async updateTimesheet(id: string, timesheet: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    try {
      const { actualStartTime, actualEndTime, ...safeFields } = timesheet as any;
      const result = await db.update(schema.timesheets)
        .set({ ...safeFields, updatedAt: new Date() })
        .where(eq(schema.timesheets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTimesheet:", error);
      throw error;
    }
  }

  async deleteTimesheet(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.timesheets)
        .where(eq(schema.timesheets.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteTimesheet:", error);
      throw error;
    }
  }

  async approveTimesheet(id: string): Promise<Timesheet | undefined> {
    try {
      const result = await db.update(schema.timesheets)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(schema.timesheets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in approveTimesheet:", error);
      throw error;
    }
  }

  async rejectTimesheet(id: string): Promise<Timesheet | undefined> {
    try {
      const result = await db.update(schema.timesheets)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(schema.timesheets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in rejectTimesheet:", error);
      throw error;
    }
  }

  // Timesheet Cost Codes
  async getTimesheetCostCodes(timesheetId: string): Promise<TimesheetCostCode[]> {
    try {
      const result = await db.select()
        .from(schema.timesheetCostCodes)
        .where(eq(schema.timesheetCostCodes.timesheetId, timesheetId));
      return result;
    } catch (error) {
      console.error("Database error in getTimesheetCostCodes:", error);
      throw error;
    }
  }

  async createTimesheetCostCode(costCode: InsertTimesheetCostCode): Promise<TimesheetCostCode> {
    try {
      const result = await db.insert(schema.timesheetCostCodes)
        .values(costCode)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTimesheetCostCode:", error);
      throw error;
    }
  }

  async updateTimesheetCostCode(id: string, costCode: Partial<InsertTimesheetCostCode>): Promise<TimesheetCostCode | undefined> {
    try {
      const result = await db.update(schema.timesheetCostCodes)
        .set({ ...costCode, updatedAt: new Date() })
        .where(eq(schema.timesheetCostCodes.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTimesheetCostCode:", error);
      throw error;
    }
  }

  async deleteTimesheetCostCode(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.timesheetCostCodes)
        .where(eq(schema.timesheetCostCodes.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteTimesheetCostCode:", error);
      throw error;
    }
  }

  // Clock-in/out methods
  async getActiveTimesheet(userId: string): Promise<Timesheet | undefined> {
    try {
      const result = await db.select()
        .from(schema.timesheets)
        .where(and(
          eq(schema.timesheets.userId, userId),
          eq(schema.timesheets.isActive, true)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getActiveTimesheet:", error);
      throw error;
    }
  }

  async getAllActiveTimesheets(): Promise<Timesheet[]> {
    try {
      const result = await db.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.isActive, true));
      return result;
    } catch (error) {
      console.error("Database error in getAllActiveTimesheets:", error);
      throw error;
    }
  }

  async clockIn(projectId: string, userId: string, costCodeId?: string): Promise<Timesheet> {
    try {
      // First, clock out any existing active timesheet
      const activeTimesheet = await this.getActiveTimesheet(userId);
      if (activeTimesheet) {
        await this.clockOut(activeTimesheet.id, userId);
      }

      // Create new active timesheet
      const now = new Date();
      const startTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const newTimesheet = await db.insert(schema.timesheets)
        .values({
          projectId,
          userId,
          date: now,
          startTime,
          actualStartTime: startTime,
          isActive: true,
          clockInTime: now,
          costCodeId: costCodeId || null,
          status: "submitted",
          duration: "0",
          breakDuration: "0",
          hourlyRate: "0",
          total: "0",
          invoiced: false,
        })
        .returning();
      
      return newTimesheet[0];
    } catch (error) {
      console.error("Database error in clockIn:", error);
      throw error;
    }
  }

  async clockOut(timesheetId: string, userId: string): Promise<Timesheet | undefined> {
    try {
      const timesheet = await this.getTimesheet(timesheetId);
      if (!timesheet) {
        return undefined;
      }

      // Verify ownership
      if (timesheet.userId !== userId) {
        throw new Error("Unauthorized: Cannot clock out another user's timesheet");
      }

      if (!timesheet.isActive) {
        return timesheet;
      }

      const now = new Date();
      const endTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      // Calculate duration in hours
      let duration = 0;
      if (timesheet.clockInTime) {
        const diffMs = now.getTime() - new Date(timesheet.clockInTime).getTime();
        duration = diffMs / (1000 * 60 * 60); // Convert to hours
      }

      const result = await db.update(schema.timesheets)
        .set({
          endTime,
          actualEndTime: endTime,
          duration: duration.toFixed(2),
          isActive: false,
          updatedAt: now,
        })
        .where(and(
          eq(schema.timesheets.id, timesheetId),
          eq(schema.timesheets.userId, userId)
        ))
        .returning();
      
      return result[0];
    } catch (error) {
      console.error("Database error in clockOut:", error);
      throw error;
    }
  }

  // Schedule CRUD
  async getSchedule(projectId: string): Promise<Schedule | undefined> {
    try {
      const result = await db.select()
        .from(schema.schedules)
        .where(eq(schema.schedules.projectId, projectId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getSchedule:", error);
      throw error;
    }
  }

  async getScheduleById(id: string): Promise<Schedule | undefined> {
    try {
      const result = await db.select()
        .from(schema.schedules)
        .where(eq(schema.schedules.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getScheduleById:", error);
      throw error;
    }
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    try {
      const result = await db.insert(schema.schedules)
        .values(schedule)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createSchedule:", error);
      throw error;
    }
  }

  async updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    try {
      const result = await db.update(schema.schedules)
        .set({ ...schedule, updatedAt: new Date() })
        .where(eq(schema.schedules.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateSchedule:", error);
      throw error;
    }
  }

  async deleteSchedule(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.schedules)
        .where(eq(schema.schedules.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteSchedule:", error);
      throw error;
    }
  }

  async updateScheduleStatus(id: string, status: "offline" | "online" | "locked", userId?: string): Promise<Schedule | undefined> {
    try {
      const updates: any = { status, updatedAt: new Date() };
      if (status === "locked" && userId) {
        // Get user name for lockedByName
        const user = await db.select()
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        
        updates.lockedBy = userId;
        if (user[0]) {
          const firstName = user[0].firstName || '';
          const lastName = user[0].lastName || '';
          updates.lockedByName = `${firstName} ${lastName}`.trim() || user[0].username || null;
        } else {
          updates.lockedByName = null;
        }
        updates.lockedAt = new Date();
      } else if (status !== "locked") {
        updates.lockedBy = null;
        updates.lockedByName = null;
        updates.lockedAt = null;
      }
      const result = await db.update(schema.schedules)
        .set(updates)
        .where(eq(schema.schedules.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateScheduleStatus:", error);
      throw error;
    }
  }

  // Schedule Items CRUD
  async getScheduleItems(scheduleId: string): Promise<ScheduleItem[]> {
    try {
      return await db.select()
        .from(schema.scheduleItems)
        .where(eq(schema.scheduleItems.scheduleId, scheduleId))
        .orderBy(schema.scheduleItems.startDate, schema.scheduleItems.sortOrder);
    } catch (error) {
      console.error("Database error in getScheduleItems:", error);
      throw error;
    }
  }

  async getScheduleItemsByProject(projectId: string, pagination?: { limit?: number; offset?: number }): Promise<ScheduleItem[]> {
    try {
      let query = db.select()
        .from(schema.scheduleItems)
        .innerJoin(schema.schedules, eq(schema.scheduleItems.scheduleId, schema.schedules.id))
        .where(eq(schema.schedules.projectId, projectId))
        .orderBy(schema.scheduleItems.startDate, schema.scheduleItems.sortOrder);
      
      // Apply pagination if provided
      if (pagination?.limit !== undefined) {
        query = query.limit(pagination.limit) as typeof query;
      }
      if (pagination?.offset !== undefined) {
        query = query.offset(pagination.offset) as typeof query;
      }
      
      const items = await query;
      return items.map(item => item.schedule_items);
    } catch (error) {
      console.error("Database error in getScheduleItemsByProject:", error);
      throw error;
    }
  }

  async getAllScheduleItems(companyId: string, dateRange?: { startDate?: string; endDate?: string }): Promise<ScheduleItem[]> {
    try {
      const conditions = [eq(schema.projects.companyId, companyId)];
      
      // Add date range filtering if provided
      if (dateRange?.startDate) {
        conditions.push(gte(schema.scheduleItems.endDate, new Date(dateRange.startDate)));
      }
      if (dateRange?.endDate) {
        conditions.push(lte(schema.scheduleItems.startDate, new Date(dateRange.endDate)));
      }
      
      const items = await db.select()
        .from(schema.scheduleItems)
        .innerJoin(schema.schedules, eq(schema.scheduleItems.scheduleId, schema.schedules.id))
        .innerJoin(schema.projects, eq(schema.schedules.projectId, schema.projects.id))
        .where(and(...conditions))
        .orderBy(schema.scheduleItems.startDate);
      return items.map(row => row.schedule_items);
    } catch (error) {
      console.error("Database error in getAllScheduleItems:", error);
      throw error;
    }
  }

  async getScheduleItem(id: string): Promise<ScheduleItem | undefined> {
    try {
      const result = await db.select()
        .from(schema.scheduleItems)
        .where(eq(schema.scheduleItems.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getScheduleItem:", error);
      throw error;
    }
  }

  async createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem> {
    try {
      const result = await db.insert(schema.scheduleItems)
        .values(item)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createScheduleItem:", error);
      throw error;
    }
  }

  async updateScheduleItem(id: string, item: Partial<InsertScheduleItem>): Promise<ScheduleItem | undefined> {
    try {
      const result = await db.update(schema.scheduleItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.scheduleItems.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateScheduleItem:", error);
      throw error;
    }
  }

  async deleteScheduleItem(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.scheduleItems)
        .where(eq(schema.scheduleItems.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteScheduleItem:", error);
      throw error;
    }
  }

  async bulkUpdateScheduleItems(items: { id: string; updates: Partial<InsertScheduleItem> }[]): Promise<ScheduleItem[]> {
    try {
      const results: ScheduleItem[] = [];
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
  async getScheduleTemplates(companyId: string, category?: string): Promise<ScheduleTemplate[]> {
    try {
      // Return templates from user's company OR public templates from any company
      const conditions = [
        eq(schema.scheduleTemplates.isArchived, false),
        or(
          eq(schema.scheduleTemplates.companyId, companyId),
          eq(schema.scheduleTemplates.isPublic, true)
        )
      ];
      
      if (category) {
        conditions.push(eq(schema.scheduleTemplates.category, category));
      }
      
      return await db.select()
        .from(schema.scheduleTemplates)
        .where(and(...conditions));
    } catch (error) {
      console.error("Database error in getScheduleTemplates:", error);
      throw error;
    }
  }

  async getScheduleTemplate(id: string, companyId: string): Promise<ScheduleTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.scheduleTemplates)
        .where(eq(schema.scheduleTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      // Only return if template belongs to company OR is public
      if (template && (template.companyId === companyId || template.isPublic)) {
        return template;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getScheduleTemplate:", error);
      throw error;
    }
  }

  async createScheduleTemplate(template: InsertScheduleTemplate): Promise<ScheduleTemplate> {
    try {
      const result = await db.insert(schema.scheduleTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createScheduleTemplate:", error);
      throw error;
    }
  }

  async updateScheduleTemplate(id: string, template: Partial<InsertScheduleTemplate>, companyId: string): Promise<ScheduleTemplate | undefined> {
    try {
      // Only update if template belongs to company
      const result = await db.update(schema.scheduleTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.scheduleTemplates.id, id),
          eq(schema.scheduleTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateScheduleTemplate:", error);
      throw error;
    }
  }

  async deleteScheduleTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      // Only delete if template belongs to company
      const result = await db.delete(schema.scheduleTemplates)
        .where(and(
          eq(schema.scheduleTemplates.id, id),
          eq(schema.scheduleTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteScheduleTemplate:", error);
      throw error;
    }
  }

  // Estimate Templates CRUD
  async getEstimateTemplates(companyId: string, category?: string): Promise<EstimateTemplate[]> {
    try {
      const conditions = [
        eq(schema.estimateTemplates.isArchived, false),
        or(
          eq(schema.estimateTemplates.companyId, companyId),
          eq(schema.estimateTemplates.isPublic, true)
        )
      ];
      
      if (category) {
        conditions.push(eq(schema.estimateTemplates.category, category));
      }
      
      return await db.select()
        .from(schema.estimateTemplates)
        .where(and(...conditions));
    } catch (error) {
      console.error("Database error in getEstimateTemplates:", error);
      throw error;
    }
  }

  async getEstimateTemplate(id: string, companyId: string): Promise<EstimateTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.estimateTemplates)
        .where(eq(schema.estimateTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      if (template && (template.companyId === companyId || template.isPublic)) {
        return template;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getEstimateTemplate:", error);
      throw error;
    }
  }

  async createEstimateTemplate(template: InsertEstimateTemplate): Promise<EstimateTemplate> {
    try {
      const result = await db.insert(schema.estimateTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createEstimateTemplate:", error);
      throw error;
    }
  }

  async updateEstimateTemplate(id: string, template: Partial<InsertEstimateTemplate>, companyId: string): Promise<EstimateTemplate | undefined> {
    try {
      const result = await db.update(schema.estimateTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.estimateTemplates.id, id),
          eq(schema.estimateTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimateTemplate:", error);
      throw error;
    }
  }

  async deleteEstimateTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.estimateTemplates)
        .where(and(
          eq(schema.estimateTemplates.id, id),
          eq(schema.estimateTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteEstimateTemplate:", error);
      throw error;
    }
  }

  // Selection Templates CRUD
  async getSelectionTemplates(companyId: string, category?: string): Promise<SelectionTemplate[]> {
    try {
      const conditions = [
        eq(schema.selectionTemplates.isArchived, false),
        or(
          eq(schema.selectionTemplates.companyId, companyId),
          eq(schema.selectionTemplates.isPublic, true)
        )
      ];
      
      if (category) {
        conditions.push(eq(schema.selectionTemplates.category, category));
      }
      
      return await db.select()
        .from(schema.selectionTemplates)
        .where(and(...conditions));
    } catch (error) {
      console.error("Database error in getSelectionTemplates:", error);
      throw error;
    }
  }

  async getSelectionTemplate(id: string, companyId: string): Promise<SelectionTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.selectionTemplates)
        .where(eq(schema.selectionTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      if (template && (template.companyId === companyId || template.isPublic)) {
        return template;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getSelectionTemplate:", error);
      throw error;
    }
  }

  async createSelectionTemplate(template: InsertSelectionTemplate): Promise<SelectionTemplate> {
    try {
      const result = await db.insert(schema.selectionTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createSelectionTemplate:", error);
      throw error;
    }
  }

  async updateSelectionTemplate(id: string, template: Partial<InsertSelectionTemplate>, companyId: string): Promise<SelectionTemplate | undefined> {
    try {
      const result = await db.update(schema.selectionTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.selectionTemplates.id, id),
          eq(schema.selectionTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateSelectionTemplate:", error);
      throw error;
    }
  }

  async deleteSelectionTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.selectionTemplates)
        .where(and(
          eq(schema.selectionTemplates.id, id),
          eq(schema.selectionTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteSelectionTemplate:", error);
      throw error;
    }
  }

  // RFQ Templates CRUD
  async getRfqTemplates(companyId: string, category?: string): Promise<RfqTemplate[]> {
    try {
      const conditions = [
        eq(schema.rfqTemplates.isArchived, false),
        or(
          eq(schema.rfqTemplates.companyId, companyId),
          eq(schema.rfqTemplates.isPublic, true)
        )
      ];
      
      if (category) {
        conditions.push(eq(schema.rfqTemplates.category, category));
      }
      
      return await db.select()
        .from(schema.rfqTemplates)
        .where(and(...conditions));
    } catch (error) {
      console.error("Database error in getRfqTemplates:", error);
      throw error;
    }
  }

  async getRfqTemplate(id: string, companyId: string): Promise<RfqTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.rfqTemplates)
        .where(eq(schema.rfqTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      if (template && (template.companyId === companyId || template.isPublic)) {
        return template;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getRfqTemplate:", error);
      throw error;
    }
  }

  async createRfqTemplate(template: InsertRfqTemplate & { companyId: string }): Promise<RfqTemplate> {
    try {
      const result = await db.insert(schema.rfqTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createRfqTemplate:", error);
      throw error;
    }
  }

  async updateRfqTemplate(id: string, template: Partial<InsertRfqTemplate>, companyId: string): Promise<RfqTemplate | undefined> {
    try {
      const result = await db.update(schema.rfqTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.rfqTemplates.id, id),
          eq(schema.rfqTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateRfqTemplate:", error);
      throw error;
    }
  }

  async deleteRfqTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.rfqTemplates)
        .where(and(
          eq(schema.rfqTemplates.id, id),
          eq(schema.rfqTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteRfqTemplate:", error);
      throw error;
    }
  }

  // RFI Templates CRUD
  async getRfiTemplates(companyId: string, category?: string): Promise<RfiTemplate[]> {
    try {
      const conditions = [
        eq(schema.rfiTemplates.isArchived, false),
        or(
          eq(schema.rfiTemplates.companyId, companyId),
          eq(schema.rfiTemplates.isPublic, true)
        )
      ];
      
      if (category) {
        conditions.push(eq(schema.rfiTemplates.category, category));
      }
      
      return await db.select()
        .from(schema.rfiTemplates)
        .where(and(...conditions));
    } catch (error) {
      console.error("Database error in getRfiTemplates:", error);
      throw error;
    }
  }

  async getRfiTemplate(id: string, companyId: string): Promise<RfiTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.rfiTemplates)
        .where(eq(schema.rfiTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      if (template && (template.companyId === companyId || template.isPublic)) {
        return template;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getRfiTemplate:", error);
      throw error;
    }
  }

  async createRfiTemplate(template: InsertRfiTemplate & { companyId: string }): Promise<RfiTemplate> {
    try {
      const result = await db.insert(schema.rfiTemplates)
        .values(template)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createRfiTemplate:", error);
      throw error;
    }
  }

  async updateRfiTemplate(id: string, template: Partial<InsertRfiTemplate>, companyId: string): Promise<RfiTemplate | undefined> {
    try {
      const result = await db.update(schema.rfiTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.rfiTemplates.id, id),
          eq(schema.rfiTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateRfiTemplate:", error);
      throw error;
    }
  }

  async deleteRfiTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.rfiTemplates)
        .where(and(
          eq(schema.rfiTemplates.id, id),
          eq(schema.rfiTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteRfiTemplate:", error);
      throw error;
    }
  }

  // Template Categories CRUD (hierarchical categories for organizing templates)
  async getTemplateCategories(companyId: string, templateType?: string): Promise<TemplateCategory[]> {
    try {
      const conditions = [
        eq(schema.templateCategories.companyId, companyId),
        eq(schema.templateCategories.isActive, true)
      ];
      
      if (templateType) {
        conditions.push(eq(schema.templateCategories.templateType, templateType));
      }
      
      return await db.select()
        .from(schema.templateCategories)
        .where(and(...conditions))
        .orderBy(asc(schema.templateCategories.sortOrder));
    } catch (error) {
      console.error("Database error in getTemplateCategories:", error);
      throw error;
    }
  }

  async getTemplateCategory(id: string, companyId: string): Promise<TemplateCategory | undefined> {
    try {
      const result = await db.select()
        .from(schema.templateCategories)
        .where(and(
          eq(schema.templateCategories.id, id),
          eq(schema.templateCategories.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getTemplateCategory:", error);
      throw error;
    }
  }

  async createTemplateCategory(category: InsertTemplateCategory & { companyId: string }): Promise<TemplateCategory> {
    try {
      const result = await db.insert(schema.templateCategories)
        .values(category)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createTemplateCategory:", error);
      throw error;
    }
  }

  async updateTemplateCategory(id: string, category: Partial<InsertTemplateCategory>, companyId: string): Promise<TemplateCategory | undefined> {
    try {
      const result = await db.update(schema.templateCategories)
        .set({ ...category, updatedAt: new Date() })
        .where(and(
          eq(schema.templateCategories.id, id),
          eq(schema.templateCategories.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateTemplateCategory:", error);
      throw error;
    }
  }

  async deleteTemplateCategory(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.templateCategories)
        .where(and(
          eq(schema.templateCategories.id, id),
          eq(schema.templateCategories.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteTemplateCategory:", error);
      throw error;
    }
  }

  // Calendar Views CRUD
  async getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]> {
    try {
      const ownViews = await db.select()
        .from(schema.calendarViews)
        .where(and(
          eq(schema.calendarViews.userId, userId),
          eq(schema.calendarViews.calendarType, calendarType),
          eq(schema.calendarViews.companyId, companyId),
          eq(schema.calendarViews.isArchived, false)
        ))
        .orderBy(asc(schema.calendarViews.sortOrder));

      if (calendarType === "business") {
        const allCompanyViews = await db.select()
          .from(schema.calendarViews)
          .where(and(
            eq(schema.calendarViews.calendarType, "business"),
            eq(schema.calendarViews.companyId, companyId),
            eq(schema.calendarViews.isArchived, false),
            not(eq(schema.calendarViews.userId, userId)),
          ))
          .orderBy(asc(schema.calendarViews.sortOrder));

        const sharedViews = allCompanyViews.filter(v => {
          const sharedWith = v.sharedWith as string[] | null;
          return sharedWith && Array.isArray(sharedWith) && sharedWith.includes(userId);
        });

        const ownIds = new Set(ownViews.map(v => v.id));
        const uniqueShared = sharedViews.filter(v => !ownIds.has(v.id));
        return [...ownViews, ...uniqueShared];
      }

      return ownViews;
    } catch (error) {
      console.error("Database error in getCalendarViews:", error);
      throw error;
    }
  }

  async getCalendarView(id: string, companyId: string): Promise<CalendarView | undefined> {
    try {
      const result = await db.select()
        .from(schema.calendarViews)
        .where(and(
          eq(schema.calendarViews.id, id),
          eq(schema.calendarViews.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getCalendarView:", error);
      throw error;
    }
  }

  async createCalendarView(view: InsertCalendarView): Promise<CalendarView> {
    try {
      const result = await db.insert(schema.calendarViews)
        .values(view)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createCalendarView:", error);
      throw error;
    }
  }

  async findOrCreateCalendarView(view: InsertCalendarView & { userId: string; companyId: string }): Promise<CalendarView> {
    try {
      const existing = await db.select()
        .from(schema.calendarViews)
        .where(and(
          eq(schema.calendarViews.userId, view.userId),
          eq(schema.calendarViews.companyId, view.companyId),
          eq(schema.calendarViews.calendarType, view.calendarType),
          eq(schema.calendarViews.name, view.name),
        ))
        .limit(1);
      if (existing.length > 0) return existing[0];
      try {
        const result = await db.insert(schema.calendarViews)
          .values(view)
          .returning();
        return result[0];
      } catch (insertError: any) {
        if (insertError.code === '23505') {
          const retry = await db.select()
            .from(schema.calendarViews)
            .where(and(
              eq(schema.calendarViews.userId, view.userId),
              eq(schema.calendarViews.companyId, view.companyId),
              eq(schema.calendarViews.calendarType, view.calendarType),
              eq(schema.calendarViews.name, view.name),
            ))
            .limit(1);
          if (retry.length > 0) return retry[0];
        }
        throw insertError;
      }
    } catch (error) {
      console.error("Database error in findOrCreateCalendarView:", error);
      throw error;
    }
  }

  async updateCalendarView(id: string, view: Partial<InsertCalendarView>, companyId: string): Promise<CalendarView | undefined> {
    try {
      const result = await db.update(schema.calendarViews)
        .set({ ...view, updatedAt: new Date() })
        .where(and(
          eq(schema.calendarViews.id, id),
          eq(schema.calendarViews.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateCalendarView:", error);
      throw error;
    }
  }

  async deleteCalendarView(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.calendarViews)
        .where(and(
          eq(schema.calendarViews.id, id),
          eq(schema.calendarViews.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteCalendarView:", error);
      throw error;
    }
  }

  // Activity Notes CRUD
  async getActivityNotes(scheduleItemId: string, limit: number = 10, offset: number = 0): Promise<ActivityNote[]> {
    try {
      return await db.select()
        .from(schema.activityNotes)
        .where(eq(schema.activityNotes.scheduleItemId, scheduleItemId))
        .orderBy(desc(schema.activityNotes.createdAt)) // Newest first
        .limit(limit)
        .offset(offset);
    } catch (error) {
      console.error("Database error in getActivityNotes:", error);
      throw error;
    }
  }

  async getActivityNoteCount(scheduleItemId: string): Promise<number> {
    try {
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(schema.activityNotes)
        .where(eq(schema.activityNotes.scheduleItemId, scheduleItemId));
      return Number(result[0]?.count || 0);
    } catch (error) {
      console.error("Database error in getActivityNoteCount:", error);
      throw error;
    }
  }

  async getBatchActivityNoteCounts(scheduleItemIds: string[]): Promise<Record<string, number>> {
    try {
      if (scheduleItemIds.length === 0) return {};
      
      const results = await db.select({
        scheduleItemId: schema.activityNotes.scheduleItemId,
        count: sql<number>`count(*)`
      })
        .from(schema.activityNotes)
        .where(inArray(schema.activityNotes.scheduleItemId, scheduleItemIds))
        .groupBy(schema.activityNotes.scheduleItemId);

      const counts: Record<string, number> = {};
      results.forEach(row => {
        counts[row.scheduleItemId] = Number(row.count);
      });
      
      // Initialize all requested IDs with 0 if they don't have notes
      scheduleItemIds.forEach(id => {
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

  async createActivityNote(note: InsertActivityNote): Promise<ActivityNote> {
    try {
      const result = await db.insert(schema.activityNotes)
        .values(note)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createActivityNote:", error);
      throw error;
    }
  }

  async updateActivityNote(id: string, note: Partial<InsertActivityNote>): Promise<ActivityNote | undefined> {
    try {
      const result = await db.update(schema.activityNotes)
        .set({ 
          ...note, 
          isEdited: true,
          editedAt: new Date()
        })
        .where(eq(schema.activityNotes.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateActivityNote:", error);
      throw error;
    }
  }

  async deleteActivityNote(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.activityNotes)
        .where(eq(schema.activityNotes.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteActivityNote:", error);
      throw error;
    }
  }

  async canEditActivityNote(noteId: string, userId: string): Promise<boolean> {
    try {
      const result = await db.select()
        .from(schema.activityNotes)
        .where(eq(schema.activityNotes.id, noteId))
        .limit(1);
      
      const note = result[0];
      if (!note || note.userId !== userId || note.type !== 'user') return false;
      
      // Check if within 5-minute edit window
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return new Date(note.createdAt) > fiveMinutesAgo;
    } catch (error) {
      console.error("Database error in canEditActivityNote:", error);
      throw error;
    }
  }

  // Defects CRUD
  async getDefects(projectId?: string, status?: string): Promise<Defect[]> {
    try {
      let query = db.select().from(schema.defects);
      const conditions = [];
      
      if (projectId) {
        conditions.push(eq(schema.defects.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.defects.status, status));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const defects = await query.orderBy(desc(schema.defects.dateIdentified));
      return defects as Defect[];
    } catch (error) {
      console.error("Database error in getDefects:", error);
      throw error;
    }
  }

  async getDefectById(id: string): Promise<Defect | null> {
    try {
      const result = await db.select()
        .from(schema.defects)
        .where(eq(schema.defects.id, id))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error("Database error in getDefectById:", error);
      throw error;
    }
  }

  async createDefect(defect: InsertDefect): Promise<Defect> {
    try {
      const result = await db.insert(schema.defects)
        .values(defect)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createDefect:", error);
      throw error;
    }
  }

  async updateDefect(id: string, defect: Partial<InsertDefect>): Promise<Defect> {
    try {
      const result = await db.update(schema.defects)
        .set({ ...defect, updatedAt: new Date() })
        .where(eq(schema.defects.id, id))
        .returning();
      
      if (result.length === 0) {
        throw new Error("Defect not found");
      }
      
      return result[0];
    } catch (error) {
      console.error("Database error in updateDefect:", error);
      throw error;
    }
  }

  async deleteDefect(id: string): Promise<void> {
    try {
      await db.delete(schema.defects)
        .where(eq(schema.defects.id, id));
    } catch (error) {
      console.error("Database error in deleteDefect:", error);
      throw error;
    }
  }

  // Minutes CRUD operations
  async getMinutes(projectId?: string): Promise<Minute[]> {
    try {
      let query = db.select().from(schema.minutes).orderBy(desc(schema.minutes.meetingDate));
      
      if (projectId) {
        query = query.where(eq(schema.minutes.projectId, projectId)) as any;
      }
      
      const minutes = await query;
      return minutes as Minute[];
    } catch (error) {
      console.error("Database error in getMinutes:", error);
      throw error;
    }
  }

  async getMinute(id: string): Promise<Minute | undefined> {
    try {
      const result = await db.select()
        .from(schema.minutes)
        .where(eq(schema.minutes.id, id));
      return result[0] as Minute | undefined;
    } catch (error) {
      console.error("Database error in getMinute:", error);
      throw error;
    }
  }

  async createMinute(minute: InsertMinute): Promise<Minute> {
    try {
      const result = await db.insert(schema.minutes)
        .values(minute)
        .returning();
      return result[0] as Minute;
    } catch (error) {
      console.error("Database error in createMinute:", error);
      throw error;
    }
  }

  async updateMinute(id: string, minute: Partial<InsertMinute>): Promise<Minute | undefined> {
    try {
      const result = await db.update(schema.minutes)
        .set({ ...minute, updatedAt: new Date() })
        .where(eq(schema.minutes.id, id))
        .returning();
      return result[0] as Minute | undefined;
    } catch (error) {
      console.error("Database error in updateMinute:", error);
      throw error;
    }
  }

  async deleteMinute(id: string): Promise<boolean> {
    try {
      await db.delete(schema.minutes)
        .where(eq(schema.minutes.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteMinute:", error);
      throw error;
    }
  }

  // ============================================================
  // SYSTEMS LIBRARY - Folders
  // ============================================================

  async getSystemFolders(companyId: string, parentId?: string | null): Promise<SystemFolder[]> {
    try {
      let query = db.select()
        .from(schema.systemFolders)
        .where(eq(schema.systemFolders.companyId, companyId))
        .orderBy(asc(schema.systemFolders.displayOrder));

      if (parentId === null) {
        query = query.where(sql`${schema.systemFolders.parentId} IS NULL`) as any;
      } else if (parentId) {
        query = query.where(eq(schema.systemFolders.parentId, parentId)) as any;
      }

      const folders = await query;
      return folders as SystemFolder[];
    } catch (error) {
      console.error("Database error in getSystemFolders:", error);
      throw error;
    }
  }

  async getSystemFolder(id: string, companyId: string): Promise<SystemFolder | undefined> {
    try {
      const result = await db.select()
        .from(schema.systemFolders)
        .where(and(
          eq(schema.systemFolders.id, id),
          eq(schema.systemFolders.companyId, companyId)
        ));
      return result[0] as SystemFolder | undefined;
    } catch (error) {
      console.error("Database error in getSystemFolder:", error);
      throw error;
    }
  }

  async createSystemFolder(folder: InsertSystemFolder & { companyId: string }): Promise<SystemFolder> {
    try {
      const result = await db.insert(schema.systemFolders)
        .values(folder)
        .returning();
      return result[0] as SystemFolder;
    } catch (error) {
      console.error("Database error in createSystemFolder:", error);
      throw error;
    }
  }

  async updateSystemFolder(id: string, folder: Partial<InsertSystemFolder>, companyId: string): Promise<SystemFolder | undefined> {
    try {
      const result = await db.update(schema.systemFolders)
        .set({ ...folder, updatedAt: new Date() })
        .where(and(
          eq(schema.systemFolders.id, id),
          eq(schema.systemFolders.companyId, companyId)
        ))
        .returning();
      return result[0] as SystemFolder | undefined;
    } catch (error) {
      console.error("Database error in updateSystemFolder:", error);
      throw error;
    }
  }

  async deleteSystemFolder(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.systemFolders)
        .where(and(
          eq(schema.systemFolders.id, id),
          eq(schema.systemFolders.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteSystemFolder:", error);
      throw error;
    }
  }

  async updateSystemFoldersOrder(updates: Array<{id: string, displayOrder: number}>, companyId: string): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.systemFolders)
          .set({ displayOrder: update.displayOrder })
          .where(and(
            eq(schema.systemFolders.id, update.id),
            eq(schema.systemFolders.companyId, companyId)
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

  async getSystemDocuments(companyId: string, folderId?: string | null): Promise<SystemDocument[]> {
    try {
      let query = db.select()
        .from(schema.systemDocuments)
        .where(eq(schema.systemDocuments.companyId, companyId))
        .orderBy(desc(schema.systemDocuments.createdAt));

      if (folderId !== undefined) {
        if (folderId === null) {
          query = query.where(sql`${schema.systemDocuments.folderId} IS NULL`) as any;
        } else {
          query = query.where(eq(schema.systemDocuments.folderId, folderId)) as any;
        }
      }

      const documents = await query;
      return documents as SystemDocument[];
    } catch (error) {
      console.error("Database error in getSystemDocuments:", error);
      throw error;
    }
  }

  async getSystemDocument(id: string, companyId: string): Promise<SystemDocument | undefined> {
    try {
      const result = await db.select()
        .from(schema.systemDocuments)
        .where(and(
          eq(schema.systemDocuments.id, id),
          eq(schema.systemDocuments.companyId, companyId)
        ));
      return result[0] as SystemDocument | undefined;
    } catch (error) {
      console.error("Database error in getSystemDocument:", error);
      throw error;
    }
  }

  async createSystemDocument(document: InsertSystemDocument & { companyId: string }): Promise<SystemDocument> {
    try {
      const result = await db.insert(schema.systemDocuments)
        .values(document)
        .returning();
      return result[0] as SystemDocument;
    } catch (error) {
      console.error("Database error in createSystemDocument:", error);
      throw error;
    }
  }

  async updateSystemDocument(id: string, document: Partial<InsertSystemDocument>, companyId: string): Promise<SystemDocument | undefined> {
    try {
      const result = await db.update(schema.systemDocuments)
        .set({ ...document, updatedAt: new Date() })
        .where(and(
          eq(schema.systemDocuments.id, id),
          eq(schema.systemDocuments.companyId, companyId)
        ))
        .returning();
      return result[0] as SystemDocument | undefined;
    } catch (error) {
      console.error("Database error in updateSystemDocument:", error);
      throw error;
    }
  }

  async deleteSystemDocument(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.systemDocuments)
        .where(and(
          eq(schema.systemDocuments.id, id),
          eq(schema.systemDocuments.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteSystemDocument:", error);
      throw error;
    }
  }

  async updateSystemDocumentsOrder(updates: Array<{id: string, displayOrder: number, folderId?: string | null}>, companyId: string): Promise<void> {
    try {
      for (const update of updates) {
        const updateData: any = { displayOrder: update.displayOrder };
        if (update.folderId !== undefined) {
          updateData.folderId = update.folderId;
        }
        await db.update(schema.systemDocuments)
          .set(updateData)
          .where(and(
            eq(schema.systemDocuments.id, update.id),
            eq(schema.systemDocuments.companyId, companyId)
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

  async getTaskTemplates(companyId: string, isActive?: boolean): Promise<TaskTemplate[]> {
    try {
      let query = db.select()
        .from(schema.taskTemplates)
        .where(eq(schema.taskTemplates.companyId, companyId))
        .orderBy(asc(schema.taskTemplates.title));

      if (isActive !== undefined) {
        query = query.where(eq(schema.taskTemplates.isActive, isActive)) as any;
      }

      const templates = await query;
      return templates as TaskTemplate[];
    } catch (error) {
      console.error("Database error in getTaskTemplates:", error);
      throw error;
    }
  }

  async getTaskTemplate(id: string, companyId: string): Promise<TaskTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.taskTemplates)
        .where(and(
          eq(schema.taskTemplates.id, id),
          eq(schema.taskTemplates.companyId, companyId)
        ));
      return result[0] as TaskTemplate | undefined;
    } catch (error) {
      console.error("Database error in getTaskTemplate:", error);
      throw error;
    }
  }

  async createTaskTemplate(template: InsertTaskTemplate & { companyId: string }): Promise<TaskTemplate> {
    try {
      // Populate assigneeUserName if assigneeUserId is provided (with company isolation)
      let assigneeUserName = null;
      if (template.assigneeUserId) {
        const user = await db.select()
          .from(schema.users)
          .where(and(
            eq(schema.users.id, template.assigneeUserId),
            eq(schema.users.companyId, template.companyId)
          ))
          .limit(1);
        if (user.length > 0) {
          assigneeUserName = `${user[0].firstName} ${user[0].lastName}`;
        }
      }

      const result = await db.insert(schema.taskTemplates)
        .values({
          ...template,
          assigneeUserName,
        })
        .returning();
      return result[0] as TaskTemplate;
    } catch (error) {
      console.error("Database error in createTaskTemplate:", error);
      throw error;
    }
  }

  async updateTaskTemplate(id: string, template: Partial<InsertTaskTemplate>, companyId: string): Promise<TaskTemplate | undefined> {
    try {
      // Populate assigneeUserName if assigneeUserId is provided (with company isolation)
      let assigneeUserName: string | null | undefined = undefined;
      if (template.assigneeUserId !== undefined) {
        if (template.assigneeUserId) {
          const user = await db.select()
            .from(schema.users)
            .where(and(
              eq(schema.users.id, template.assigneeUserId),
              eq(schema.users.companyId, companyId)
            ))
            .limit(1);
          if (user.length > 0) {
            assigneeUserName = `${user[0].firstName} ${user[0].lastName}`;
          }
        } else {
          assigneeUserName = null;
        }
      }

      const result = await db.update(schema.taskTemplates)
        .set({ 
          ...template, 
          ...(assigneeUserName !== undefined ? { assigneeUserName } : {}),
          updatedAt: new Date() 
        })
        .where(and(
          eq(schema.taskTemplates.id, id),
          eq(schema.taskTemplates.companyId, companyId)
        ))
        .returning();
      return result[0] as TaskTemplate | undefined;
    } catch (error) {
      console.error("Database error in updateTaskTemplate:", error);
      throw error;
    }
  }

  async deleteTaskTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.taskTemplates)
        .where(and(
          eq(schema.taskTemplates.id, id),
          eq(schema.taskTemplates.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteTaskTemplate:", error);
      throw error;
    }
  }

  async generateRecurringTasks(companyId: string): Promise<{ generated: number }> {
    try {
      // Get all active task templates with recurring enabled
      // Use isActive flag instead of statusId to work without status system
      const templates = await db.select()
        .from(schema.taskTemplates)
        .where(and(
          eq(schema.taskTemplates.companyId, companyId),
          eq(schema.taskTemplates.isActive, true),
          eq(schema.taskTemplates.isRecurringTemplate, true)
        ));

      if (templates.length === 0) {
        return { generated: 0 };
      }

      // Get existing tasks for this company (to avoid duplicates)
      const existingTasks = await db.select()
        .from(schema.notes)
        .where(and(
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, "task")
        ));

      // Build Set of existing task keys (templateId:assigneeId:occurrenceDate for role-based, templateId:occurrenceDate for unassigned)
      // Uses occurrenceDate (original scheduled date) for duplicate detection - this ensures moved tasks aren't duplicated
      const existingTaskKeys = new Set<string>();
      for (const task of existingTasks) {
        const taskData = task as any;
        if (taskData.templateId && (taskData.occurrenceDate || taskData.dueDate)) {
          // Include assigneeId in the key for per-user duplicate detection
          // Use occurrenceDate if available (for moved tasks), fallback to dueDate for legacy tasks
          const assigneeId = taskData.assigneeId || "unassigned";
          const occurrenceDate = taskData.occurrenceDate || taskData.dueDate;
          const dateStr = getRecurringTaskKey(taskData.templateId, occurrenceDate);
          const key = `${dateStr}:${assigneeId}`;
          existingTaskKeys.add(key);
        }
      }

      // Get all users for this company
      const allUsers = await db.select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.companyId, companyId),
            eq(schema.users.isActive, true)
          )
        );

      // Generate task instances for each template
      let generatedCount = 0;
      for (const template of templates) {
        const instances = generateRecurringTaskInstances(template as any);

        // Determine assignees for this template based on assigneeType
        let assignees: typeof allUsers = [];
        const templateData = template as any;
        
        if (templateData.assigneeType === 'user' && templateData.assigneeUserId) {
          // Direct user assignment - find the specific user
          const singleUser = allUsers.find(user => user.id === templateData.assigneeUserId);
          if (singleUser) assignees = [singleUser];
        } else if (templateData.assigneeType === 'role' && template.defaultRoleId) {
          // Role-based assignment: find all users with this role
          assignees = allUsers.filter(user => user.roleId === template.defaultRoleId);
        } else if (template.defaultRoleId) {
          // Legacy fallback: role-based assignment without assigneeType
          assignees = allUsers.filter(user => user.roleId === template.defaultRoleId);
        } else if (template.recurringAssigneeId) {
          // Legacy: single assignee (DEPRECATED)
          const singleUser = allUsers.find(user => user.id === template.recurringAssigneeId);
          if (singleUser) assignees = [singleUser];
        }

        // Create tasks from instances - one per assignee per instance
        // Use template's default task status if set, otherwise fallback to "todo"
        const defaultStatus = template.defaultTaskStatus || "todo";
        
        // Determine task context based on template scope
        const taskContextType = templateData.scope === "project" && templateData.projectId ? "project" : "business";
        const taskContextId = templateData.scope === "project" && templateData.projectId ? templateData.projectId : companyId;
        
        for (const instance of instances) {
          // Skip instances with invalid dates
          if (!instance.dueDate) {
            console.warn(`[generateRecurringTasks] Skipping instance with no dueDate for template ${template.id} (${template.name})`);
            continue;
          }
          
          const parsedDueDate = typeof instance.dueDate === 'string' ? new Date(instance.dueDate) : instance.dueDate;
          if (isNaN(parsedDueDate.getTime())) {
            console.warn(`[generateRecurringTasks] Skipping instance with invalid dueDate "${instance.dueDate}" for template ${template.id} (${template.name})`);
            continue;
          }
          
          if (assignees.length === 0) {
            // No assignees - create task without assignment
            const dateKey = getRecurringTaskKey(instance.templateId, instance.dueDate);
            const taskKey = `${dateKey}:unassigned`;
            
            // Skip if already exists for this unassigned instance
            if (!existingTaskKeys.has(taskKey)) {
              // Prepare checklist with fresh IDs for each task (reset completed state)
              const taskChecklist = instance.checklist?.map((item: any) => ({
                id: crypto.randomUUID(),
                text: item.text,
                completed: false,
              })) || [];
              
              const taskData: InsertNote = {
                title: instance.title,
                content: instance.content || "",
                author: "System", // Auto-generated by recurring template
                type: "task",
                priority: instance.priority as any,
                status: defaultStatus,
                assigneeId: undefined,
                assigneeName: undefined,
                dueDate: instance.dueDate,
                startTime: instance.startTime,
                endTime: instance.endTime,
                tags: [],
                labels: [],
                category: instance.category,
                templateId: instance.templateId,
                occurrenceDate: instance.dueDate, // Store original scheduled date for duplicate prevention
                companyId: companyId,
                checklist: taskChecklist,
                taskContextType,
                taskContextId,
              };

              await db.insert(schema.notes).values(taskData);
              existingTaskKeys.add(taskKey);
              generatedCount++;
            }
          } else {
            // Create one task per assignee
            for (const assignee of assignees) {
              const dateKey = getRecurringTaskKey(instance.templateId, instance.dueDate);
              const taskKey = `${dateKey}:${assignee.id}`;
              
              // Skip if already exists for this user+date combination
              if (!existingTaskKeys.has(taskKey)) {
                // Prepare checklist with fresh IDs for each task (reset completed state)
                const taskChecklist = instance.checklist?.map((item: any) => ({
                  id: crypto.randomUUID(),
                  text: item.text,
                  completed: false,
                })) || [];
                
                const taskData: InsertNote = {
                  title: instance.title,
                  content: instance.content || "",
                  author: "System",
                  type: "task",
                  priority: instance.priority as any,
                  status: defaultStatus,
                  assigneeId: assignee.id,
                  assigneeName: `${assignee.firstName} ${assignee.lastName}`,
                  dueDate: instance.dueDate,
                  startTime: instance.startTime,
                  endTime: instance.endTime,
                  tags: [],
                  labels: [],
                  category: instance.category,
                  templateId: instance.templateId,
                  occurrenceDate: instance.dueDate, // Store original scheduled date for duplicate prevention
                  companyId: companyId,
                  checklist: taskChecklist,
                  taskContextType,
                  taskContextId,
                };

                await db.insert(schema.notes).values(taskData);
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

  async clearAndRegenerateTemplateTask(templateId: string, companyId: string): Promise<{ deleted: number; generated: number }> {
    try {
      // First, delete all existing tasks for this template
      const deletedTasks = await db.delete(schema.notes)
        .where(and(
          eq(schema.notes.templateId, templateId),
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, "task")
        ))
        .returning();

      const deletedCount = deletedTasks.length;

      // Now regenerate tasks for this specific template
      const template = await this.getTaskTemplate(templateId, companyId);
      if (!template || !template.isRecurringTemplate) {
        return { deleted: deletedCount, generated: 0 };
      }

      // Get all users in the company for role-based assignment
      const allUsers = await db.select()
        .from(schema.users)
        .where(eq(schema.users.companyId, companyId));

      // Generate new task instances
      const instances = generateRecurringTaskInstances(template as any);

      // Determine assignees for this template based on assigneeType
      let assignees: typeof allUsers = [];
      const templateData = template as any;
      
      if (templateData.assigneeType === 'user' && templateData.assigneeUserId) {
        // Direct user assignment - find the specific user
        const singleUser = allUsers.find(user => user.id === templateData.assigneeUserId);
        if (singleUser) assignees = [singleUser];
      } else if (templateData.assigneeType === 'role' && template.defaultRoleId) {
        // Role-based assignment: find all users with this role
        assignees = allUsers.filter(user => user.roleId === template.defaultRoleId);
      } else if (template.defaultRoleId) {
        // Legacy fallback: role-based assignment without assigneeType
        assignees = allUsers.filter(user => user.roleId === template.defaultRoleId);
      }

      // Create tasks from instances
      let generatedCount = 0;
      
      // Determine task context based on template scope
      const taskContextType = templateData.scope === "project" && templateData.projectId ? "project" : "business";
      const taskContextId = templateData.scope === "project" && templateData.projectId ? templateData.projectId : companyId;
      
      for (const instance of instances) {
        // Use template's default task status if set, otherwise fallback to "todo"
        const defaultStatus = template.defaultTaskStatus || "todo";
        
        if (assignees.length === 0) {
          // No role-based assignees - preserve instance assigneeId (for legacy defaultAssigneeId support)
          // Prepare checklist with fresh IDs for each task (reset completed state)
          const taskChecklist = instance.checklist?.map((item: any) => ({
            id: crypto.randomUUID(),
            text: item.text,
            completed: false,
          })) || [];
          
          const taskData: InsertNote = {
            title: instance.title,
            content: instance.content || "",
            author: "System",
            type: "task",
            priority: instance.priority as any,
            status: defaultStatus,
            assigneeId: instance.assigneeId,
            assigneeName: instance.assigneeId ? allUsers.find(u => u.id === instance.assigneeId)?.firstName + " " + allUsers.find(u => u.id === instance.assigneeId)?.lastName : undefined,
            dueDate: instance.dueDate,
            startTime: instance.startTime,
            endTime: instance.endTime,
            tags: [],
            labels: [],
            category: instance.category,
            templateId: instance.templateId,
            companyId: companyId,
            checklist: taskChecklist,
            taskContextType,
            taskContextId,
          };

          await db.insert(schema.notes).values(taskData);
          generatedCount++;
        } else {
          // Create one task per assignee
          for (const assignee of assignees) {
            // Prepare checklist with fresh IDs for each task (reset completed state)
            const taskChecklist = instance.checklist?.map((item: any) => ({
              id: crypto.randomUUID(),
              text: item.text,
              completed: false,
            })) || [];
            
            const taskData: InsertNote = {
              title: instance.title,
              content: instance.content || "",
              author: "System",
              type: "task",
              priority: instance.priority as any,
              status: defaultStatus,
              assigneeId: assignee.id,
              assigneeName: `${assignee.firstName} ${assignee.lastName}`,
              dueDate: instance.dueDate,
              startTime: instance.startTime,
              endTime: instance.endTime,
              tags: [],
              labels: [],
              category: instance.category,
              templateId: instance.templateId,
              companyId: companyId,
              checklist: taskChecklist,
              taskContextType,
              taskContextId,
            };

            await db.insert(schema.notes).values(taskData);
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

  /**
   * Sync template changes to existing future uncompleted tasks
   * Updates tasks that were generated from this template but haven't been completed yet
   * Only syncs tasks with due dates >= today and status still in initial states
   */
  async syncTemplateToTasks(templateId: string, companyId: string): Promise<{ synced: number }> {
    try {
      const template = await this.getTaskTemplate(templateId, companyId);
      if (!template) {
        return { synced: 0 };
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Find all future, uncompleted tasks from this template
      // Only sync tasks that are in initial states (not modified by user)
      const initialStatuses = ['todo', 'backlog', template.defaultTaskStatus].filter(Boolean);
      
      const tasksToSync = await db.select()
        .from(schema.notes)
        .where(and(
          eq(schema.notes.templateId, templateId),
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, "task"),
          gte(schema.notes.dueDate, today)
        ));

      // Filter to only sync tasks that are still in initial status
      const eligibleTasks = tasksToSync.filter(task => 
        initialStatuses.includes(task.status || 'todo')
      );

      if (eligibleTasks.length === 0) {
        return { synced: 0 };
      }

      // Get all users for assignee name lookups
      const allUsers = await db.select()
        .from(schema.users)
        .where(eq(schema.users.companyId, companyId));

      // Determine new assignee based on template settings
      let newAssigneeId: string | null = null;
      let newAssigneeName: string | null = null;
      
      if (template.assigneeType === 'user' && template.assigneeUserId) {
        newAssigneeId = template.assigneeUserId;
        const user = allUsers.find(u => u.id === template.assigneeUserId);
        if (user) {
          newAssigneeName = `${user.firstName} ${user.lastName}`;
        }
      }

      // Prepare update data
      const updateData: any = {
        title: template.title,
        content: template.description || "",
        priority: template.priority,
        updatedAt: new Date(),
      };

      // Only update assignee if template uses direct user assignment (not role-based)
      // Role-based assignments should preserve the per-user task assignment
      if (template.assigneeType === 'user') {
        updateData.assigneeId = newAssigneeId;
        updateData.assigneeName = newAssigneeName;
      }

      // Update checklist - merge with existing to preserve completed state
      const templateChecklist = (template as any).checklist || [];
      
      let syncedCount = 0;
      for (const task of eligibleTasks) {
        // Merge checklist: keep completed state for matching items
        const existingChecklist = (task.checklist as any[]) || [];
        const mergedChecklist = templateChecklist.map((templateItem: any, index: number) => {
          // Try to find matching existing item by text or index
          const existingItem = existingChecklist.find(e => e.text === templateItem.text) 
            || existingChecklist[index];
          return {
            id: existingItem?.id || crypto.randomUUID(),
            text: templateItem.text,
            completed: existingItem?.completed || false, // Preserve completed state
          };
        });

        // Get time from schedule based on task's day of week
        const taskDueDate = task.dueDate ? new Date(task.dueDate) : null;
        const dayOfWeek = taskDueDate?.getDay();
        
        let startTime = undefined;
        let endTime = undefined;
        
        if (dayOfWeek !== undefined) {
          const schedule = (template.recurringSchedule as any[]) || [];
          const scheduleForDay = schedule.find(s => Number(s.dayOfWeek) === dayOfWeek);
          if (scheduleForDay) {
            startTime = scheduleForDay.startTime;
            if (scheduleForDay.duration > 0) {
              const [hours, minutes] = scheduleForDay.startTime.split(':').map(Number);
              const totalMinutes = hours * 60 + minutes + scheduleForDay.duration;
              const endHours = Math.floor(totalMinutes / 60) % 24;
              const endMinutes = totalMinutes % 60;
              endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
            }
          } else if ((template as any).dueTime) {
            // Use dueTime as the start time for operational tasks
            startTime = (template as any).dueTime;
            const duration = (template as any).estimatedDuration;
            if (duration && duration > 0) {
              const [hours, minutes] = startTime.split(':').map(Number);
              const totalMinutes = hours * 60 + minutes + duration;
              const endHours = Math.floor(totalMinutes / 60) % 24;
              const endMinutes = totalMinutes % 60;
              endTime = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
            }
          }
        }

        await db.update(schema.notes)
          .set({
            ...updateData,
            checklist: mergedChecklist,
            startTime: startTime !== undefined ? startTime : task.startTime,
            endTime: endTime !== undefined ? endTime : task.endTime,
          })
          .where(eq(schema.notes.id, task.id));
        
        syncedCount++;
      }

      return { synced: syncedCount };
    } catch (error) {
      console.error("Database error in syncTemplateToTasks:", error);
      throw error;
    }
  }

  async createNextRecurringTask(completedTask: Task, companyId: string): Promise<Task | null> {
    try {
      if (!completedTask.templateId || !completedTask.dueDate) return null;
      
      const template = await this.getTaskTemplate(completedTask.templateId, companyId);
      if (!template || !template.isRecurringTemplate) return null;
      
      // Calculate next week's due date (7 days later)
      const currentDueDate = typeof completedTask.dueDate === 'string' 
        ? new Date(completedTask.dueDate) 
        : completedTask.dueDate;
      const nextDueDate = new Date(currentDueDate);
      nextDueDate.setDate(nextDueDate.getDate() + 7);
      
      // Clone assignee from completed task (preserves per-user assignment)
      const assigneeId = completedTask.assigneeId;
      const assigneeName = completedTask.assigneeName;
      
      // Check if task already exists for next week's date AND same assignee
      // Use occurrenceDate for duplicate detection (allows moved tasks without duplicates)
      const dateKey = getRecurringTaskKey(completedTask.templateId, nextDueDate);
      const existingTasks = await db.select().from(schema.notes).where(
        and(
          eq(schema.notes.templateId, completedTask.templateId),
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, "task")
        )
      );
      
      // Include assignee in duplicate check for per-user instances
      // Use occurrenceDate if available, fallback to dueDate for legacy tasks
      const exists = existingTasks.some(t => {
        const taskData = t as any;
        const occurrenceDate = taskData.occurrenceDate || t.dueDate;
        if (!occurrenceDate) return false;
        const taskDateKey = getRecurringTaskKey(completedTask.templateId, occurrenceDate);
        const sameAssignee = (t.assigneeId || null) === (assigneeId || null);
        return taskDateKey === dateKey && sameAssignee;
      });
      
      if (exists) return null;
      
      // Prepare checklist from template with fresh IDs (reset completed state)
      const templateChecklist = (template as any).checklist || [];
      const taskChecklist = templateChecklist.map((item: any) => ({
        id: crypto.randomUUID(),
        text: item.text,
        completed: false,
      }));
      
      // Clone key fields from completed task, use template's default status or "todo"
      const taskData: InsertNote = {
        title: completedTask.title,
        content: completedTask.content || "",
        author: "System",
        type: "task",
        priority: completedTask.priority as any,
        status: template.defaultTaskStatus || "todo",
        assigneeId: assigneeId,
        assigneeName: assigneeName,
        dueDate: nextDueDate,
        startTime: completedTask.startTime,
        endTime: completedTask.endTime,
        tags: completedTask.tags || [],
        labels: completedTask.labels || [],
        category: completedTask.category,
        templateId: completedTask.templateId,
        occurrenceDate: nextDueDate, // Store original scheduled date for duplicate prevention
        companyId: companyId,
        checklist: taskChecklist,
      };
      
      const [newTask] = await db.insert(schema.notes).values(taskData).returning();
      return newTask as Task;
    } catch (error) {
      console.error("Database error in createNextRecurringTask:", error);
      throw error;
    }
  }

  /**
   * Creates the next instance of a standard recurring task (isRecurring=true, recurringType)
   * This handles daily/weekly/monthly recurrence for standard tasks (not template-based)
   * Respects includeSaturday/includeSunday for daily recurrence
   */
  async createNextStandardRecurringTask(completedTask: Task, companyId: string): Promise<Task | null> {
    try {
      if (!completedTask.isRecurring || !completedTask.recurringType || !completedTask.dueDate) {
        return null;
      }

      const currentDueDate = typeof completedTask.dueDate === 'string' 
        ? new Date(completedTask.dueDate) 
        : completedTask.dueDate;
      
      let nextDueDate = new Date(currentDueDate);
      
      // Calculate next due date based on recurring type
      switch (completedTask.recurringType) {
        case 'daily':
          nextDueDate.setDate(nextDueDate.getDate() + 1);
          // Skip days based on includeSaturday/includeSunday settings
          const includeSaturday = (completedTask as any).includeSaturday;
          const includeSunday = (completedTask as any).includeSunday;
          // Skip Saturday (6) if not included, skip Sunday (0) if not included
          while (
            (nextDueDate.getDay() === 6 && !includeSaturday) ||
            (nextDueDate.getDay() === 0 && !includeSunday)
          ) {
            nextDueDate.setDate(nextDueDate.getDate() + 1);
          }
          break;
        case 'weekly':
          // For weekly, find the next occurrence based on recurringDays
          const recurringDays = (completedTask.recurringDays as number[]) || [];
          if (recurringDays.length === 0) {
            // Default to same day next week
            nextDueDate.setDate(nextDueDate.getDate() + 7);
          } else {
            // Find the next scheduled day by checking each day from tomorrow
            let found = false;
            for (let i = 1; i <= 7 && !found; i++) {
              const checkDate = new Date(currentDueDate);
              checkDate.setDate(currentDueDate.getDate() + i);
              if (recurringDays.includes(checkDate.getDay())) {
                nextDueDate = checkDate;
                found = true;
              }
            }
            if (!found) {
              // Fallback to next week same day
              nextDueDate = new Date(currentDueDate);
              nextDueDate.setDate(nextDueDate.getDate() + 7);
            }
          }
          break;
        case 'monthly':
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          break;
        default:
          return null;
      }

      // Check if task already exists for this date using original task ID as the recurrence source
      // Normalize to date-only string to avoid timezone issues
      const dateStr = `${nextDueDate.getFullYear()}-${String(nextDueDate.getMonth() + 1).padStart(2, '0')}-${String(nextDueDate.getDate()).padStart(2, '0')}`;
      
      // Use a recurrence key based on the original task's ID + title + recurring config
      // This ensures we don't create duplicates for the same recurring task series
      const recurrenceKey = `${completedTask.id}-${completedTask.recurringType}`;
      
      const existingTasks = await db.select().from(schema.notes).where(
        and(
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, "task"),
          eq(schema.notes.isRecurring, true)
        )
      );

      // Check if a task from the same recurrence series exists for this date
      const exists = existingTasks.some(t => {
        if (!t.dueDate) return false;
        const taskDate = new Date(t.dueDate);
        const taskDateStr = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}-${String(taskDate.getDate()).padStart(2, '0')}`;
        // Match by title and recurring config to identify same series
        const sameTitle = t.title === completedTask.title;
        const sameRecurringType = t.recurringType === completedTask.recurringType;
        return taskDateStr === dateStr && sameTitle && sameRecurringType;
      });

      if (exists) return null;

      // Clone the task with new due date and reset status
      const taskData: InsertNote = {
        title: completedTask.title,
        content: completedTask.content || "",
        author: "System",
        type: "task",
        priority: completedTask.priority as any,
        status: "todo",
        assigneeId: completedTask.assigneeId,
        assigneeName: completedTask.assigneeName,
        dueDate: nextDueDate,
        startTime: completedTask.startTime,
        endTime: completedTask.endTime,
        tags: completedTask.tags || [],
        labels: completedTask.labels || [],
        category: completedTask.category,
        projectId: completedTask.projectId,
        companyId: companyId,
        isRecurring: true,
        recurringType: completedTask.recurringType,
        recurringDays: completedTask.recurringDays,
        includeSaturday: (completedTask as any).includeSaturday,
        includeSunday: (completedTask as any).includeSunday,
        taskContextType: completedTask.taskContextType as any,
        taskContextId: completedTask.taskContextId,
        scope: completedTask.scope as any,
      };

      const [newTask] = await db.insert(schema.notes).values(taskData).returning();
      console.log(`[createNextStandardRecurringTask] Created next instance for "${completedTask.title}" on ${dateStr}`);
      return newTask as Task;
    } catch (error) {
      console.error("Database error in createNextStandardRecurringTask:", error);
      throw error;
    }
  }

  // ============================================================
  // SYSTEMS LIBRARY - Workflow Templates
  // ============================================================

  async getWorkflowTemplates(companyId: string, isActive?: boolean): Promise<WorkflowTemplate[]> {
    try {
      let query = db.select()
        .from(schema.workflowTemplates)
        .where(eq(schema.workflowTemplates.companyId, companyId))
        .orderBy(asc(schema.workflowTemplates.name));

      if (isActive !== undefined) {
        query = query.where(eq(schema.workflowTemplates.isActive, isActive)) as any;
      }

      const templates = await query;
      return templates as WorkflowTemplate[];
    } catch (error) {
      console.error("Database error in getWorkflowTemplates:", error);
      throw error;
    }
  }

  async getWorkflowTemplate(id: string, companyId: string): Promise<WorkflowTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.workflowTemplates)
        .where(and(
          eq(schema.workflowTemplates.id, id),
          eq(schema.workflowTemplates.companyId, companyId)
        ));
      return result[0] as WorkflowTemplate | undefined;
    } catch (error) {
      console.error("Database error in getWorkflowTemplate:", error);
      throw error;
    }
  }

  async createWorkflowTemplate(template: InsertWorkflowTemplate & { companyId: string }): Promise<WorkflowTemplate> {
    try {
      const result = await db.insert(schema.workflowTemplates)
        .values(template)
        .returning();
      return result[0] as WorkflowTemplate;
    } catch (error) {
      console.error("Database error in createWorkflowTemplate:", error);
      throw error;
    }
  }

  async updateWorkflowTemplate(id: string, template: Partial<InsertWorkflowTemplate>, companyId: string): Promise<WorkflowTemplate | undefined> {
    try {
      const result = await db.update(schema.workflowTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.workflowTemplates.id, id),
          eq(schema.workflowTemplates.companyId, companyId)
        ))
        .returning();
      return result[0] as WorkflowTemplate | undefined;
    } catch (error) {
      console.error("Database error in updateWorkflowTemplate:", error);
      throw error;
    }
  }

  async deleteWorkflowTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.workflowTemplates)
        .where(and(
          eq(schema.workflowTemplates.id, id),
          eq(schema.workflowTemplates.companyId, companyId)
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

  async getProjectWorkflows(projectId: string): Promise<ProjectWorkflow[]> {
    try {
      const workflows = await db.select()
        .from(schema.projectWorkflows)
        .where(eq(schema.projectWorkflows.projectId, projectId))
        .orderBy(desc(schema.projectWorkflows.triggeredAt));
      return workflows as ProjectWorkflow[];
    } catch (error) {
      console.error("Database error in getProjectWorkflows:", error);
      throw error;
    }
  }

  async getProjectWorkflow(id: string): Promise<ProjectWorkflow | undefined> {
    try {
      const result = await db.select()
        .from(schema.projectWorkflows)
        .where(eq(schema.projectWorkflows.id, id));
      return result[0] as ProjectWorkflow | undefined;
    } catch (error) {
      console.error("Database error in getProjectWorkflow:", error);
      throw error;
    }
  }

  async createProjectWorkflow(workflow: InsertProjectWorkflow): Promise<ProjectWorkflow> {
    try {
      const result = await db.insert(schema.projectWorkflows)
        .values(workflow)
        .returning();
      return result[0] as ProjectWorkflow;
    } catch (error) {
      console.error("Database error in createProjectWorkflow:", error);
      throw error;
    }
  }

  async updateProjectWorkflow(id: string, workflow: Partial<InsertProjectWorkflow>): Promise<ProjectWorkflow | undefined> {
    try {
      const result = await db.update(schema.projectWorkflows)
        .set({ ...workflow, updatedAt: new Date() })
        .where(eq(schema.projectWorkflows.id, id))
        .returning();
      return result[0] as ProjectWorkflow | undefined;
    } catch (error) {
      console.error("Database error in updateProjectWorkflow:", error);
      throw error;
    }
  }

  async deleteProjectWorkflow(id: string): Promise<boolean> {
    try {
      await db.delete(schema.projectWorkflows)
        .where(eq(schema.projectWorkflows.id, id));
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
  async getChannels(companyId: string, userId?: string, filters?: { type?: string; projectId?: string }): Promise<Channel[]> {
    try {
      const conditions = [
        eq(schema.channels.companyId, companyId),
        eq(schema.channels.isArchived, false)
      ];

      // Add type filter if provided
      if (filters?.type) {
        conditions.push(eq(schema.channels.type, filters.type));
      }

      // Add projectId filter if provided
      if (filters?.projectId) {
        conditions.push(eq(schema.channels.projectId, filters.projectId));
      }

      const query = db.select().from(schema.channels)
        .where(and(...conditions))
        .orderBy(asc(schema.channels.name));
      
      const channels = await query;
      
      // If userId provided, filter to only channels where user is a member
      if (userId) {
        const memberChannelIds = await db.select({ channelId: schema.channelMembers.channelId })
          .from(schema.channelMembers)
          .where(eq(schema.channelMembers.userId, userId));
        
        const channelIdsSet = new Set(memberChannelIds.map(m => m.channelId));
        return channels.filter(c => channelIdsSet.has(c.id)) as Channel[];
      }
      
      return channels as Channel[];
    } catch (error) {
      console.error("Database error in getChannels:", error);
      throw error;
    }
  }

  async getChannel(id: string, companyId: string): Promise<Channel | undefined> {
    try {
      const result = await db.select().from(schema.channels)
        .where(
          and(
            eq(schema.channels.id, id),
            eq(schema.channels.companyId, companyId)
          )
        )
        .limit(1);
      return result[0] as Channel | undefined;
    } catch (error) {
      console.error("Database error in getChannel:", error);
      throw error;
    }
  }

  async createChannel(channel: InsertChannel & { companyId: string }): Promise<Channel> {
    try {
      const result = await db.insert(schema.channels)
        .values(channel)
        .returning();
      return result[0] as Channel;
    } catch (error) {
      console.error("Database error in createChannel:", error);
      throw error;
    }
  }

  async updateChannel(id: string, channel: Partial<InsertChannel>, companyId: string): Promise<Channel | undefined> {
    try {
      const result = await db.update(schema.channels)
        .set({ ...channel, updatedAt: new Date() })
        .where(
          and(
            eq(schema.channels.id, id),
            eq(schema.channels.companyId, companyId)
          )
        )
        .returning();
      return result[0] as Channel | undefined;
    } catch (error) {
      console.error("Database error in updateChannel:", error);
      throw error;
    }
  }

  async deleteChannel(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.channels)
        .where(
          and(
            eq(schema.channels.id, id),
            eq(schema.channels.companyId, companyId)
          )
        );
      return true;
    } catch (error) {
      console.error("Database error in deleteChannel:", error);
      throw error;
    }
  }

  async getOrCreateDMChannel(userId1: string, userId2: string, companyId: string): Promise<Channel> {
    try {
      // Sort user IDs to ensure consistent DM channel name
      const [user1, user2] = [userId1, userId2].sort();
      const dmParticipants = [user1, user2];
      
      // Check if DM channel already exists
      const existing = await db.select().from(schema.channels)
        .where(
          and(
            eq(schema.channels.companyId, companyId),
            eq(schema.channels.type, 'dm'),
            sql`${schema.channels.dmParticipants}::jsonb @> ${JSON.stringify(dmParticipants)}::jsonb`
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        return existing[0] as Channel;
      }
      
      // Create new DM channel
      const users = await Promise.all([
        this.getUser(user1),
        this.getUser(user2)
      ]);
      
      const dmName = `dm-${users[0]?.firstName || users[0]?.email}-${users[1]?.firstName || users[1]?.email}`;
      
      const newChannel = await this.createChannel({
        name: dmName,
        type: 'dm',
        dmParticipants,
        companyId,
        createdById: userId1
      });
      
      // Add both users as members
      await Promise.all([
        this.addChannelMember({ channelId: newChannel.id, userId: user1, role: 'member' }),
        this.addChannelMember({ channelId: newChannel.id, userId: user2, role: 'member' })
      ]);
      
      return newChannel;
    } catch (error) {
      console.error("Database error in getOrCreateDMChannel:", error);
      throw error;
    }
  }

  // Channel Members
  async getChannelMembers(channelId: string): Promise<ChannelMember[]> {
    try {
      const members = await db.select().from(schema.channelMembers)
        .where(eq(schema.channelMembers.channelId, channelId))
        .orderBy(asc(schema.channelMembers.joinedAt));
      return members as ChannelMember[];
    } catch (error) {
      console.error("Database error in getChannelMembers:", error);
      throw error;
    }
  }

  async addChannelMember(member: InsertChannelMember): Promise<ChannelMember> {
    try {
      const result = await db.insert(schema.channelMembers)
        .values(member)
        .returning();
      return result[0] as ChannelMember;
    } catch (error) {
      console.error("Database error in addChannelMember:", error);
      throw error;
    }
  }

  async removeChannelMember(channelId: string, userId: string): Promise<boolean> {
    try {
      await db.delete(schema.channelMembers)
        .where(
          and(
            eq(schema.channelMembers.channelId, channelId),
            eq(schema.channelMembers.userId, userId)
          )
        );
      return true;
    } catch (error) {
      console.error("Database error in removeChannelMember:", error);
      throw error;
    }
  }

  async updateChannelMemberLastRead(channelId: string, userId: string): Promise<void> {
    try {
      await db.update(schema.channelMembers)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(schema.channelMembers.channelId, channelId),
            eq(schema.channelMembers.userId, userId)
          )
        );
    } catch (error) {
      console.error("Database error in updateChannelMemberLastRead:", error);
      throw error;
    }
  }

  async updateChannelMemberPin(channelId: string, userId: string, isPinned: boolean): Promise<void> {
    try {
      await db.update(schema.channelMembers)
        .set({ isPinned, updatedAt: new Date() })
        .where(
          and(
            eq(schema.channelMembers.channelId, channelId),
            eq(schema.channelMembers.userId, userId)
          )
        );
    } catch (error) {
      console.error("Database error in updateChannelMemberPin:", error);
      throw error;
    }
  }

  async getUnreadCounts(userId: string, companyId: string): Promise<Record<string, number>> {
    try {
      // Get all channels for the company where user is a member
      const channelsWithMembers = await db
        .select({
          channelId: schema.channelMembers.channelId,
          lastReadAt: schema.channelMembers.lastReadAt
        })
        .from(schema.channelMembers)
        .innerJoin(schema.channels, eq(schema.channelMembers.channelId, schema.channels.id))
        .where(
          and(
            eq(schema.channelMembers.userId, userId),
            eq(schema.channels.companyId, companyId)
          )
        );

      // For each channel, count messages newer than lastReadAt
      const unreadCounts: Record<string, number> = {};
      
      for (const { channelId, lastReadAt } of channelsWithMembers) {
        // Build the where conditions
        const conditions = [
          eq(schema.messages.channelId, channelId),
          eq(schema.messages.isDeleted, false)
        ];

        // If there's a lastReadAt, only count messages after that time
        if (lastReadAt) {
          conditions.push(gt(schema.messages.createdAt, lastReadAt));
        }

        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(schema.messages)
          .where(and(...conditions));

        unreadCounts[channelId] = Number(result[0]?.count || 0);
      }

      return unreadCounts;
    } catch (error) {
      console.error("Database error in getUnreadCounts:", error);
      throw error;
    }
  }

  // Messages
  async getMessages(channelId: string, limit: number = 100, before?: string): Promise<Message[]> {
    try {
      let query = db.select().from(schema.messages)
        .where(
          and(
            eq(schema.messages.channelId, channelId),
            eq(schema.messages.isDeleted, false)
          )
        );
      
      if (before) {
        query = query.where(
          and(
            eq(schema.messages.channelId, channelId),
            eq(schema.messages.isDeleted, false),
            sql`${schema.messages.createdAt} < (SELECT created_at FROM ${schema.messages} WHERE id = ${before})`
          )
        );
      }
      
      const messages = await query
        .orderBy(desc(schema.messages.createdAt))
        .limit(limit);
      
      // Reverse to get chronological order (oldest first)
      return messages.reverse() as Message[];
    } catch (error) {
      console.error("Database error in getMessages:", error);
      throw error;
    }
  }

  async getMessage(id: string): Promise<Message | undefined> {
    try {
      const result = await db.select().from(schema.messages)
        .where(eq(schema.messages.id, id))
        .limit(1);
      return result[0] as Message | undefined;
    } catch (error) {
      console.error("Database error in getMessage:", error);
      throw error;
    }
  }

  async getMessageCount(channelId: string): Promise<number> {
    try {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.channelId, channelId),
            eq(schema.messages.isDeleted, false)
          )
        );
      return Number(result[0]?.count || 0);
    } catch (error) {
      console.error("Database error in getMessageCount:", error);
      throw error;
    }
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    try {
      // Get user info to cache
      const user = await this.getUser(message.userId);
      
      const messageWithUserInfo = {
        ...message,
        userFirstName: user?.firstName || null,
        userLastName: user?.lastName || null,
        userEmail: user?.email || null
      };
      
      const result = await db.insert(schema.messages)
        .values(messageWithUserInfo)
        .returning();
      return result[0] as Message;
    } catch (error) {
      console.error("Database error in createMessage:", error);
      throw error;
    }
  }

  async updateMessage(id: string, message: Partial<InsertMessage>): Promise<Message | undefined> {
    try {
      const result = await db.update(schema.messages)
        .set({ ...message, updatedAt: new Date(), isEdited: true })
        .where(eq(schema.messages.id, id))
        .returning();
      return result[0] as Message | undefined;
    } catch (error) {
      console.error("Database error in updateMessage:", error);
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<boolean> {
    try {
      // Soft delete
      await db.update(schema.messages)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(eq(schema.messages.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteMessage:", error);
      throw error;
    }
  }

  // ============================================
  // PURCHASE ORDERS
  // ============================================

  async getPurchaseOrders(companyId: string, projectId?: string, status?: string, poType?: string): Promise<PurchaseOrder[]> {
    try {
      const conditions = [eq(schema.purchaseOrders.companyId, companyId)];
      
      if (projectId) {
        conditions.push(eq(schema.purchaseOrders.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.purchaseOrders.status, status as any));
      }
      if (poType) {
        conditions.push(eq(schema.purchaseOrders.poType, poType as any));
      }
      
      const result = await db.select().from(schema.purchaseOrders)
        .where(and(...conditions))
        .orderBy(desc(schema.purchaseOrders.createdAt));
      return result as PurchaseOrder[];
    } catch (error) {
      console.error("Database error in getPurchaseOrders:", error);
      throw error;
    }
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    try {
      const result = await db.select().from(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.id, id))
        .limit(1);
      return result[0] as PurchaseOrder | undefined;
    } catch (error) {
      console.error("Database error in getPurchaseOrder:", error);
      throw error;
    }
  }

  async createPurchaseOrder(po: InsertPurchaseOrder): Promise<PurchaseOrder> {
    try {
      const result = await db.insert(schema.purchaseOrders)
        .values(po)
        .returning();
      return result[0] as PurchaseOrder;
    } catch (error) {
      console.error("Database error in createPurchaseOrder:", error);
      throw error;
    }
  }

  async updatePurchaseOrder(id: string, po: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    try {
      const result = await db.update(schema.purchaseOrders)
        .set({ ...po, updatedAt: new Date() })
        .where(eq(schema.purchaseOrders.id, id))
        .returning();
      return result[0] as PurchaseOrder | undefined;
    } catch (error) {
      console.error("Database error in updatePurchaseOrder:", error);
      throw error;
    }
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    try {
      await db.delete(schema.purchaseOrders)
        .where(eq(schema.purchaseOrders.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deletePurchaseOrder:", error);
      throw error;
    }
  }

  async getNextPONumber(companyId: string, poType: "main" | "site"): Promise<string> {
    try {
      const year = new Date().getFullYear();
      const prefix = poType === "site" ? "SPO" : "PO";
      
      // Get the highest PO number for this year and type
      const result = await db.select({ poNumber: schema.purchaseOrders.poNumber })
        .from(schema.purchaseOrders)
        .where(
          and(
            eq(schema.purchaseOrders.companyId, companyId),
            eq(schema.purchaseOrders.poType, poType),
            sql`${schema.purchaseOrders.poNumber} LIKE ${prefix + '-' + year + '-%'}`
          )
        )
        .orderBy(desc(schema.purchaseOrders.poNumber))
        .limit(1);
      
      let nextNumber = 1;
      if (result.length > 0 && result[0].poNumber) {
        const parts = result[0].poNumber.split('-');
        if (parts.length === 3) {
          nextNumber = parseInt(parts[2], 10) + 1;
        }
      }
      
      return `${prefix}-${year}-${String(nextNumber).padStart(3, '0')}`;
    } catch (error) {
      console.error("Database error in getNextPONumber:", error);
      throw error;
    }
  }

  // Purchase Order Items
  async getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    try {
      const result = await db.select().from(schema.purchaseOrderItems)
        .where(eq(schema.purchaseOrderItems.purchaseOrderId, purchaseOrderId))
        .orderBy(asc(schema.purchaseOrderItems.displayOrder));
      return result as PurchaseOrderItem[];
    } catch (error) {
      console.error("Database error in getPurchaseOrderItems:", error);
      throw error;
    }
  }

  async getPurchaseOrderItem(id: string): Promise<PurchaseOrderItem | undefined> {
    try {
      const result = await db.select().from(schema.purchaseOrderItems)
        .where(eq(schema.purchaseOrderItems.id, id))
        .limit(1);
      return result[0] as PurchaseOrderItem | undefined;
    } catch (error) {
      console.error("Database error in getPurchaseOrderItem:", error);
      throw error;
    }
  }

  async createPurchaseOrderItem(item: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    try {
      const result = await db.insert(schema.purchaseOrderItems)
        .values(item)
        .returning();
      return result[0] as PurchaseOrderItem;
    } catch (error) {
      console.error("Database error in createPurchaseOrderItem:", error);
      throw error;
    }
  }

  async updatePurchaseOrderItem(id: string, item: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined> {
    try {
      const result = await db.update(schema.purchaseOrderItems)
        .set({ ...item, updatedAt: new Date() })
        .where(eq(schema.purchaseOrderItems.id, id))
        .returning();
      return result[0] as PurchaseOrderItem | undefined;
    } catch (error) {
      console.error("Database error in updatePurchaseOrderItem:", error);
      throw error;
    }
  }

  async deletePurchaseOrderItem(id: string): Promise<boolean> {
    try {
      await db.delete(schema.purchaseOrderItems)
        .where(eq(schema.purchaseOrderItems.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deletePurchaseOrderItem:", error);
      throw error;
    }
  }

  async reorderPurchaseOrderItems(updates: Array<{id: string, displayOrder: number}>): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.purchaseOrderItems)
          .set({ displayOrder: update.displayOrder })
          .where(eq(schema.purchaseOrderItems.id, update.id));
      }
    } catch (error) {
      console.error("Database error in reorderPurchaseOrderItems:", error);
      throw error;
    }
  }

  // Purchase Order Attachments
  async getPurchaseOrderAttachments(purchaseOrderId: string): Promise<PurchaseOrderAttachment[]> {
    try {
      const result = await db.select().from(schema.purchaseOrderAttachments)
        .where(eq(schema.purchaseOrderAttachments.purchaseOrderId, purchaseOrderId))
        .orderBy(desc(schema.purchaseOrderAttachments.createdAt));
      return result as PurchaseOrderAttachment[];
    } catch (error) {
      console.error("Database error in getPurchaseOrderAttachments:", error);
      throw error;
    }
  }

  async getPurchaseOrderAttachment(id: string): Promise<PurchaseOrderAttachment | undefined> {
    try {
      const result = await db.select().from(schema.purchaseOrderAttachments)
        .where(eq(schema.purchaseOrderAttachments.id, id))
        .limit(1);
      return result[0] as PurchaseOrderAttachment | undefined;
    } catch (error) {
      console.error("Database error in getPurchaseOrderAttachment:", error);
      throw error;
    }
  }

  async createPurchaseOrderAttachment(attachment: InsertPurchaseOrderAttachment): Promise<PurchaseOrderAttachment> {
    try {
      const result = await db.insert(schema.purchaseOrderAttachments)
        .values(attachment)
        .returning();
      return result[0] as PurchaseOrderAttachment;
    } catch (error) {
      console.error("Database error in createPurchaseOrderAttachment:", error);
      throw error;
    }
  }

  async deletePurchaseOrderAttachment(id: string): Promise<boolean> {
    try {
      await db.delete(schema.purchaseOrderAttachments)
        .where(eq(schema.purchaseOrderAttachments.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deletePurchaseOrderAttachment:", error);
      throw error;
    }
  }

  // Purchase Order Signatures
  async getPurchaseOrderSignatures(purchaseOrderId: string): Promise<PurchaseOrderSignature[]> {
    try {
      const result = await db.select().from(schema.purchaseOrderSignatures)
        .where(eq(schema.purchaseOrderSignatures.purchaseOrderId, purchaseOrderId))
        .orderBy(desc(schema.purchaseOrderSignatures.signedAt));
      return result as PurchaseOrderSignature[];
    } catch (error) {
      console.error("Database error in getPurchaseOrderSignatures:", error);
      throw error;
    }
  }

  async createPurchaseOrderSignature(signature: InsertPurchaseOrderSignature): Promise<PurchaseOrderSignature> {
    try {
      const result = await db.insert(schema.purchaseOrderSignatures)
        .values(signature)
        .returning();
      return result[0] as PurchaseOrderSignature;
    } catch (error) {
      console.error("Database error in createPurchaseOrderSignature:", error);
      throw error;
    }
  }

  async getPurchaseOrderBySignatureToken(token: string): Promise<PurchaseOrder | undefined> {
    try {
      const sig = await db.select().from(schema.purchaseOrderSignatures)
        .where(eq(schema.purchaseOrderSignatures.signatureToken, token))
        .limit(1);
      
      if (sig.length === 0) return undefined;
      
      return this.getPurchaseOrder(sig[0].purchaseOrderId);
    } catch (error) {
      console.error("Database error in getPurchaseOrderBySignatureToken:", error);
      throw error;
    }
  }

  // Purchase Order Templates
  async getPurchaseOrderTemplates(companyId: string): Promise<PurchaseOrderTemplate[]> {
    try {
      const result = await db.select().from(schema.purchaseOrderTemplates)
        .where(
          and(
            eq(schema.purchaseOrderTemplates.companyId, companyId),
            eq(schema.purchaseOrderTemplates.isActive, true)
          )
        )
        .orderBy(asc(schema.purchaseOrderTemplates.name));
      return result as PurchaseOrderTemplate[];
    } catch (error) {
      console.error("Database error in getPurchaseOrderTemplates:", error);
      throw error;
    }
  }

  async getPurchaseOrderTemplate(id: string, companyId: string): Promise<PurchaseOrderTemplate | undefined> {
    try {
      const result = await db.select().from(schema.purchaseOrderTemplates)
        .where(
          and(
            eq(schema.purchaseOrderTemplates.id, id),
            eq(schema.purchaseOrderTemplates.companyId, companyId)
          )
        )
        .limit(1);
      return result[0] as PurchaseOrderTemplate | undefined;
    } catch (error) {
      console.error("Database error in getPurchaseOrderTemplate:", error);
      throw error;
    }
  }

  async createPurchaseOrderTemplate(template: InsertPurchaseOrderTemplate): Promise<PurchaseOrderTemplate> {
    try {
      const result = await db.insert(schema.purchaseOrderTemplates)
        .values(template)
        .returning();
      return result[0] as PurchaseOrderTemplate;
    } catch (error) {
      console.error("Database error in createPurchaseOrderTemplate:", error);
      throw error;
    }
  }

  async updatePurchaseOrderTemplate(id: string, template: Partial<InsertPurchaseOrderTemplate>, companyId: string): Promise<PurchaseOrderTemplate | undefined> {
    try {
      const result = await db.update(schema.purchaseOrderTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(
          and(
            eq(schema.purchaseOrderTemplates.id, id),
            eq(schema.purchaseOrderTemplates.companyId, companyId)
          )
        )
        .returning();
      return result[0] as PurchaseOrderTemplate | undefined;
    } catch (error) {
      console.error("Database error in updatePurchaseOrderTemplate:", error);
      throw error;
    }
  }

  async deletePurchaseOrderTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      await db.update(schema.purchaseOrderTemplates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(schema.purchaseOrderTemplates.id, id),
            eq(schema.purchaseOrderTemplates.companyId, companyId)
          )
        );
      return true;
    } catch (error) {
      console.error("Database error in deletePurchaseOrderTemplate:", error);
      throw error;
    }
  }

  // Favorite Suppliers
  async getFavoriteSuppliers(userId: string, companyId: string): Promise<FavoriteSupplier[]> {
    try {
      const result = await db.select().from(schema.favoriteSuppliers)
        .where(
          and(
            eq(schema.favoriteSuppliers.userId, userId),
            eq(schema.favoriteSuppliers.companyId, companyId)
          )
        )
        .orderBy(asc(schema.favoriteSuppliers.displayOrder));
      return result as FavoriteSupplier[];
    } catch (error) {
      console.error("Database error in getFavoriteSuppliers:", error);
      throw error;
    }
  }

  async createFavoriteSupplier(supplier: InsertFavoriteSupplier): Promise<FavoriteSupplier> {
    try {
      const result = await db.insert(schema.favoriteSuppliers)
        .values(supplier)
        .returning();
      return result[0] as FavoriteSupplier;
    } catch (error) {
      console.error("Database error in createFavoriteSupplier:", error);
      throw error;
    }
  }

  async deleteFavoriteSupplier(id: string, userId: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.favoriteSuppliers)
        .where(
          and(
            eq(schema.favoriteSuppliers.id, id),
            eq(schema.favoriteSuppliers.userId, userId),
            eq(schema.favoriteSuppliers.companyId, companyId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteFavoriteSupplier:", error);
      throw error;
    }
  }

  async reorderFavoriteSuppliers(updates: Array<{id: string, displayOrder: number}>): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.favoriteSuppliers)
          .set({ displayOrder: update.displayOrder })
          .where(eq(schema.favoriteSuppliers.id, update.id));
      }
    } catch (error) {
      console.error("Database error in reorderFavoriteSuppliers:", error);
      throw error;
    }
  }

  // Favorite Cost Codes
  async getFavoriteCostCodes(userId: string, companyId: string): Promise<FavoriteCostCode[]> {
    try {
      const result = await db.select().from(schema.favoriteCostCodes)
        .where(
          and(
            eq(schema.favoriteCostCodes.userId, userId),
            eq(schema.favoriteCostCodes.companyId, companyId)
          )
        )
        .orderBy(asc(schema.favoriteCostCodes.displayOrder));
      return result as FavoriteCostCode[];
    } catch (error) {
      console.error("Database error in getFavoriteCostCodes:", error);
      throw error;
    }
  }

  async createFavoriteCostCode(costCode: InsertFavoriteCostCode): Promise<FavoriteCostCode> {
    try {
      const result = await db.insert(schema.favoriteCostCodes)
        .values(costCode)
        .returning();
      return result[0] as FavoriteCostCode;
    } catch (error) {
      console.error("Database error in createFavoriteCostCode:", error);
      throw error;
    }
  }

  async deleteFavoriteCostCode(id: string): Promise<boolean> {
    try {
      await db.delete(schema.favoriteCostCodes)
        .where(eq(schema.favoriteCostCodes.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteFavoriteCostCode:", error);
      throw error;
    }
  }

  async reorderFavoriteCostCodes(updates: Array<{id: string, displayOrder: number}>): Promise<void> {
    try {
      for (const update of updates) {
        await db.update(schema.favoriteCostCodes)
          .set({ displayOrder: update.displayOrder })
          .where(eq(schema.favoriteCostCodes.id, update.id));
      }
    } catch (error) {
      console.error("Database error in reorderFavoriteCostCodes:", error);
      throw error;
    }
  }

  // ==================== REMINDERS SYSTEM ====================

  // Business Reminders (company-wide)
  async getBusinessReminders(companyId: string): Promise<schema.BusinessReminder[]> {
    try {
      const result = await db.select().from(schema.businessReminders)
        .where(eq(schema.businessReminders.companyId, companyId))
        .orderBy(desc(schema.businessReminders.createdAt));
      return result;
    } catch (error) {
      console.error("Database error in getBusinessReminders:", error);
      throw error;
    }
  }

  async getBusinessReminderById(id: string, companyId: string): Promise<schema.BusinessReminder | null> {
    try {
      const result = await db.select().from(schema.businessReminders)
        .where(
          and(
            eq(schema.businessReminders.id, id),
            eq(schema.businessReminders.companyId, companyId)
          )
        );
      return result[0] || null;
    } catch (error) {
      console.error("Database error in getBusinessReminderById:", error);
      throw error;
    }
  }

  async createBusinessReminder(reminder: schema.InsertBusinessReminder & { companyId: string }): Promise<schema.BusinessReminder> {
    try {
      const result = await db.insert(schema.businessReminders)
        .values(reminder)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createBusinessReminder:", error);
      throw error;
    }
  }

  async updateBusinessReminder(id: string, companyId: string, data: Partial<schema.InsertBusinessReminder>): Promise<schema.BusinessReminder | null> {
    try {
      const result = await db.update(schema.businessReminders)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.businessReminders.id, id),
            eq(schema.businessReminders.companyId, companyId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in updateBusinessReminder:", error);
      throw error;
    }
  }

  async deleteBusinessReminder(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.businessReminders)
        .where(
          and(
            eq(schema.businessReminders.id, id),
            eq(schema.businessReminders.companyId, companyId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteBusinessReminder:", error);
      throw error;
    }
  }

  // Personal/Item Reminders
  async getReminders(userId: string, companyId: string, options?: { status?: string; linkedItemType?: string }): Promise<schema.Reminder[]> {
    try {
      const conditions = [
        eq(schema.reminders.companyId, companyId),
        or(
          eq(schema.reminders.userId, userId),
          eq(schema.reminders.targetUserId, userId)
        )
      ];
      
      if (options?.status) {
        conditions.push(eq(schema.reminders.status, options.status));
      }
      if (options?.linkedItemType) {
        conditions.push(eq(schema.reminders.linkedItemType, options.linkedItemType));
      }
      
      const result = await db.select().from(schema.reminders)
        .where(and(...conditions))
        .orderBy(asc(schema.reminders.dueAt));
      return result;
    } catch (error) {
      console.error("Database error in getReminders:", error);
      throw error;
    }
  }

  async getUpcomingReminders(userId: string, companyId: string, limit: number = 10): Promise<schema.Reminder[]> {
    try {
      const now = new Date();
      const result = await db.select().from(schema.reminders)
        .where(
          and(
            eq(schema.reminders.companyId, companyId),
            eq(schema.reminders.targetUserId, userId),
            eq(schema.reminders.status, "active"),
            or(
              gte(schema.reminders.dueAt, now),
              isNull(schema.reminders.dueAt)
            )
          )
        )
        .orderBy(asc(schema.reminders.dueAt))
        .limit(limit);
      return result;
    } catch (error) {
      console.error("Database error in getUpcomingReminders:", error);
      throw error;
    }
  }

  async getReminderById(id: string, companyId: string): Promise<schema.Reminder | null> {
    try {
      const result = await db.select().from(schema.reminders)
        .where(
          and(
            eq(schema.reminders.id, id),
            eq(schema.reminders.companyId, companyId)
          )
        );
      return result[0] || null;
    } catch (error) {
      console.error("Database error in getReminderById:", error);
      throw error;
    }
  }

  async getRemindersForItem(itemType: string, itemId: string, companyId: string): Promise<schema.Reminder[]> {
    try {
      const result = await db.select().from(schema.reminders)
        .where(
          and(
            eq(schema.reminders.companyId, companyId),
            eq(schema.reminders.linkedItemType, itemType),
            eq(schema.reminders.linkedItemId, itemId)
          )
        )
        .orderBy(asc(schema.reminders.dueAt));
      return result;
    } catch (error) {
      console.error("Database error in getRemindersForItem:", error);
      throw error;
    }
  }

  async createReminder(reminder: schema.InsertReminder & { companyId: string }): Promise<schema.Reminder> {
    try {
      const result = await db.insert(schema.reminders)
        .values(reminder)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createReminder:", error);
      throw error;
    }
  }

  async updateReminder(id: string, companyId: string, data: Partial<schema.InsertReminder>): Promise<schema.Reminder | null> {
    try {
      const result = await db.update(schema.reminders)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(schema.reminders.id, id),
            eq(schema.reminders.companyId, companyId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in updateReminder:", error);
      throw error;
    }
  }

  async snoozeReminder(id: string, companyId: string, snoozedUntil: Date): Promise<schema.Reminder | null> {
    try {
      const result = await db.update(schema.reminders)
        .set({ 
          status: "snoozed",
          snoozedUntil,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.reminders.id, id),
            eq(schema.reminders.companyId, companyId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in snoozeReminder:", error);
      throw error;
    }
  }

  async dismissReminder(id: string, companyId: string): Promise<schema.Reminder | null> {
    try {
      const result = await db.update(schema.reminders)
        .set({ 
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(schema.reminders.id, id),
            eq(schema.reminders.companyId, companyId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in dismissReminder:", error);
      throw error;
    }
  }

  async deleteReminder(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.reminders)
        .where(
          and(
            eq(schema.reminders.id, id),
            eq(schema.reminders.companyId, companyId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteReminder:", error);
      throw error;
    }
  }

  // Reminder Notifications
  async getReminderNotifications(userId: string, options?: { status?: string; limit?: number }): Promise<schema.ReminderNotification[]> {
    try {
      const conditions = [eq(schema.reminderNotifications.userId, userId)];
      
      if (options?.status) {
        conditions.push(eq(schema.reminderNotifications.status, options.status));
      }
      
      let query = db.select().from(schema.reminderNotifications)
        .where(and(...conditions))
        .orderBy(desc(schema.reminderNotifications.scheduledFor));
      
      if (options?.limit) {
        query = query.limit(options.limit) as typeof query;
      }
      
      const result = await query;
      return result;
    } catch (error) {
      console.error("Database error in getReminderNotifications:", error);
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const result = await db.select({ count: sql<number>`count(*)::int` })
        .from(schema.reminderNotifications)
        .where(
          and(
            eq(schema.reminderNotifications.userId, userId),
            or(
              eq(schema.reminderNotifications.status, "sent"),
              eq(schema.reminderNotifications.status, "delivered")
            )
          )
        );
      return result[0]?.count || 0;
    } catch (error) {
      console.error("Database error in getUnreadNotificationCount:", error);
      throw error;
    }
  }

  async createReminderNotification(notification: schema.InsertReminderNotification): Promise<schema.ReminderNotification> {
    try {
      const result = await db.insert(schema.reminderNotifications)
        .values(notification)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createReminderNotification:", error);
      throw error;
    }
  }

  async markNotificationAsRead(id: string, userId: string): Promise<schema.ReminderNotification | null> {
    try {
      const result = await db.update(schema.reminderNotifications)
        .set({ 
          status: "read",
          readAt: new Date()
        })
        .where(
          and(
            eq(schema.reminderNotifications.id, id),
            eq(schema.reminderNotifications.userId, userId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in markNotificationAsRead:", error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<number> {
    try {
      const result = await db.update(schema.reminderNotifications)
        .set({ 
          status: "read",
          readAt: new Date()
        })
        .where(
          and(
            eq(schema.reminderNotifications.userId, userId),
            or(
              eq(schema.reminderNotifications.status, "sent"),
              eq(schema.reminderNotifications.status, "delivered")
            )
          )
        )
        .returning();
      return result.length;
    } catch (error) {
      console.error("Database error in markAllNotificationsAsRead:", error);
      throw error;
    }
  }

  async dismissNotification(id: string, userId: string): Promise<schema.ReminderNotification | null> {
    try {
      const result = await db.update(schema.reminderNotifications)
        .set({ 
          status: "dismissed",
          dismissedAt: new Date()
        })
        .where(
          and(
            eq(schema.reminderNotifications.id, id),
            eq(schema.reminderNotifications.userId, userId)
          )
        )
        .returning();
      return result[0] || null;
    } catch (error) {
      console.error("Database error in dismissNotification:", error);
      throw error;
    }
  }

  async getDueReminders(before: Date): Promise<schema.Reminder[]> {
    try {
      const result = await db.select().from(schema.reminders)
        .where(
          and(
            eq(schema.reminders.status, "active"),
            lte(schema.reminders.dueAt, before)
          )
        );
      return result;
    } catch (error) {
      console.error("Database error in getDueReminders:", error);
      throw error;
    }
  }

  async getActiveBusinessRemindersForTime(time: string, dayOfWeek: number): Promise<schema.BusinessReminder[]> {
    try {
      const result = await db.select().from(schema.businessReminders)
        .where(
          and(
            eq(schema.businessReminders.isActive, true),
            eq(schema.businessReminders.scheduleTime, time)
          )
        );
      // Filter by schedule pattern in JS since JSON contains is more complex
      return result.filter(reminder => {
        if (reminder.scheduleType === "daily") return true;
        if (reminder.scheduleType === "weekly" || reminder.scheduleType === "custom") {
          const days = (reminder.scheduleDays as number[]) || [];
          return days.includes(dayOfWeek);
        }
        return false;
      });
    } catch (error) {
      console.error("Database error in getActiveBusinessRemindersForTime:", error);
      throw error;
    }
  }

  // Folder Templates CRUD
  async getFolderTemplates(companyId: string): Promise<schema.FolderTemplate[]> {
    try {
      return await db.select().from(schema.folderTemplates)
        .where(eq(schema.folderTemplates.companyId, companyId))
        .orderBy(desc(schema.folderTemplates.isDefault), schema.folderTemplates.name);
    } catch (error) {
      console.error("Database error in getFolderTemplates:", error);
      throw error;
    }
  }

  async getFolderTemplate(id: string, companyId: string): Promise<schema.FolderTemplate | undefined> {
    try {
      const result = await db.select().from(schema.folderTemplates)
        .where(and(
          eq(schema.folderTemplates.id, id),
          eq(schema.folderTemplates.companyId, companyId)
        ));
      return result[0];
    } catch (error) {
      console.error("Database error in getFolderTemplate:", error);
      throw error;
    }
  }

  async createFolderTemplate(template: schema.InsertFolderTemplate & { companyId: string }): Promise<schema.FolderTemplate> {
    try {
      const result = await db.insert(schema.folderTemplates).values(template).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createFolderTemplate:", error);
      throw error;
    }
  }

  async updateFolderTemplate(id: string, template: Partial<schema.InsertFolderTemplate>, companyId: string): Promise<schema.FolderTemplate | undefined> {
    try {
      const result = await db.update(schema.folderTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(and(
          eq(schema.folderTemplates.id, id),
          eq(schema.folderTemplates.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateFolderTemplate:", error);
      throw error;
    }
  }

  async deleteFolderTemplate(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.folderTemplates)
        .where(and(
          eq(schema.folderTemplates.id, id),
          eq(schema.folderTemplates.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteFolderTemplate:", error);
      throw error;
    }
  }

  // Drive File Attachments CRUD
  async getDriveFileAttachments(attachedToType: string, attachedToId: string, companyId: string): Promise<schema.DriveFileAttachment[]> {
    try {
      return await db.select().from(schema.driveFileAttachments)
        .where(and(
          eq(schema.driveFileAttachments.attachedToType, attachedToType),
          eq(schema.driveFileAttachments.attachedToId, attachedToId),
          eq(schema.driveFileAttachments.companyId, companyId)
        ))
        .orderBy(desc(schema.driveFileAttachments.createdAt));
    } catch (error) {
      console.error("Database error in getDriveFileAttachments:", error);
      throw error;
    }
  }

  async createDriveFileAttachment(attachment: schema.InsertDriveFileAttachment & { companyId: string }): Promise<schema.DriveFileAttachment> {
    try {
      const result = await db.insert(schema.driveFileAttachments).values(attachment).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createDriveFileAttachment:", error);
      throw error;
    }
  }

  async deleteDriveFileAttachment(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.driveFileAttachments)
        .where(and(
          eq(schema.driveFileAttachments.id, id),
          eq(schema.driveFileAttachments.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteDriveFileAttachment:", error);
      throw error;
    }
  }

  // Drive File Activity Logs
  async getDriveFileActivityLogs(companyId: string, projectId?: string, limit: number = 100): Promise<schema.DriveFileActivityLog[]> {
    try {
      let query = db.select().from(schema.driveFileActivityLogs)
        .where(eq(schema.driveFileActivityLogs.companyId, companyId));
      
      if (projectId) {
        query = db.select().from(schema.driveFileActivityLogs)
          .where(and(
            eq(schema.driveFileActivityLogs.companyId, companyId),
            eq(schema.driveFileActivityLogs.projectId, projectId)
          ));
      }
      
      return await query
        .orderBy(desc(schema.driveFileActivityLogs.createdAt))
        .limit(limit);
    } catch (error) {
      console.error("Database error in getDriveFileActivityLogs:", error);
      throw error;
    }
  }

  async createDriveFileActivityLog(log: schema.InsertDriveFileActivityLog): Promise<schema.DriveFileActivityLog> {
    try {
      const result = await db.insert(schema.driveFileActivityLogs).values(log).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createDriveFileActivityLog:", error);
      throw error;
    }
  }

  // ============================================
  // PRICE LIST FEATURE
  // ============================================

  // Price List Categories CRUD
  async getPriceListCategories(companyId: string): Promise<PriceListCategory[]> {
    try {
      return await db.select().from(schema.priceListCategories)
        .where(eq(schema.priceListCategories.companyId, companyId))
        .orderBy(asc(schema.priceListCategories.sortOrder), asc(schema.priceListCategories.name));
    } catch (error) {
      console.error("Database error in getPriceListCategories:", error);
      throw error;
    }
  }

  async getPriceListCategory(id: string, companyId: string): Promise<PriceListCategory | undefined> {
    try {
      const result = await db.select().from(schema.priceListCategories)
        .where(and(
          eq(schema.priceListCategories.id, id),
          eq(schema.priceListCategories.companyId, companyId)
        ));
      return result[0];
    } catch (error) {
      console.error("Database error in getPriceListCategory:", error);
      throw error;
    }
  }

  async createPriceListCategory(category: InsertPriceListCategory & { companyId: string }): Promise<PriceListCategory> {
    try {
      const result = await db.insert(schema.priceListCategories).values(category).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createPriceListCategory:", error);
      throw error;
    }
  }

  async updatePriceListCategory(id: string, category: Partial<InsertPriceListCategory>, companyId: string): Promise<PriceListCategory | undefined> {
    try {
      const result = await db.update(schema.priceListCategories)
        .set({ ...category, updatedAt: new Date() })
        .where(and(
          eq(schema.priceListCategories.id, id),
          eq(schema.priceListCategories.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updatePriceListCategory:", error);
      throw error;
    }
  }

  async deletePriceListCategory(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.priceListCategories)
        .where(and(
          eq(schema.priceListCategories.id, id),
          eq(schema.priceListCategories.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deletePriceListCategory:", error);
      throw error;
    }
  }

  // Price List Items CRUD
  async getPriceListItems(companyId: string, filters?: { categoryId?: string; supplierId?: string; isActive?: boolean; search?: string }): Promise<PriceListItem[]> {
    try {
      let conditions = [eq(schema.priceListItems.companyId, companyId)];
      
      if (filters?.categoryId) {
        conditions.push(eq(schema.priceListItems.categoryId, filters.categoryId));
      }
      if (filters?.supplierId) {
        conditions.push(eq(schema.priceListItems.supplierId, filters.supplierId));
      }
      if (filters?.isActive !== undefined) {
        conditions.push(eq(schema.priceListItems.isActive, filters.isActive));
      }
      if (filters?.search) {
        const searchTerm = `%${filters.search.toLowerCase()}%`;
        conditions.push(or(
          sql`LOWER(${schema.priceListItems.name}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.priceListItems.nickname}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.priceListItems.code}) LIKE ${searchTerm}`,
          sql`LOWER(${schema.priceListItems.description}) LIKE ${searchTerm}`
        )!);
      }

      return await db.select().from(schema.priceListItems)
        .where(and(...conditions))
        .orderBy(asc(schema.priceListItems.name));
    } catch (error) {
      console.error("Database error in getPriceListItems:", error);
      throw error;
    }
  }

  async getPriceListItem(id: string, companyId: string): Promise<PriceListItem | undefined> {
    try {
      const result = await db.select().from(schema.priceListItems)
        .where(and(
          eq(schema.priceListItems.id, id),
          eq(schema.priceListItems.companyId, companyId)
        ));
      return result[0];
    } catch (error) {
      console.error("Database error in getPriceListItem:", error);
      throw error;
    }
  }

  async createPriceListItem(item: InsertPriceListItem & { companyId: string }): Promise<PriceListItem> {
    try {
      const result = await db.insert(schema.priceListItems).values({
        ...item,
        lastPriceUpdate: new Date(),
      }).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createPriceListItem:", error);
      throw error;
    }
  }

  async updatePriceListItem(id: string, item: Partial<InsertPriceListItem>, companyId: string): Promise<PriceListItem | undefined> {
    try {
      // Get current item to check for price changes
      const current = await this.getPriceListItem(id, companyId);
      
      const updateData: any = { ...item, updatedAt: new Date() };
      
      // If price changed, update lastPriceUpdate and add to history
      if (current && (item.costPrice !== undefined || item.sellPrice !== undefined)) {
        const costChanged = item.costPrice !== undefined && item.costPrice !== current.costPrice;
        const sellChanged = item.sellPrice !== undefined && item.sellPrice !== current.sellPrice;
        
        if (costChanged || sellChanged) {
          updateData.lastPriceUpdate = new Date();
          
          // Add to price history
          const currentHistory = (current.priceHistory as any[]) || [];
          currentHistory.push({
            date: new Date().toISOString(),
            costPrice: item.costPrice ?? current.costPrice,
            sellPrice: item.sellPrice ?? current.sellPrice,
            source: "manual"
          });
          updateData.priceHistory = currentHistory;
        }
      }
      
      const result = await db.update(schema.priceListItems)
        .set(updateData)
        .where(and(
          eq(schema.priceListItems.id, id),
          eq(schema.priceListItems.companyId, companyId)
        ))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updatePriceListItem:", error);
      throw error;
    }
  }

  async deletePriceListItem(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.priceListItems)
        .where(and(
          eq(schema.priceListItems.id, id),
          eq(schema.priceListItems.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deletePriceListItem:", error);
      throw error;
    }
  }

  async bulkUpdatePriceListItems(updates: Array<{ id: string; data: Partial<InsertPriceListItem> }>, companyId: string): Promise<PriceListItem[]> {
    try {
      const results: PriceListItem[] = [];
      for (const update of updates) {
        const result = await this.updatePriceListItem(update.id, update.data, companyId);
        if (result) results.push(result);
      }
      return results;
    } catch (error) {
      console.error("Database error in bulkUpdatePriceListItems:", error);
      throw error;
    }
  }

  // Bill Line Item Price Links (for AI Review)
  async getBillLineItemPriceLinks(companyId: string, status?: string): Promise<(BillLineItemPriceLink & { billLineItem?: schema.BillLineItem; bill?: schema.Bill })[]> {
    try {
      // Get links with joined data
      const links = await db.select({
        link: schema.billLineItemPriceLinks,
        billLineItem: schema.billLineItems,
        bill: schema.bills,
      })
        .from(schema.billLineItemPriceLinks)
        .innerJoin(schema.billLineItems, eq(schema.billLineItemPriceLinks.billLineItemId, schema.billLineItems.id))
        .innerJoin(schema.bills, eq(schema.billLineItems.billId, schema.bills.id))
        .innerJoin(schema.projects, eq(schema.bills.projectId, schema.projects.id))
        .where(and(
          eq(schema.projects.companyId, companyId),
          status ? eq(schema.billLineItemPriceLinks.reviewStatus, status) : undefined
        ))
        .orderBy(desc(schema.billLineItemPriceLinks.createdAt));

      return links.map(row => ({
        ...row.link,
        billLineItem: row.billLineItem,
        bill: row.bill,
      }));
    } catch (error) {
      console.error("Database error in getBillLineItemPriceLinks:", error);
      throw error;
    }
  }

  async createBillLineItemPriceLink(link: InsertBillLineItemPriceLink): Promise<BillLineItemPriceLink> {
    try {
      const result = await db.insert(schema.billLineItemPriceLinks).values(link).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createBillLineItemPriceLink:", error);
      throw error;
    }
  }

  async updateBillLineItemPriceLink(id: string, link: Partial<InsertBillLineItemPriceLink>): Promise<BillLineItemPriceLink | undefined> {
    try {
      const result = await db.update(schema.billLineItemPriceLinks)
        .set(link)
        .where(eq(schema.billLineItemPriceLinks.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateBillLineItemPriceLink:", error);
      throw error;
    }
  }

  // Dashboard Views CRUD
  async getDashboardViews(companyId: string, userId: string, viewType?: "personal" | "business"): Promise<DashboardView[]> {
    try {
      // Get user's role for permission checking
      const user = await this.getUser(userId);
      const userRoleId = user?.roleId;

      // Build where conditions
      const conditions = [
        eq(schema.dashboardViews.companyId, companyId),
        or(
          eq(schema.dashboardViews.creatorId, userId),
          eq(schema.dashboardViews.visibility, "everyone"),
          eq(schema.dashboardViews.isCompanyDefault, true), // Company default is always visible
          and(
            eq(schema.dashboardViews.visibility, "by_role"),
            userRoleId ? eq(schema.dashboardViewPermissions.roleId, userRoleId) : sql`false`
          ),
          and(
            eq(schema.dashboardViews.visibility, "by_user"),
            eq(schema.dashboardViewPermissions.userId, userId)
          )
        )
      ];

      // Add viewType filter if specified
      if (viewType) {
        conditions.push(eq(schema.dashboardViews.viewType, viewType));
      }

      // Get all views the user can access
      const views = await db.select()
        .from(schema.dashboardViews)
        .leftJoin(schema.dashboardViewPermissions, eq(schema.dashboardViews.id, schema.dashboardViewPermissions.viewId))
        .where(and(...conditions))
        .orderBy(
          desc(schema.dashboardViews.isCompanyDefault), // Company defaults first
          asc(schema.dashboardViews.sortOrder), 
          asc(schema.dashboardViews.name)
        );

      // De-duplicate views (join can create duplicates)
      const uniqueViews = new Map<string, DashboardView>();
      for (const row of views) {
        if (!uniqueViews.has(row.dashboard_views.id)) {
          uniqueViews.set(row.dashboard_views.id, row.dashboard_views);
        }
      }
      return Array.from(uniqueViews.values());
    } catch (error) {
      console.error("Database error in getDashboardViews:", error);
      throw error;
    }
  }

  async getCompanyDefaultDashboard(companyId: string, viewType: "personal" | "business"): Promise<DashboardView | undefined> {
    try {
      const [view] = await db.select()
        .from(schema.dashboardViews)
        .where(and(
          eq(schema.dashboardViews.companyId, companyId),
          eq(schema.dashboardViews.viewType, viewType),
          eq(schema.dashboardViews.isCompanyDefault, true)
        ))
        .limit(1);
      return view;
    } catch (error) {
      console.error("Database error in getCompanyDefaultDashboard:", error);
      throw error;
    }
  }

  async getDashboardView(id: string, companyId: string): Promise<DashboardView | undefined> {
    try {
      const [view] = await db.select()
        .from(schema.dashboardViews)
        .where(and(
          eq(schema.dashboardViews.id, id),
          eq(schema.dashboardViews.companyId, companyId)
        ))
        .limit(1);
      return view;
    } catch (error) {
      console.error("Database error in getDashboardView:", error);
      throw error;
    }
  }

  async createDashboardView(view: InsertDashboardView & { companyId: string; creatorId: string }): Promise<DashboardView> {
    try {
      const [result] = await db.insert(schema.dashboardViews).values({
        ...view,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      return result;
    } catch (error) {
      console.error("Database error in createDashboardView:", error);
      throw error;
    }
  }

  async updateDashboardView(id: string, view: Partial<InsertDashboardView>, companyId: string): Promise<DashboardView | undefined> {
    try {
      const [result] = await db.update(schema.dashboardViews)
        .set({
          ...view,
          updatedAt: new Date(),
        })
        .where(and(
          eq(schema.dashboardViews.id, id),
          eq(schema.dashboardViews.companyId, companyId)
        ))
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in updateDashboardView:", error);
      throw error;
    }
  }

  async setCompanyDefaultView(viewId: string, companyId: string): Promise<void> {
    try {
      // First get the view to determine its type
      const view = await this.getDashboardView(viewId, companyId);
      if (!view) {
        throw new Error("Dashboard view not found");
      }

      // Clear any existing company default for this view type
      await db.update(schema.dashboardViews)
        .set({ isCompanyDefault: false, updatedAt: new Date() })
        .where(and(
          eq(schema.dashboardViews.companyId, companyId),
          eq(schema.dashboardViews.viewType, view.viewType),
          eq(schema.dashboardViews.isCompanyDefault, true)
        ));

      // Set the new company default
      await db.update(schema.dashboardViews)
        .set({ isCompanyDefault: true, visibility: "everyone", updatedAt: new Date() })
        .where(and(
          eq(schema.dashboardViews.id, viewId),
          eq(schema.dashboardViews.companyId, companyId)
        ));
    } catch (error) {
      console.error("Database error in setCompanyDefaultView:", error);
      throw error;
    }
  }

  async deleteDashboardView(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.dashboardViews)
        .where(and(
          eq(schema.dashboardViews.id, id),
          eq(schema.dashboardViews.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteDashboardView:", error);
      throw error;
    }
  }

  // Dashboard View Permissions CRUD
  async getDashboardViewPermissions(viewId: string): Promise<DashboardViewPermission[]> {
    try {
      return await db.select()
        .from(schema.dashboardViewPermissions)
        .where(eq(schema.dashboardViewPermissions.viewId, viewId));
    } catch (error) {
      console.error("Database error in getDashboardViewPermissions:", error);
      throw error;
    }
  }

  async setDashboardViewPermissions(viewId: string, permissions: { roleIds?: string[]; userIds?: string[] }): Promise<void> {
    try {
      // Delete existing permissions
      await db.delete(schema.dashboardViewPermissions)
        .where(eq(schema.dashboardViewPermissions.viewId, viewId));

      // Insert new role permissions
      if (permissions.roleIds && permissions.roleIds.length > 0) {
        await db.insert(schema.dashboardViewPermissions).values(
          permissions.roleIds.map(roleId => ({
            viewId,
            roleId,
            createdAt: new Date(),
          }))
        );
      }

      // Insert new user permissions
      if (permissions.userIds && permissions.userIds.length > 0) {
        await db.insert(schema.dashboardViewPermissions).values(
          permissions.userIds.map(userId => ({
            viewId,
            userId,
            createdAt: new Date(),
          }))
        );
      }
    } catch (error) {
      console.error("Database error in setDashboardViewPermissions:", error);
      throw error;
    }
  }

  // User Dashboard Preferences
  async getUserDashboardPreference(userId: string, companyId: string): Promise<UserDashboardPreference | undefined> {
    try {
      const [pref] = await db.select()
        .from(schema.userDashboardPreferences)
        .where(and(
          eq(schema.userDashboardPreferences.userId, userId),
          eq(schema.userDashboardPreferences.companyId, companyId)
        ))
        .limit(1);
      return pref;
    } catch (error) {
      console.error("Database error in getUserDashboardPreference:", error);
      throw error;
    }
  }

  async setUserDashboardPreference(userId: string, companyId: string, activeViewId: string | null): Promise<UserDashboardPreference> {
    try {
      const existing = await this.getUserDashboardPreference(userId, companyId);
      
      if (existing) {
        const [updated] = await db.update(schema.userDashboardPreferences)
          .set({
            activeViewId,
            updatedAt: new Date(),
          })
          .where(eq(schema.userDashboardPreferences.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(schema.userDashboardPreferences).values({
          userId,
          companyId,
          activeViewId,
          updatedAt: new Date(),
        }).returning();
        return created;
      }
    } catch (error) {
      console.error("Database error in setUserDashboardPreference:", error);
      throw error;
    }
  }

  // Dashboard Theme Customization
  async getDashboardTheme(userId: string, companyId: string, dashboardType: string, projectId?: string): Promise<import("@shared/schema").DashboardTheme | undefined> {
    try {
      const conditions = [
        eq(schema.dashboardThemes.companyId, companyId),
        eq(schema.dashboardThemes.dashboardType, dashboardType),
      ];
      
      if (userId) {
        conditions.push(eq(schema.dashboardThemes.userId, userId));
      }
      
      if (projectId) {
        conditions.push(eq(schema.dashboardThemes.projectId, projectId));
      } else {
        conditions.push(isNull(schema.dashboardThemes.projectId));
      }
      
      const [theme] = await db.select()
        .from(schema.dashboardThemes)
        .where(and(...conditions))
        .limit(1);
      return theme;
    } catch (error) {
      console.error("Database error in getDashboardTheme:", error);
      throw error;
    }
  }

  async saveDashboardTheme(theme: import("@shared/schema").InsertDashboardTheme): Promise<import("@shared/schema").DashboardTheme> {
    try {
      const existing = await this.getDashboardTheme(
        theme.userId || '',
        theme.companyId,
        theme.dashboardType,
        theme.projectId || undefined
      );
      
      if (existing) {
        const [updated] = await db.update(schema.dashboardThemes)
          .set({
            ...theme,
            updatedAt: new Date(),
          })
          .where(eq(schema.dashboardThemes.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(schema.dashboardThemes)
          .values(theme)
          .returning();
        return created;
      }
    } catch (error) {
      console.error("Database error in saveDashboardTheme:", error);
      throw error;
    }
  }

  async deleteDashboardTheme(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.dashboardThemes)
        .where(and(
          eq(schema.dashboardThemes.id, id),
          eq(schema.dashboardThemes.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteDashboardTheme:", error);
      throw error;
    }
  }

  // Business Dashboard Views with Access Control
  async getBusinessDashboardViews(companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView[]> {
    try {
      const views = await db.select()
        .from(schema.businessDashboardViews)
        .where(eq(schema.businessDashboardViews.companyId, companyId))
        .orderBy(schema.businessDashboardViews.displayOrder);
      
      // Filter by access control
      return views.filter(view => {
        // Everyone can see views with "everyone" visibility
        if (view.visibility === "everyone") return true;
        // Creator can always see their own views
        if (view.createdById === userId) return true;
        // Private views only visible to creator
        if (view.visibility === "private") return view.createdById === userId;
        // Role-based access
        if (view.visibility === "roles" && roleId && view.allowedRoleIds) {
          return view.allowedRoleIds.includes(roleId);
        }
        // User-based access
        if (view.visibility === "users" && view.allowedUserIds) {
          return view.allowedUserIds.includes(userId);
        }
        return false;
      });
    } catch (error) {
      console.error("Database error in getBusinessDashboardViews:", error);
      throw error;
    }
  }

  async getBusinessDashboardView(id: string, companyId: string, userId: string, roleId: string | null): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    try {
      const [view] = await db.select()
        .from(schema.businessDashboardViews)
        .where(and(
          eq(schema.businessDashboardViews.id, id),
          eq(schema.businessDashboardViews.companyId, companyId)
        ));
      
      if (!view) return undefined;
      
      // Check access
      if (view.visibility === "everyone") return view;
      if (view.createdById === userId) return view;
      if (view.visibility === "private") return view.createdById === userId ? view : undefined;
      if (view.visibility === "roles" && roleId && view.allowedRoleIds) {
        return view.allowedRoleIds.includes(roleId) ? view : undefined;
      }
      if (view.visibility === "users" && view.allowedUserIds) {
        return view.allowedUserIds.includes(userId) ? view : undefined;
      }
      return undefined;
    } catch (error) {
      console.error("Database error in getBusinessDashboardView:", error);
      throw error;
    }
  }

  async getBusinessDashboardViewById(id: string, companyId: string): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    try {
      const [view] = await db.select()
        .from(schema.businessDashboardViews)
        .where(and(
          eq(schema.businessDashboardViews.id, id),
          eq(schema.businessDashboardViews.companyId, companyId)
        ));
      return view;
    } catch (error) {
      console.error("Database error in getBusinessDashboardViewById:", error);
      throw error;
    }
  }

  async createBusinessDashboardView(view: import("@shared/schema").InsertBusinessDashboardView): Promise<import("@shared/schema").BusinessDashboardView> {
    try {
      const [created] = await db.insert(schema.businessDashboardViews)
        .values(view)
        .returning();
      return created;
    } catch (error) {
      console.error("Database error in createBusinessDashboardView:", error);
      throw error;
    }
  }

  async updateBusinessDashboardView(id: string, companyId: string, updates: Partial<import("@shared/schema").InsertBusinessDashboardView>): Promise<import("@shared/schema").BusinessDashboardView | undefined> {
    try {
      const [updated] = await db.update(schema.businessDashboardViews)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(
          eq(schema.businessDashboardViews.id, id),
          eq(schema.businessDashboardViews.companyId, companyId)
        ))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateBusinessDashboardView:", error);
      throw error;
    }
  }

  async deleteBusinessDashboardView(id: string, companyId: string): Promise<boolean> {
    try {
      await db.delete(schema.businessDashboardViews)
        .where(and(
          eq(schema.businessDashboardViews.id, id),
          eq(schema.businessDashboardViews.companyId, companyId)
        ));
      return true;
    } catch (error) {
      console.error("Database error in deleteBusinessDashboardView:", error);
      throw error;
    }
  }

  async ensureDefaultBusinessDashboardView(companyId: string): Promise<import("@shared/schema").BusinessDashboardView> {
    try {
      // Check if default view exists
      const [existing] = await db.select()
        .from(schema.businessDashboardViews)
        .where(and(
          eq(schema.businessDashboardViews.companyId, companyId),
          eq(schema.businessDashboardViews.isDefault, true)
        ));
      
      if (existing) return existing;
      
      // Create default view with standard widgets
      const defaultWidgets = [
        { id: "1", type: "businessKPIs", title: "Business KPIs", size: "xl", dimensions: { columns: 8 } },
        { id: "2", type: "businessQuickActions", title: "Quick Actions", size: "sm", dimensions: { columns: 2 } },
        { id: "3", type: "businessActivity", title: "Recent Activity", size: "md", dimensions: { columns: 3 } },
        { id: "4", type: "businessAlerts", title: "Alerts & Reminders", size: "md", dimensions: { columns: 3 } },
        { id: "5", type: "businessProjects", title: "Active Projects", size: "lg", dimensions: { columns: 4 } },
        { id: "6", type: "businessTeam", title: "Team Overview", size: "md", dimensions: { columns: 4 } },
        { id: "7", type: "businessFinancials", title: "Financial Summary", size: "md", dimensions: { columns: 4 } },
        { id: "8", type: "businessTimesheets", title: "Timesheets", size: "md", dimensions: { columns: 4 } },
      ];
      
      const [created] = await db.insert(schema.businessDashboardViews)
        .values({
          companyId,
          name: "Overview",
          isDefault: true,
          widgets: defaultWidgets,
          visibility: "everyone",
          displayOrder: 0,
        })
        .returning();
      
      return created;
    } catch (error) {
      console.error("Database error in ensureDefaultBusinessDashboardView:", error);
      throw error;
    }
  }

  // In-App Notifications
  async getNotifications(userId: string, companyId: string, options?: { limit?: number; unreadOnly?: boolean }): Promise<InAppNotification[]> {
    try {
      let query = db.select()
        .from(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.companyId, companyId),
          ...(options?.unreadOnly ? [eq(schema.notifications.isRead, false)] : [])
        ))
        .orderBy(desc(schema.notifications.createdAt));
      
      if (options?.limit) {
        query = query.limit(options.limit) as any;
      }
      
      return await query;
    } catch (error) {
      console.error("Database error in getNotifications:", error);
      throw error;
    }
  }

  async getNotification(id: string, userId: string): Promise<InAppNotification | undefined> {
    try {
      const [notification] = await db.select()
        .from(schema.notifications)
        .where(and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.userId, userId)
        ))
        .limit(1);
      return notification;
    } catch (error) {
      console.error("Database error in getNotification:", error);
      throw error;
    }
  }

  async createNotification(notification: InsertNotification): Promise<InAppNotification> {
    try {
      const [created] = await db.insert(schema.notifications)
        .values(notification)
        .returning();
      return created;
    } catch (error) {
      console.error("Database error in createNotification:", error);
      throw error;
    }
  }

  async markNotificationAsRead(id: string, userId: string): Promise<InAppNotification | undefined> {
    try {
      const [updated] = await db.update(schema.notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.userId, userId)
        ))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in markNotificationAsRead:", error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string, companyId: string): Promise<number> {
    try {
      const result = await db.update(schema.notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.companyId, companyId),
          eq(schema.notifications.isRead, false)
        ));
      return (result as any).rowCount || 0;
    } catch (error) {
      console.error("Database error in markAllNotificationsAsRead:", error);
      throw error;
    }
  }

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.notifications)
        .where(and(
          eq(schema.notifications.id, id),
          eq(schema.notifications.userId, userId)
        ));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Database error in deleteNotification:", error);
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string, companyId: string): Promise<number> {
    try {
      const [result] = await db.select({ count: sql<number>`count(*)` })
        .from(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.companyId, companyId),
          eq(schema.notifications.isRead, false)
        ));
      return Number(result?.count || 0);
    } catch (error) {
      console.error("Database error in getUnreadNotificationCount:", error);
      throw error;
    }
  }
}

// Create and initialize storage
const dbStorage = new DbStorage();

// Initialize storage and export
export const storage = dbStorage;

// Initialize storage on startup
dbStorage.initialize().catch(console.error);
