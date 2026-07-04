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
  type SelectionComment, type InsertSelectionComment,
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
  type TaskComment, type InsertTaskComment,
  type TaskActivity, type InsertTaskActivity,
  type Bill, type InsertBill,
  type BillLineItem, type InsertBillLineItem,
  type BillPayment, type InsertBillPayment,
  type BillApproval, type InsertBillApproval,
  type Variation, type InsertVariation,
  type VariationItem, type InsertVariationItem,
  type ClientInvoice, type InsertClientInvoice,
  type ClientInvoiceItem, type InsertClientInvoiceItem,
  type ClientInvoicePayment, type InsertClientInvoicePayment,
  type InvoiceEstimate, type InsertInvoiceEstimate,
  type InvoiceVariation, type InsertInvoiceVariation,
  type InvoiceAllowance, type InsertInvoiceAllowance,
  type InvoiceBill, type InsertInvoiceBill,
  type InvoiceTimesheet, type InsertInvoiceTimesheet,
  type VariationBill, type InsertVariationBill,
  type VariationTimesheet, type InsertVariationTimesheet,
  type InvoiceSelection, type InsertInvoiceSelection,
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
  type ProposalPaymentMilestone, type InsertProposalPaymentMilestone,
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
  type ScopeItemTypeDefinition, type InsertScopeItemTypeDefinition,
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
  type TemplateCategory, type InsertTemplateCategory,
  type SelectionTemplateGroup, type InsertSelectionTemplateGroup,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { PasswordUtils } from "./utils/auth";
import { generateRecurringTaskInstances, getRecurringTaskKey, generateNextRecurringInstance } from "./utils/recurringTasks";
import { db } from "./db";
import { eq, or, and, desc, asc, gte, lte, sql, inArray, isNull, isNotNull, gt, not, ne } from "drizzle-orm";
import * as schema from "@shared/schema";
import { computeEstimateItemPrice, computeEstimateSummary, estimateItemBuilderCostExTax, resolveEstimateStoredPrice } from "@shared/pricing";
import { computeBillTotalsCents, billLineExGstCents } from "@shared/billTotals";

// --- Timezone helpers (used by clockIn/clockOut and backfill) ---
export function formatHHmmInTz(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
}

export function calendarDateMidnightUtcInTz(d: Date, tz: string): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find(p => p.type === 'year')?.value;
    const m = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (y && m && day) return new Date(`${y}-${m}-${day}T00:00:00.000Z`);
  } catch {}
  return d;
}
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
import type { PushToken, InsertPushToken } from "@shared/schema";
import type { Suggestion, InsertSuggestion, SuggestionWithMeta } from "@shared/schema";
import type { PaymentTermsOption, InsertPaymentTermsOption } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

// Thrown by createProposalRevision when the parent proposal is in a state that
// disallows revision (e.g. still draft, already superseded). Routes catch this
// to map to HTTP 400 instead of 500.
export class InvalidProposalStateError extends Error {
  readonly code = 'INVALID_STATE';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProposalStateError';
  }
}

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
  resetDefaultPermissions(companyId: string): Promise<void>;

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
  getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined>;
  deletePasswordResetToken(id: string): Promise<void>;
  
  // Notes CRUD operations
  getNotes(projectId?: string | null, companyId?: string, userId?: string, includeArchived?: boolean): Promise<Note[]>;
  getNote(id: string, companyId?: string): Promise<Note | undefined>;
  getPersonalNotesByUser(userId: string, companyId: string): Promise<{ myNotes: Note[], assignedNotes: Note[] }>;
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
  getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }, companyId?: string): Promise<Task[]>;
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

  // Docs CRUD
  getDocs(companyId: string, folderId?: string | null): Promise<schema.Doc[]>;
  getDoc(id: string): Promise<schema.Doc | undefined>;
  createDoc(data: schema.InsertDoc): Promise<schema.Doc>;
  updateDoc(id: string, data: Partial<schema.InsertDoc>): Promise<schema.Doc | undefined>;
  deleteDoc(id: string): Promise<void>;
  getDocFolders(companyId: string): Promise<schema.DocFolder[]>;
  createDocFolder(data: schema.InsertDocFolder): Promise<schema.DocFolder>;
  updateDocFolder(id: string, data: Partial<schema.InsertDocFolder>): Promise<schema.DocFolder | undefined>;
  deleteDocFolder(id: string): Promise<void>;

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
  applyGroupCostCodeToItems(groupId: string, costCode: string | null, costCategoryId: string | null): Promise<number>;
  
  // Estimate Notes CRUD
  getEstimateNotes(estimateId: string): Promise<EstimateNote[]>;
  createEstimateNote(note: InsertEstimateNote): Promise<EstimateNote>;
  deleteEstimateNote(id: string): Promise<boolean>;

  // E-Notes (estimate scope checklist)
  getEstimateEnotes(estimateId: string): Promise<any[]>;
  createEstimateEnote(data: any): Promise<any>;
  updateEstimateEnote(id: string, data: Partial<any>): Promise<any>;
  deleteEstimateEnote(id: string): Promise<{ success: boolean; reason?: string }>;

  // E-Note Attachments
  getEnoteAttachmentCounts(estimateId: string): Promise<Record<string, number>>;
  getEnoteAttachments(enoteId: string): Promise<any[]>;
  createEnoteAttachment(data: any): Promise<any>;
  deleteEnoteAttachment(id: string): Promise<boolean>;

  // HBCF Project Tracker
  getHbcfProjects(companyId: string): Promise<any[]>;
  createHbcfProject(data: any): Promise<any>;
  updateHbcfProject(id: string, data: Partial<any>): Promise<any>;
  deleteHbcfProject(id: string): Promise<boolean>;

  // Labour Estimates
  getLabourEstimate(projectId: string, companyId: string): Promise<any | undefined>;
  createLabourEstimate(data: any): Promise<any>;
  updateLabourEstimate(id: string, data: Partial<any>): Promise<any>;
  getLabourEstimateCategories(labourEstimateId: string): Promise<any[]>;
  createLabourEstimateCategory(labourEstimateId: string, name: string): Promise<any>;
  updateLabourEstimateCategory(id: string, data: Partial<any>): Promise<any>;
  deleteLabourEstimateCategory(id: string): Promise<boolean>;
  reorderLabourEstimateCategories(updates: { id: string; sortOrder: number }[]): Promise<void>;
  getLabourEstimateTasks(categoryId: string): Promise<any[]>;
  createLabourEstimateTask(data: any): Promise<any>;
  updateLabourEstimateTask(id: string, data: Partial<any>): Promise<any>;
  deleteLabourEstimateTask(id: string): Promise<boolean>;
  reorderLabourEstimateTasks(updates: { id: string; sortOrder: number }[]): Promise<void>;
  getLabourTaskTemplates(companyId: string, categoryName?: string): Promise<any[]>;
  createLabourTaskTemplate(data: any): Promise<any>;
  updateLabourTaskTemplate(id: string, data: Partial<any>): Promise<any>;
  deleteLabourTaskTemplate(id: string): Promise<boolean>;
  reorderLabourTaskTemplates(updates: { id: string; sortOrder: number }[]): Promise<void>;
  applyLabourTemplate(companyId: string, categoryId: string, categoryName: string): Promise<any[]>;
  copyCategoryToTemplate(companyId: string, categoryId: string, categoryName: string): Promise<any[]>;
  getEnoteTemplates(companyId: string): Promise<any[]>;
  createEnoteTemplate(data: any): Promise<any>;
  updateEnoteTemplate(id: string, data: Partial<any>): Promise<any>;
  deleteEnoteTemplate(id: string): Promise<boolean>;
  
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
  bulkUpdateCostCodes(ids: string[], updates: Partial<InsertCostCode>, companyId: string): Promise<CostCode[]>;
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
  getEstimateVersions(estimateId: string): Promise<Estimate[]>;
  lockEstimate(estimateId: string): Promise<Estimate | undefined>;
  unlockEstimate(estimateId: string): Promise<Estimate | undefined>;
  // Status transitions — bypass the isLocked update guard so approve/contract
  // can be applied to a locked estimate, and so unlock-to-edit doesn't strip
  // the approved/contract status.
  updateEstimateStatus(estimateId: string, patch: Partial<Estimate>): Promise<Estimate | undefined>;
  promoteEstimateToContract(estimateId: string, userId: string): Promise<Estimate | undefined>;
  // Stage 1: promote an estimate to "approved" — it becomes the project's
  // selected estimate and its full total is stamped onto projects.contractPrice,
  // but it stays UNLOCKED (editable) so the contract price tracks edits live.
  // Refuses if a DIFFERENT estimate on the project is already a locked contract.
  approveEstimate(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined>;
  // Stage 2: lock an approved estimate as the contract — freezes the price,
  // sets isLocked + contracted audit fields, demotes any prior contract.
  markEstimateAsContract(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined>;
  // Idempotent backfill: recompute projects.contractPrice from the selected
  // estimate's canonical total wherever the cached snapshot has drifted.
  recomputeContractPriceSnapshots(): Promise<{ scanned: number; updated: number }>;
  
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

  // Scope Item Type Definitions CRUD
  getScopeItemTypeDefinitions(companyId: string): Promise<ScopeItemTypeDefinition[]>;
  getScopeItemTypeDefinitionById(id: string): Promise<ScopeItemTypeDefinition | undefined>;
  createScopeItemTypeDefinition(def: InsertScopeItemTypeDefinition): Promise<ScopeItemTypeDefinition>;
  updateScopeItemTypeDefinition(id: string, def: Partial<InsertScopeItemTypeDefinition>): Promise<ScopeItemTypeDefinition | undefined>;
  deleteScopeItemTypeDefinition(id: string): Promise<boolean>;
  reorderScopeItemTypeDefinitions(orderedIds: string[], companyId: string): Promise<void>;
  renameScopeItemTypeOnItems(companyId: string, oldName: string, newName: string): Promise<void>;
  seedDefaultScopeItemTypes(companyId: string): Promise<ScopeItemTypeDefinition[]>;

  // Scope Items CRUD (the DNA of every job)
  getScopeItems(projectId: string): Promise<ScopeItem[]>;
  getScopeItem(id: string): Promise<ScopeItem | undefined>;
  createScopeItem(item: InsertScopeItem): Promise<ScopeItem>;
  bulkCreateScopeItems(items: InsertScopeItem[]): Promise<ScopeItem[]>;
  updateScopeItem(id: string, item: Partial<InsertScopeItem>): Promise<ScopeItem | undefined>;
  bulkUpdateScopeItemsInStage(projectId: string, stageName: string, update: Partial<InsertScopeItem>): Promise<void>;
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
  repairDuplicateScopeStages(): Promise<{ projectsScanned: number; duplicatesRemoved: number }>;
  
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
  getCompanyByStripeCustomerId(customerId: string): Promise<import("@shared/schema").Company | undefined>;
  createCompany(company: import("@shared/schema").InsertCompany, ownerId: string): Promise<import("@shared/schema").Company>;
  updateCompany(id: string, company: Partial<import("@shared/schema").InsertCompany>): Promise<import("@shared/schema").Company | undefined>;
  expireLapsedTrials(): Promise<{ expired: number }>;
  
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
  getSelectionByEstimateItemId(estimateItemId: string): Promise<Selection | undefined>;
  getSelectionWithOptions(id: string): Promise<SelectionWithOptions | undefined>;
  getSelectionsWithOptions(projectId: string): Promise<SelectionWithOptions[]>;
  createSelection(selection: InsertSelection): Promise<Selection>;
  updateSelection(id: string, selection: Partial<InsertSelection>): Promise<Selection | undefined>;
  deleteSelection(id: string): Promise<boolean>;
  batchUpdateSelectionSortOrder(updates: { id: string; sortOrder: number }[]): Promise<void>;

  // Selection Options CRUD
  getSelectionOptions(selectionId: string): Promise<SelectionOption[]>;
  getSelectionOption(id: string): Promise<SelectionOption | undefined>;
  createSelectionOption(option: InsertSelectionOption): Promise<SelectionOption>;
  updateSelectionOption(id: string, option: Partial<InsertSelectionOption>): Promise<SelectionOption | undefined>;
  deleteSelectionOption(id: string): Promise<boolean>;

  approveSelectionOption(id: string, userId: string, userName: string): Promise<SelectionOption | undefined>;
  unapproveSelectionOption(id: string): Promise<SelectionOption | undefined>;

  // Option Attachments CRUD
  getOptionAttachments(optionId: string): Promise<OptionAttachment[]>;
  getOptionAttachmentById(id: string): Promise<OptionAttachment | undefined>;
  createOptionAttachment(attachment: InsertOptionAttachment): Promise<OptionAttachment>;
  updateOptionAttachment(id: string, data: Partial<InsertOptionAttachment>): Promise<OptionAttachment | undefined>;
  deleteOptionAttachment(id: string): Promise<boolean>;

  // Client Selections CRUD  
  getClientSelections(projectId: string): Promise<ClientSelection[]>;
  createClientSelection(selection: InsertClientSelection): Promise<ClientSelection>;
  deleteClientSelection(id: string): Promise<boolean>;
  getClientSelectionBySelectionId(selectionId: string): Promise<ClientSelection | undefined>;

  // Selection Comments CRUD
  getSelectionComments(selectionId: string): Promise<SelectionComment[]>;
  createSelectionComment(comment: InsertSelectionComment): Promise<SelectionComment>;
  deleteSelectionComment(id: string): Promise<boolean>;

  // Product Library CRUD
  getProducts(companyId: string, filters?: { category?: string; search?: string; isActive?: boolean }): Promise<schema.Product[]>;
  getProduct(id: number): Promise<schema.Product | undefined>;
  createProduct(product: schema.InsertProduct): Promise<schema.Product>;
  updateProduct(id: number, product: Partial<schema.InsertProduct>): Promise<schema.Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
  getProductImages(productId: number): Promise<schema.ProductImage[]>;
  createProductImage(image: schema.InsertProductImage): Promise<schema.ProductImage>;
  deleteProductImage(id: number): Promise<boolean>;

  getFirstCompanyId(): Promise<string | undefined>;

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

  // Supplier Name Mappings (invoice name → contact id learned associations)
  getSupplierNameMapping(invoiceNameString: string, companyId: string): Promise<import("@shared/schema").SupplierNameMapping | undefined>;
  createSupplierNameMapping(data: import("@shared/schema").InsertSupplierNameMapping & { companyId: string }): Promise<import("@shared/schema").SupplierNameMapping>;
  getSupplierNameMappings(companyId: string): Promise<import("@shared/schema").SupplierNameMapping[]>;

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
  ensureTaskCommentsTable(): Promise<void>;
  getTaskComments(taskId: string): Promise<TaskComment[]>;
  getTaskCommentById(id: string): Promise<TaskComment | undefined>;
  createTaskComment(comment: InsertTaskComment): Promise<TaskComment>;
  updateTaskComment(id: string, content: string): Promise<TaskComment | undefined>;
  deleteTaskComment(id: string): Promise<boolean>;

  ensureTaskActivityTable(): Promise<void>;
  getTaskActivity(taskId: string): Promise<TaskActivity[]>;
  createTaskActivity(entry: InsertTaskActivity): Promise<TaskActivity>;

  syncCompanyName(): Promise<{ synced: boolean; name?: string }>;
  backfillCompanySettingsCompanyId(): Promise<{ updated: boolean }>;
  healUserRoleNameCache(): Promise<{ updated: number }>;
  // Bills CRUD
  getBills(projectId?: string | null, status?: string, companyId?: string): Promise<Bill[]>;
  backfillBillsCompanyId(): Promise<{ updated: number }>;
  getBillById(id: string): Promise<Bill | null>;
  getBillByXeroId(xeroInvoiceId: string, companyId?: string): Promise<Bill | null>;
  getBillByGmailMessageId(messageId: string): Promise<Bill | null>;
  getNextBillNumber(): Promise<string>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: string, bill: Partial<InsertBill>): Promise<Bill>;
  deleteBill(id: string): Promise<void>;
  appendBillAttachment(id: string, attachment: import("@shared/schema").BillAttachment): Promise<Bill>;
  removeBillAttachment(id: string, objectPath: string): Promise<Bill>;
  
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
  canUserViewAllBills(userId: string): Promise<boolean>;
  canUserApproveTimesheets(userId: string): Promise<boolean>;
  canUserViewTimesheetRates(userId: string): Promise<boolean>;

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
  getNextClientInvoiceNumber(prefix: string, startNumber: number): Promise<string>;
  getClientInvoiceNumbersByPrefix(prefix: string): Promise<string[]>;
  getClientInvoice(id: string): Promise<ClientInvoice | undefined>;
  getClientInvoiceByXeroId(xeroInvoiceId: string): Promise<ClientInvoice | undefined>;
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
  voidClientInvoicePayment(id: string): Promise<ClientInvoicePayment | undefined>;
  syncClientInvoicePaidStatus(invoiceId: string): Promise<void>;
  healVoidedClientInvoicePaidAmounts(): Promise<{ fixed: number }>;

  // Bill Payments CRUD
  getBillPayments(billId: string): Promise<BillPayment[]>;
  getBillPaymentById(id: string): Promise<BillPayment | undefined>;
  createBillPayment(payment: InsertBillPayment): Promise<BillPayment>;
  deleteBillPayment(id: string): Promise<boolean>;
  voidBillPayment(id: string): Promise<BillPayment | undefined>;
  syncBillPaidStatus(billId: string): Promise<void>;
  recomputeBillTotals(billId: string): Promise<boolean>;

  // Invoice-Estimate Junction Table
  getInvoiceEstimates(invoiceId: string): Promise<InvoiceEstimate[]>;
  createInvoiceEstimate(data: InsertInvoiceEstimate): Promise<InvoiceEstimate>;
  deleteInvoiceEstimate(id: string): Promise<boolean>;

  // Invoice-Variation Junction Table
  getInvoiceVariations(invoiceId: string): Promise<InvoiceVariation[]>;
  getInvoiceVariationsByProject(projectId: string): Promise<Array<{ variationId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>>;
  createInvoiceVariation(data: InsertInvoiceVariation): Promise<InvoiceVariation>;
  updateInvoiceVariation(id: string, data: Partial<InsertInvoiceVariation>): Promise<InvoiceVariation | undefined>;
  deleteInvoiceVariation(id: string): Promise<boolean>;

  // Invoice-Allowance Junction Table
  getInvoiceAllowances(invoiceId: string): Promise<InvoiceAllowance[]>;
  getInvoiceAllowancesByProject(projectId: string): Promise<Array<{ estimateItemId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>>;
  createInvoiceAllowance(data: InsertInvoiceAllowance): Promise<InvoiceAllowance>;
  updateInvoiceAllowance(id: string, data: Partial<InsertInvoiceAllowance>): Promise<InvoiceAllowance | undefined>;
  deleteInvoiceAllowance(id: string): Promise<boolean>;

  // Variation-Bill Junction Table
  getVariationBills(variationId: string): Promise<any[]>;
  createVariationBill(data: InsertVariationBill): Promise<VariationBill>;
  deleteVariationBillsByVariationId(variationId: string): Promise<void>;

  // Variation-Timesheet Junction Table
  getVariationTimesheets(variationId: string): Promise<any[]>;
  createVariationTimesheet(data: InsertVariationTimesheet): Promise<VariationTimesheet>;
  deleteVariationTimesheetsByVariationId(variationId: string): Promise<void>;

  // Invoice-Bill Junction Table
  getInvoiceBills(invoiceId: string): Promise<InvoiceBill[]>;
  createInvoiceBill(data: InsertInvoiceBill): Promise<InvoiceBill>;
  deleteInvoiceBill(id: string): Promise<boolean>;

  // Invoice-Timesheet Junction Table
  getInvoiceTimesheets(invoiceId: string): Promise<any[]>;
  createInvoiceTimesheet(data: InsertInvoiceTimesheet): Promise<InvoiceTimesheet>;
  deleteInvoiceTimesheet(id: string): Promise<boolean>;

  // Invoice-Selection Junction Table
  getInvoiceSelections(invoiceId: string): Promise<any[]>;
  createInvoiceSelection(data: InsertInvoiceSelection): Promise<InvoiceSelection>;
  deleteInvoiceSelection(id: string): Promise<boolean>;

  // Proposals CRUD
  getProposals(projectId?: string, status?: string, parentProposalId?: string): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(proposal: InsertProposal): Promise<Proposal>;
  createProposalAtomic(proposal: Omit<InsertProposal, 'proposalNumber'>): Promise<Proposal>;
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

  // Proposal Payment Milestones CRUD
  getProposalPaymentMilestones(proposalId: string): Promise<ProposalPaymentMilestone[]>;
  createProposalPaymentMilestone(m: InsertProposalPaymentMilestone): Promise<ProposalPaymentMilestone>;
  updateProposalPaymentMilestone(id: string, m: Partial<InsertProposalPaymentMilestone>): Promise<ProposalPaymentMilestone | undefined>;
  deleteProposalPaymentMilestone(id: string): Promise<boolean>;
  replaceProposalPaymentMilestones(proposalId: string, items: InsertProposalPaymentMilestone[]): Promise<ProposalPaymentMilestone[]>;

  // Proposal revisions / numbering / snapshots
  getNextProposalNumber(): Promise<string>;
  createProposalRevision(parentId: string, overrides?: Partial<InsertProposal>): Promise<Proposal>;
  recordProposalView(id: string, device?: string | null): Promise<Proposal | undefined>;
  reorderProposalPaymentMilestones(proposalId: string, orderedIds: string[]): Promise<ProposalPaymentMilestone[]>;

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
  getChecklistTemplates(roleId?: string, companyId?: string): Promise<ChecklistTemplate[]>;
  getChecklistTemplate(id: string): Promise<ChecklistTemplate | undefined>;
  createChecklistTemplate(template: InsertChecklistTemplate & { companyId?: string | null }): Promise<ChecklistTemplate>;
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
  getChecklistInstances(projectId?: string, userId?: string, isAdmin?: boolean): Promise<ChecklistInstance[]>;
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
  getBudget(projectId: string, tx?: any): Promise<Budget | undefined>;
  createBudget(budget: InsertBudget, tx?: any): Promise<Budget>;
  updateBudget(id: string, budget: Partial<InsertBudget>, tx?: any): Promise<Budget | undefined>;
  deleteBudget(id: string): Promise<boolean>;
  calculateBudget(projectId: string, tx?: any): Promise<Budget | undefined>; // Recalculates from estimates, bills, variations

  // Budget Line Items CRUD
  getBudgetLineItems(budgetId: string): Promise<BudgetLineItem[]>;
  getBudgetLineItem(id: string): Promise<BudgetLineItem | undefined>;
  createBudgetLineItem(item: InsertBudgetLineItem, tx?: any): Promise<BudgetLineItem>;
  updateBudgetLineItem(id: string, item: Partial<InsertBudgetLineItem>): Promise<BudgetLineItem | undefined>;
  deleteBudgetLineItem(id: string): Promise<boolean>;
  recalculateBudgetLineItems(budgetId: string, tx?: any): Promise<BudgetLineItem[]>; // Recalculates all line items

  // Labour Hours Budget CRUD
  getLabourHoursBudget(projectId: string): Promise<LabourHoursBudget[]>;
  recalculateLabourHoursBudget(projectId: string, tx?: any): Promise<LabourHoursBudget[]>; // Recalculates from flagged estimate items
  getProjectIdsWithContractEstimate(companyId: string): Promise<string[]>;

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

  // Labour cost breakdown by cost code (for the Budget cost table's Labour column
  // and its drill-down). Split-aware; reconciles with actual-costs labour total.
  getProjectLabourCostBreakdown(projectId: string): Promise<{
    byCostCode: Array<{ costCodeId: string | null; costCodeTitle: string; categoryTitle: string; labourCents: number }>;
    total: number;
    entries: Array<{
      costCodeId: string | null;
      timesheetId: string;
      workerName: string;
      date: Date;
      hours: number;
      rateCents: number;
      costCents: number;
      status: string;
    }>;
  }>;

  // Schedule CRUD
  getSchedule(projectId: string, category?: string): Promise<Schedule | undefined>;
  getSchedulesByProject(projectId: string): Promise<Schedule[]>;
  getScheduleById(id: string): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;
  updateScheduleStatus(id: string, status: "offline" | "online" | "locked", userId?: string): Promise<Schedule | undefined>;
  updateScheduleOnline(id: string, isOnline: boolean): Promise<Schedule | undefined>;

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

  // Selection Template Groups CRUD
  getSelectionTemplateGroups(companyId: string): Promise<SelectionTemplateGroup[]>;
  createSelectionTemplateGroup(group: InsertSelectionTemplateGroup & { companyId: string }): Promise<SelectionTemplateGroup>;
  updateSelectionTemplateGroup(id: string, group: Partial<InsertSelectionTemplateGroup>, companyId: string): Promise<SelectionTemplateGroup | undefined>;
  deleteSelectionTemplateGroup(id: string, companyId: string): Promise<boolean>;
  replaceTemplateGroups(templateId: string, groupIds: string[], companyId: string): Promise<void>;
  addTemplateGroupMembership(templateId: string, groupId: string, companyId: string): Promise<void>;
  removeTemplateGroupMembership(templateId: string, groupId: string, companyId: string): Promise<void>;

  // Calendar Views CRUD
  getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]>;
  getCalendarView(id: string, companyId: string): Promise<CalendarView | undefined>;
  createCalendarView(view: InsertCalendarView): Promise<CalendarView>;
  findOrCreateCalendarView(view: InsertCalendarView & { userId: string; companyId: string }): Promise<CalendarView>;
  updateCalendarView(id: string, view: Partial<InsertCalendarView>, companyId: string): Promise<CalendarView | undefined>;
  deleteCalendarView(id: string, companyId: string): Promise<boolean>;

  // Focus Blocks CRUD
  getFocusBlocks(userId: string, companyId: string): Promise<schema.FocusBlock[]>;
  getFocusBlock(id: string, companyId: string): Promise<schema.FocusBlock | undefined>;
  createFocusBlock(block: schema.InsertFocusBlockWithOwner): Promise<schema.FocusBlock>;
  updateFocusBlock(id: string, block: Partial<schema.InsertFocusBlock>, companyId: string): Promise<schema.FocusBlock | undefined>;
  deleteFocusBlock(id: string, companyId: string): Promise<boolean>;
  getFocusBlockTasks(blockId: string, companyId: string, limit?: number, userId?: string): Promise<schema.Task[]>;

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
  getMessageReplies(messageId: string): Promise<Message[]>;
  getPinnedMessages(channelId: string): Promise<Message[]>;
  toggleMessagePin(messageId: string, userId: string, isChannelOwner: boolean): Promise<Message | { error: string } | undefined>;
  // Scheduled messages
  getPendingScheduledMessages(): Promise<Message[]>;
  getChannelScheduledMessages(channelId: string, userId: string): Promise<Message[]>;
  cancelScheduledMessage(messageId: string, userId: string): Promise<Message | undefined>;
  updateScheduledMessage(messageId: string, userId: string, updates: { content?: string; scheduledAt?: Date }): Promise<Message | undefined>;
  markScheduledMessagesSent(messageIds: string[], sendTime?: Date): Promise<void>;
  // Message Reactions
  getMessageReactions(messageId: string): Promise<schema.MessageReaction[]>;
  getChannelReactions(channelId: string): Promise<Record<string, schema.MessageReaction[]>>;
  toggleMessageReaction(messageId: string, userId: string, emoji: string, userFirstName: string | null, userLastName: string | null): Promise<{ reactions: schema.MessageReaction[]; action: 'added' | 'removed'; channelId: string }>;
  // Message Attachments
  createMessageAttachment(attachment: schema.InsertMessageAttachment): Promise<schema.MessageAttachment>;
  getMessageAttachments(messageId: string): Promise<schema.MessageAttachment[]>;
  getAttachmentsForMessages(messageIds: string[]): Promise<Record<string, schema.MessageAttachment[]>>;

  // Purchase Orders CRUD
  getPurchaseOrders(companyId: string, projectId?: string, status?: string, poType?: string, workerUserId?: string): Promise<PurchaseOrder[]>;
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
  getNotifications(userId: string, companyId: string, options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<InAppNotification[]>;
  getNotification(id: string, userId: string): Promise<InAppNotification | undefined>;
  createNotification(notification: InsertNotification): Promise<InAppNotification>;
  markNotificationAsRead(id: string, userId: string): Promise<InAppNotification | undefined>;
  markAllNotificationsAsRead(userId: string, companyId: string): Promise<number>;
  deleteNotification(id: string, userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string, companyId: string): Promise<number>;

  // Multi-tenancy safety columns (additive, idempotent)
  ensureTenancyColumns(): Promise<void>;

  // Device Push Tokens (Expo push notifications)
  ensurePushTokensTable(): Promise<void>;
  upsertPushToken(data: { userId: string; token: string; platform?: string; deviceName?: string }): Promise<PushToken>;
  getPushTokensForUser(userId: string): Promise<PushToken[]>;
  deletePushToken(token: string, userId?: string): Promise<boolean>;
  deletePushTokens(tokens: string[]): Promise<number>;

  // Product suggestions (feedback). Identity/company derived server-side.
  ensureSuggestionsTable(): Promise<void>;
  createSuggestion(data: InsertSuggestion & { userId: string; companyId: string | null; roleName: string | null }): Promise<Suggestion>;
  getSuggestions(filters?: { section?: string; status?: string }): Promise<SuggestionWithMeta[]>;
  updateSuggestion(id: string, updates: { status?: string; priority?: string | null; internalNote?: string | null }): Promise<Suggestion | undefined>;

  // Xero Connection operations
  getXeroConnectionByCompanyId(companyId: string): Promise<import("@shared/schema").XeroConnection | undefined>;
  getXeroConnectionByTenantId(tenantId: string): Promise<import("@shared/schema").XeroConnection | undefined>;
  getXeroConnection(id: string): Promise<import("@shared/schema").XeroConnection | undefined>;
  createXeroConnection(data: import("@shared/schema").InsertXeroConnection): Promise<import("@shared/schema").XeroConnection>;
  updateXeroConnection(id: string, data: Partial<import("@shared/schema").XeroConnection>): Promise<import("@shared/schema").XeroConnection | undefined>;
  deleteXeroConnection(id: string): Promise<boolean>;

  // Teams (T006)
  getTeams(companyId: string): Promise<import("@shared/schema").Team[]>;
  getTeam(id: string): Promise<import("@shared/schema").Team | undefined>;
  createTeam(data: import("@shared/schema").InsertTeam): Promise<import("@shared/schema").Team>;
  updateTeam(id: string, data: Partial<import("@shared/schema").InsertTeam>): Promise<import("@shared/schema").Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;

  // Takeoff
  getTakeoffPlans(projectId: string, companyId: string): Promise<import("@shared/schema").TakeoffPlan[]>;
  getTakeoffPlan(id: string, companyId: string): Promise<import("@shared/schema").TakeoffPlan | undefined>;
  createTakeoffPlan(data: import("@shared/schema").InsertTakeoffPlan): Promise<import("@shared/schema").TakeoffPlan>;
  updateTakeoffPlan(id: string, companyId: string, data: Partial<import("@shared/schema").InsertTakeoffPlan>): Promise<import("@shared/schema").TakeoffPlan | undefined>;
  deleteTakeoffPlan(id: string, companyId: string): Promise<void>;

  getTakeoffPlanPages(planId: string): Promise<import("@shared/schema").TakeoffPlanPage[]>;
  getTakeoffPlanPageById(id: string): Promise<import("@shared/schema").TakeoffPlanPage | undefined>;
  getTakeoffMeasurement(id: string, companyId: string): Promise<import("@shared/schema").TakeoffMeasurement | undefined>;
  getTakeoffCategory(id: string, companyId: string): Promise<import("@shared/schema").TakeoffCategory | undefined>;
  getTakeoffPlanPage(planId: string, pageNumber: number): Promise<import("@shared/schema").TakeoffPlanPage | undefined>;
  upsertTakeoffPlanPage(data: import("@shared/schema").InsertTakeoffPlanPage): Promise<import("@shared/schema").TakeoffPlanPage>;

  getTakeoffCategories(projectId: string, companyId: string): Promise<import("@shared/schema").TakeoffCategory[]>;
  createTakeoffCategory(data: import("@shared/schema").InsertTakeoffCategory): Promise<import("@shared/schema").TakeoffCategory>;
  updateTakeoffCategory(id: string, companyId: string, data: Partial<import("@shared/schema").InsertTakeoffCategory>): Promise<import("@shared/schema").TakeoffCategory | undefined>;
  deleteTakeoffCategory(id: string, companyId: string): Promise<void>;

  getTakeoffMeasurements(projectId: string, companyId: string): Promise<import("@shared/schema").TakeoffMeasurement[]>;
  getTakeoffMeasurementsByPage(pageId: string): Promise<import("@shared/schema").TakeoffMeasurement[]>;
  createTakeoffMeasurement(data: import("@shared/schema").InsertTakeoffMeasurement): Promise<import("@shared/schema").TakeoffMeasurement>;
  updateTakeoffMeasurement(id: string, companyId: string, data: Partial<import("@shared/schema").InsertTakeoffMeasurement>): Promise<import("@shared/schema").TakeoffMeasurement | undefined>;
  deleteTakeoffMeasurement(id: string, companyId: string): Promise<void>;

  getTakeoffMarkups(planId: string, pageNumber: number | null, companyId: string): Promise<import("@shared/schema").TakeoffMarkup[]>;
  getTakeoffMarkup(id: string, companyId: string): Promise<import("@shared/schema").TakeoffMarkup | undefined>;
  createTakeoffMarkup(data: import("@shared/schema").InsertTakeoffMarkup): Promise<import("@shared/schema").TakeoffMarkup>;
  updateTakeoffMarkup(id: string, companyId: string, data: Partial<import("@shared/schema").InsertTakeoffMarkup>): Promise<import("@shared/schema").TakeoffMarkup | undefined>;
  deleteTakeoffMarkup(id: string, companyId: string): Promise<void>;
}

/**
 * Returns a map of { permissionId → PermissionAction[] } representing the default
 * permissions for a given built-in role name. Used by both MemStorage and DbStorage
 * when seeding or resetting role permissions.
 */
function getDefaultActionsForRole(
  roleName: string,
  allPermissions: { id: string; key: string; actions: string[] }[],
  permByKey: Record<string, { id: string; key: string; actions: string[] }>,
): Record<string, PermissionAction[]> {
  const n = roleName.toLowerCase();
  const result: Record<string, PermissionAction[]> = {};

  const grant = (key: string, actions: PermissionAction[]) => {
    const p = permByKey[key];
    if (!p) return;
    const available = p.actions as PermissionAction[];
    result[p.id] = actions.filter(a => available.includes(a));
  };

  const grantAll = (key: string) => {
    const p = permByKey[key];
    if (p) result[p.id] = p.actions as PermissionAction[];
  };

  // --- ADMIN / OWNER ---
  if (n.includes('admin') || n.includes('owner') || n.includes('general manager')) {
    for (const p of allPermissions) result[p.id] = p.actions as PermissionAction[];
    return result;
  }

  // --- PROJECT MANAGER / CONSTRUCTION MANAGER ---
  if (n.includes('project manager') || n.includes('construction manager') || n.includes('office manager')) {
    const keys = [
      'projects.view', 'projects.schedule', 'projects.variations', 'projects.todos',
      'projects.invoices', 'projects.site_diary', 'projects.selections', 'projects.timesheet',
      'projects.rfi', 'projects.team_calendars', 'projects.messages', 'projects.notes',
      'projects.contract', 'schedules.view_offline',
      'tasks.manage', 'tasks.project', 'tasks.business',
      'financial.estimate', 'financial.purchase_orders', 'financial.bills',
      'financial.quotes', 'financial.budget_labour', 'financial.budget_actuals',
      'financial.proposal', 'financial.reports',
      'sales.client', 'sales.proposals', 'sales.leads',
      'files.manage', 'timesheets.manage', 'timesheets.rates', 'calendar.manage', 'messages.team', 'leave.manage',
      'dashboard.overview', 'dashboard.financial', 'dashboard.project_health', 'dashboard.team_performance',
      'business.dashboard', 'business.schedule', 'business.files', 'business.calendar',
      'business.messages', 'business.notes', 'business.team', 'business.timesheets',
      'business.leave', 'business.contacts', 'business.purchase_orders', 'business.reports',
    ];
    for (const key of keys) grantAll(key);
    return result;
  }

  // --- SITE SUPERVISOR / FOREMAN ---
  if (n.includes('site supervisor') || n.includes('foreman')) {
    grant('projects.view', ['view']);
    grant('projects.schedule', ['view']);
    grant('projects.todos', ['view', 'add', 'edit', 'delete']);
    grant('projects.site_diary', ['view', 'add', 'edit', 'delete']);
    grant('projects.messages', ['view', 'add', 'send']);
    grant('projects.notes', ['view', 'add', 'edit']);
    grant('projects.timesheet', ['view', 'add', 'edit']);
    grant('projects.rfi', ['view', 'add']);
    grant('tasks.manage', ['view', 'add', 'edit', 'delete']);
    grant('tasks.project', ['view', 'add', 'edit', 'delete']);
    grant('files.manage', ['view', 'add']);
    grant('timesheets.manage', ['view', 'add', 'edit']);
    grant('calendar.manage', ['view']);
    grant('messages.team', ['view', 'add', 'send']);
    grant('leave.manage', ['view', 'add']);
    grant('dashboard.overview', ['view']);
    grant('dashboard.project_health', ['view']);
    grant('business.messages', ['view', 'add', 'send']);
    grant('business.team', ['view']);
    return result;
  }

  // --- ACCOUNTS ---
  if (n.includes('accounts') || n.includes('bookkeeper')) {
    const keys = [
      'financial.estimate', 'financial.purchase_orders', 'financial.bills',
      'financial.quotes', 'financial.budget_labour', 'financial.budget_actuals',
      'financial.proposal', 'financial.reports',
      'projects.invoices', 'projects.view', 'projects.timesheet',
      'admin.cost_codes',
      'dashboard.financial',
      'timesheets.manage', 'timesheets.rates',
    ];
    for (const key of keys) grantAll(key);
    return result;
  }

  // --- CLIENT ---
  if (n.includes('client')) {
    grant('projects.view', ['view']);
    grant('projects.schedule', ['view']);
    grant('projects.invoices', ['view']);
    grant('projects.selections', ['view']);
    grant('projects.site_diary', ['view']);
    grant('projects.messages', ['view', 'add', 'send']);
    return result;
  }

  // --- SUBCONTRACTOR / CARPENTER / APPRENTICE ---
  if (n.includes('subcontractor') || n.includes('carpenter') || n.includes('apprentice')) {
    grant('projects.schedule', ['view']);
    grant('projects.site_diary', ['view', 'add']);
    grant('projects.messages', ['view', 'add', 'send']);
    grant('files.manage', ['view']);
    grant('tasks.manage', ['view']);
    grant('tasks.project', ['view']);
    return result;
  }

  return result;
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
  private passwordResetTokens: Map<string, PasswordResetToken>;
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
  private focusBlocks: Map<string, schema.FocusBlock>;

  constructor() {
    this.users = new Map();
    this.userRoles = new Map();
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.userProjectAccess = new Map();
    this.userInvitations = new Map();
    this.userColumnPreferences = new Map();
    this.userViewPreferences = new Map();
    this.passwordResetTokens = new Map();
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
    this.focusBlocks = new Map();
    this.initializeDefaultRoleSystem();
    this.initializeDefaultCustomFields();
    this.initializeDefaultFieldCategories();
    this.initializeDefaultData();
  }

  // Initialize default role system with built-in roles and permissions
  private initializeDefaultRoleSystem() {
    const builtInPermissions: Array<Omit<Permission, 'id' | 'createdAt'>> = [
      // Admin category
      { key: "admin.users", name: "User (team)", description: "Manage team users", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.suppliers", name: "Sub/Vendor", description: "Manage suppliers/vendors", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.roles", name: "Role", description: "Manage user roles", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.cost_codes", name: "Cost code/category", description: "Manage cost codes", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.terms", name: "Terms and Conditions", description: "Manage terms", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.payment_templates", name: "Payment schedule templates", description: "Manage payment templates", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.company", name: "Company settings", description: "Manage company settings", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.manage_team_members", name: "Manage Team Members", description: "Edit team member profiles and details", category: "admin", actions: ["view", "edit"], isBuiltIn: true },

      // Projects category
      { key: "projects.view", name: "Projects", description: "View projects", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.schedule", name: "Schedule", description: "Manage project schedules", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.variations", name: "Variations", description: "Manage project variations", category: "projects", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "projects.todos", name: "To Dos", description: "Manage project to-dos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.invoices", name: "Progress Claims", description: "Manage client invoices and progress claims", category: "projects", actions: ["view", "add", "edit", "delete", "approve", "send"], isBuiltIn: true },
      { key: "projects.site_diary", name: "Site Diary", description: "Manage site diary", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.selections", name: "Selections and Allowances", description: "Manage selections", category: "projects", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "projects.timesheet", name: "Project Timesheet", description: "Manage per-project timesheets", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.rfi", name: "RFI", description: "Manage RFIs", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.team_calendars", name: "View Team Calendars", description: "View other team members' calendars", category: "projects", actions: ["view"], isBuiltIn: true },
      { key: "projects.messages", name: "Project Messages", description: "Access project messaging", category: "projects", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "projects.notes", name: "Project Notes", description: "Access project notes and memos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.contract", name: "Contracts & Proposals", description: "Manage project contracts and proposals", category: "projects", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },
      { key: "schedules.view_offline", name: "View Offline Schedules", description: "Can see offline (draft) schedules not yet published", category: "projects", actions: ["view"], isBuiltIn: true },

      // Tasks category
      { key: "tasks.manage", name: "Tasks", description: "Manage tasks (with view-scope control)", category: "tasks", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "tasks.project", name: "Project Tasks", description: "Manage tasks within projects", category: "tasks", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "tasks.business", name: "Business Tasks", description: "Manage company-wide business tasks", category: "tasks", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },

      // Financial category
      { key: "financial.estimate", name: "Estimate", description: "Manage estimates", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.purchase_orders", name: "Purchase Orders", description: "Manage purchase orders", category: "financial", actions: ["view", "add", "edit", "delete", "approve", "send"], isBuiltIn: true },
      { key: "financial.bills", name: "Bills", description: "Manage bills", category: "financial", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "financial.budget_labour", name: "Labour Hours Budget", description: "View labour hours tracker (hours worked vs budgeted per cost code)", category: "financial", actions: ["view"], isBuiltIn: true },
      { key: "financial.budget_actuals", name: "Financial Budget", description: "View full cost budget (estimate vs actuals, margins, dollar figures)", category: "financial", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "financial.quotes", name: "Request for Quotes", description: "Manage quotes", category: "financial", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "financial.proposal", name: "Proposal", description: "Manage proposals", category: "financial", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },
      { key: "financial.reports", name: "Financial Reports", description: "Access financial reports and summaries", category: "financial", actions: ["view", "summary_only"], isBuiltIn: true },

      // Sales category
      { key: "sales.client", name: "Client", description: "Manage clients", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "sales.leads", name: "Leads & Prospects", description: "Manage sales leads and prospects", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "sales.proposals", name: "Proposals", description: "Manage sales proposals", category: "sales", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },

      // Team & Operations category
      { key: "files.manage", name: "Files", description: "Manage files and folders", category: "operations", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "timesheets.manage", name: "Timesheets", description: "Manage company-wide timesheets (with view-scope control)", category: "operations", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "timesheets.rates", name: "Labour Rates", description: "View labour cost rates and totals on timesheets", category: "operations", actions: ["view"], isBuiltIn: true },
      { key: "calendar.manage", name: "Calendar", description: "Manage team calendar and scheduling (with view-scope control)", category: "operations", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "messages.team", name: "Team Messaging", description: "Access team-wide messaging", category: "operations", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "leave.manage", name: "Leave", description: "Manage employee leave requests and balances", category: "operations", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },

      // Dashboard & KPIs category
      { key: "dashboard.overview", name: "Overview Dashboard", description: "View the main business overview dashboard", category: "dashboard", actions: ["view"], isBuiltIn: true },
      { key: "dashboard.financial", name: "Financial Metrics", description: "View financial KPIs and metrics dashboard", category: "dashboard", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "dashboard.project_health", name: "Project Health", description: "View project health and status dashboard", category: "dashboard", actions: ["view"], isBuiltIn: true },
      { key: "dashboard.team_performance", name: "Team Performance", description: "View team performance and productivity metrics", category: "dashboard", actions: ["view"], isBuiltIn: true },

      // Business category (13 keys)
      { key: "business.dashboard", name: "Business Dashboard", description: "Access business-level dashboard and KPIs", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.schedule", name: "Business Schedule", description: "Manage company-wide schedule", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.overheads", name: "Overheads", description: "Manage business overhead costs", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.timesheets", name: "Business Timesheets", description: "View company-wide timesheets (with view-scope control)", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.calendar", name: "Business Calendar", description: "Manage business-level calendar (with view-scope control)", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.files", name: "Business Files", description: "Access company-level file library", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.messages", name: "Business Messages", description: "Access company-wide messaging", category: "business", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "business.notes", name: "Business Notes", description: "Manage company notes and memos", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.leave", name: "Leave Management", description: "Manage employee leave requests", category: "business", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "business.team", name: "Team Directory", description: "View team member directory", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.contacts", name: "Business Contacts", description: "Manage company-wide contact directory", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.purchase_orders", name: "Business Purchase Orders", description: "View company-wide purchase order summary", category: "business", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "business.reports", name: "Business Reports", description: "Access company-level reports and analytics", category: "business", actions: ["view", "summary_only"], isBuiltIn: true },
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
      { key: "low", name: "Low", color: "#10B981", isDefault: true },
      { key: "medium", name: "Medium", color: "#F59E0B", isDefault: false },
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
      { companyId, name: "Owner", description: "Full system administration access", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 0 },
      { companyId, name: "Admin", description: "Company administration and management", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 1 },
      { companyId, name: "Project Manager", description: "Project oversight and financial management", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 2 },
      { companyId, name: "Site Supervisor", description: "On-site team lead with field access", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 3 },
      { companyId, name: "Subcontractor", description: "External subcontractor with limited access", userCategory: "supplier", isBuiltIn: true, isActive: true, displayOrder: 4 },
      { companyId, name: "Client", description: "Client portal access — read-only view of project progress", userCategory: "client", isBuiltIn: true, isActive: true, displayOrder: 5 },
      { companyId, name: "Accounts", description: "Financial specialist with full billing and invoicing access", userCategory: "team", isBuiltIn: true, isActive: true, displayOrder: 6 },
    ];

    const now = new Date();
    let ownerRoleId = '';

    const createdRoles: UserRole[] = [];
    for (const roleData of builtInRoles) {
      const roleId = randomUUID();
      const role: UserRole = {
        ...roleData,
        id: roleId,
        createdAt: now,
        updatedAt: now,
      };
      this.userRoles.set(roleId, role);
      createdRoles.push(role);
      if (roleData.name === "Owner") ownerRoleId = roleId;
    }

    // Seed permissions for all roles
    const allPermissions = Array.from(this.permissions.values());
    const permByKey: Record<string, Permission> = {};
    for (const p of allPermissions) permByKey[p.key] = p;

    for (const role of createdRoles) {
      if (role.name === "Owner") {
        // Owner gets full access to everything
        for (const permission of allPermissions) {
          const rp: RolePermission = {
            id: randomUUID(),
            roleId: role.id,
            permissionId: permission.id,
            allowedActions: permission.actions as PermissionAction[],
            createdAt: now,
          };
          this.rolePermissions.set(rp.id, rp);
        }
      } else {
        // Other roles get their default permission matrix
        const defaultActions = getDefaultActionsForRole(role.name, allPermissions, permByKey);
        for (const [permId, actions] of Object.entries(defaultActions)) {
          if (actions.length === 0) continue;
          const rp: RolePermission = {
            id: randomUUID(),
            roleId: role.id,
            permissionId: permId,
            allowedActions: actions as PermissionAction[],
            createdAt: now,
          };
          this.rolePermissions.set(rp.id, rp);
        }
      }
    }

    return ownerRoleId;
  }

  async resetDefaultPermissions(companyId: string): Promise<void> {
    const allPermissions = Array.from(this.permissions.values());
    const permByKey: Record<string, Permission> = {};
    for (const p of allPermissions) permByKey[p.key] = p;

    const companyRoles = Array.from(this.userRoles.values()).filter(r => r.companyId === companyId && r.isBuiltIn);
    const now = new Date();

    for (const role of companyRoles) {
      // Remove existing permissions for this role
      for (const [id, rp] of this.rolePermissions.entries()) {
        if (rp.roleId === role.id) this.rolePermissions.delete(id);
      }

      const defaultActions = getDefaultActionsForRole(role.name, allPermissions, permByKey);
      for (const [permId, actions] of Object.entries(defaultActions)) {
        if (actions.length === 0) continue;
        const rp: RolePermission = {
          id: randomUUID(),
          roleId: role.id,
          permissionId: permId,
          allowedActions: actions as PermissionAction[],
          createdAt: now,
        };
        this.rolePermissions.set(rp.id, rp);
      }
    }
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

    // Grant project access from invitation.projectIds. Mirrors DbStorage:
    //  - tenant check (project.companyId must match invitation.companyId)
    //  - dedupe against existing access
    //  - "edit" access level (matches admin manual-assign default)
    if (invitation.projectIds && Array.isArray(invitation.projectIds)) {
      const requestedProjectIds = (invitation.projectIds as unknown[]).filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      );
      const existing = await this.getUserProjectAccess(newUser.id);
      const existingProjectIds = new Set(existing.map((a) => a.projectId));
      for (const projectId of Array.from(new Set(requestedProjectIds))) {
        if (existingProjectIds.has(projectId)) continue;
        const project = await this.getProject(projectId);
        if (!project || project.companyId !== invitation.companyId) continue;
        await this.grantProjectAccess(newUser.id, projectId, "edit", invitation.invitedBy);
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
    const id = `prt-${Date.now()}`;
    this.passwordResetTokens.set(data.token, { id, ...data, usedAt: null, createdAt: new Date() } as any);
    console.log(`[MemStorage] Password reset token created for user ${data.userId}`);
  }

  async getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined> {
    return this.passwordResetTokens.get(tokenHash);
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    for (const [key, token] of this.passwordResetTokens.entries()) {
      if ((token as any).id === id) {
        this.passwordResetTokens.delete(key);
        break;
      }
    }
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

  async getPersonalNotesByUser(userId: string, companyId: string): Promise<{ myNotes: Note[], assignedNotes: Note[] }> {
    const allNotes = Array.from(this.notes.values());
    
    const myNotes = allNotes.filter(note =>
      note.ownerId === userId && note.scope === 'personal' && note.type === 'note'
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    const assignedNotes = allNotes.filter(note =>
      note.type === 'note' &&
      !note.archivedAt &&
      Array.isArray(note.assigneeIds) && note.assigneeIds.includes(userId) &&
      note.ownerId !== userId
    ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    return { myNotes, assignedNotes };
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
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }, companyId?: string): Promise<Task[]> {
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
    
    if (companyId) {
      filteredTasks = filteredTasks.filter(task => task.companyId === companyId);
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
    
    // Single source of truth: shared/pricing.ts. Preserves a flat/fixed-price
    // allowance line's typed priceIncTax instead of recomputing it to $0.
    const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
      unitCostExTax: insertItem.unitCostExTax,
      quantity: insertItem.quantity,
      markupPercent: insertItem.markupPercent,
      projectMarkupPercent: estimate?.projectMarkupPercent,
      taxRate: estimate?.taxRate,
      existingPriceIncTax: insertItem.priceIncTax,
    });

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

    // Prepare all items with calculated tax via the shared function
    const preparedItems = insertItems.map(insertItem => {
      const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
        unitCostExTax: insertItem.unitCostExTax,
        quantity: insertItem.quantity,
        markupPercent: insertItem.markupPercent,
        projectMarkupPercent: estimate?.projectMarkupPercent,
        taxRate: estimate?.taxRate,
        existingPriceIncTax: insertItem.priceIncTax,
      });

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

    // Always recompute via the single source of truth — guarantees no drift
    // regardless of which fields were patched. resolveEstimateStoredPrice
    // preserves a flat/fixed-price allowance line's typed amount instead of
    // wiping it to $0 on a non-price patch (e.g. allowance/status toggle).
    const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
      unitCostExTax: updatedItem.unitCostExTax,
      quantity: updatedItem.quantity,
      markupPercent: updatedItem.markupPercent,
      projectMarkupPercent: estimate?.projectMarkupPercent,
      taxRate: estimate?.taxRate,
      existingPriceIncTax: updatedItem.priceIncTax,
    });
    updatedItem.taxAmount = taxAmount;
    updatedItem.priceIncTax = priceIncTax;

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
      const group = item.groupId ? this.estimateGroups.get(item.groupId) : undefined;
      
      // Since we don't have bill/timesheet allocations in memory, return 0 for now
      const actualCost = 0;
      const variance = actualCost - (item.priceIncTax || 0);
      
      return {
        item: {
          ...item,
          estimateName: estimate?.name || "Unknown",
          estimateVersion: estimate?.version || 1,
          groupName: group?.name || null,
          groupOrder: group?.order ?? null,
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
    return groups.sort((a, b) => {
      const orderDiff = (a.order || 0) - (b.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id.localeCompare(b.id);
    });
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

    // Allow isCollapsed toggle on locked estimates (UI-only state)
    const onlyTogglingCollapse = Object.keys(updateGroup).length === 1 && 'isCollapsed' in updateGroup;
    if (!onlyTogglingCollapse) {
      const estimate = await this.getEstimate(group.estimateId);
      if (estimate?.isLocked) {
        throw new Error("Cannot update group in locked estimate. Unlock the estimate first.");
      }
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

    // Find max order among siblings to place duplicate at the bottom
    const allGroups = await this.getEstimateGroups(group.estimateId);
    const siblings = allGroups.filter(g => (g.parentGroupId ?? null) === (group.parentGroupId ?? null));
    const maxOrder = siblings.reduce((m, g) => Math.max(m, g.order ?? 0), -1);

    // Create duplicate with new ID
    const newGroup: EstimateGroup = {
      ...group,
      id: crypto.randomUUID(),
      name: `${group.name} (Copy)`,
      order: maxOrder + 1,
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
      const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
        unitCostExTax: item.unitCostExTax,
        quantity: item.quantity,
        markupPercent: item.markupPercent,
        projectMarkupPercent: targetEstimate.projectMarkupPercent,
        taxRate: targetEstimate.taxRate,
        existingPriceIncTax: item.priceIncTax,
      });
      const newItem: EstimateItem = {
        ...item,
        id: crypto.randomUUID(),
        estimateId: targetEstimateId,
        groupId: newGroup.id,
        taxAmount,
        priceIncTax,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.estimateItems.set(newItem.id, newItem);
    }

    return newGroup;
  }

  async applyGroupCostCodeToItems(groupId: string, costCode: string | null, costCategoryId: string | null): Promise<number> {
    let count = 0;
    for (const [id, item] of this.estimateItems.entries()) {
      if (item.groupId === groupId) {
        const updated: any = { ...item, updatedAt: new Date() };
        if (costCode !== null) updated.costCode = costCode;
        if (costCategoryId !== null) updated.costCategoryId = costCategoryId;
        this.estimateItems.set(id, updated);
        count++;
      }
    }
    return count;
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

    const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
      unitCostExTax: item.unitCostExTax,
      quantity: item.quantity,
      markupPercent: item.markupPercent,
      projectMarkupPercent: targetEstimate.projectMarkupPercent,
      taxRate: targetEstimate.taxRate,
      existingPriceIncTax: item.priceIncTax,
    });

    // Create copy in target estimate (without group assignment)
    const newItem: EstimateItem = {
      ...item,
      id: crypto.randomUUID(),
      estimateId: targetEstimateId,
      groupId: null, // Don't assign to a group in target estimate
      taxAmount,
      priceIncTax,
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

  async bulkUpdateCostCodes(ids: string[], updates: Partial<InsertCostCode>, companyId: string): Promise<CostCode[]> {
    const out: CostCode[] = [];
    for (const id of ids) {
      const updated = await this.updateCostCode(id, updates, companyId);
      if (updated) out.push(updated);
    }
    return out;
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

    // Lock the current version (preserve its workflow status — a parent that
    // was Approved or Contract should keep that status).
    const lockedCurrent = {
      ...currentEstimate,
      isLocked: true,
      updatedAt: new Date(),
    };
    this.estimates.set(estimateId, lockedCurrent);

    // Create new version
    const newId = randomUUID();
    const now = new Date();
    // parentEstimateId always points to the original Rev A (root) estimate
    const parentEstimateId = currentEstimate.parentEstimateId || estimateId;
    const newVersion: Estimate = {
      ...currentEstimate,
      ...newVersionData,
      id: newId,
      version: currentEstimate.version + 1,
      isLocked: false,
      status: "draft",
      approvedAt: null,
      approvedById: null,
      contractedAt: null,
      contractedById: null,
      parentEstimateId,
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

  async getEstimateVersions(estimateId: string): Promise<Estimate[]> {
    const current = this.estimates.get(estimateId);
    if (!current) return [];
    const rootId = current.parentEstimateId || estimateId;
    return Array.from(this.estimates.values())
      .filter(e => e.id === rootId || e.parentEstimateId === rootId)
      .sort((a, b) => a.version - b.version);
  }

  async lockEstimate(estimateId: string): Promise<Estimate | undefined> {
    // Toggle isLocked only — preserves the workflow status (draft/approved/contract).
    try {
      const result = await db.update(schema.estimates)
        .set({ isLocked: true, updatedAt: new Date() })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      if (result.length > 0) {
        this.estimates.set(estimateId, result[0]);
        return result[0];
      }
    } catch (error) {
      console.error("Database error in lockEstimate:", error);
    }
    const estimate = this.estimates.get(estimateId);
    if (!estimate) return undefined;
    const lockedEstimate: Estimate = { ...estimate, isLocked: true, updatedAt: new Date() };
    this.estimates.set(estimateId, lockedEstimate);
    return lockedEstimate;
  }

  async unlockEstimate(estimateId: string): Promise<Estimate | undefined> {
    // Toggle isLocked only — preserves the workflow status (draft/approved/contract)
    // so an Approved estimate can be temporarily unlocked for cost-code edits
    // without dropping back to draft.
    try {
      const result = await db.update(schema.estimates)
        .set({ isLocked: false, updatedAt: new Date() })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      if (result.length > 0) {
        this.estimates.set(estimateId, result[0]);
        return result[0];
      }
    } catch (error) {
      console.error("Database error in unlockEstimate:", error);
    }
    const estimate = this.estimates.get(estimateId);
    if (!estimate) return undefined;
    const unlockedEstimate: Estimate = { ...estimate, isLocked: false, updatedAt: new Date() };
    this.estimates.set(estimateId, unlockedEstimate);
    return unlockedEstimate;
  }

  async updateEstimateStatus(estimateId: string, patch: Partial<Estimate>): Promise<Estimate | undefined> {
    try {
      const result = await db.update(schema.estimates)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      if (result.length > 0) {
        this.estimates.set(estimateId, result[0]);
        return result[0];
      }
      return undefined;
    } catch (error) {
      console.error("Database error in updateEstimateStatus:", error);
      throw error;
    }
  }

  async promoteEstimateToContract(estimateId: string, userId: string): Promise<Estimate | undefined> {
    // Atomic: demote any existing Contract estimate on the same project back to
    // Approved (kept locked), then promote this estimate to Contract. Enforces
    // the "one Contract per project" invariant.
    try {
      const target = await this.getEstimate(estimateId);
      if (!target) return undefined;
      return await db.transaction(async (tx) => {
        await tx.update(schema.estimates)
          .set({ status: "approved", updatedAt: new Date() })
          .where(and(
            eq(schema.estimates.projectId, target.projectId),
            eq(schema.estimates.status, "contract"),
            ne(schema.estimates.id, estimateId),
          ));
        const result = await tx.update(schema.estimates)
          .set({
            status: "contract",
            isLocked: true,
            contractedAt: new Date(),
            contractedById: userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        if (result.length > 0) this.estimates.set(estimateId, result[0]);
        return result[0];
      });
    } catch (error) {
      console.error("Database error in promoteEstimateToContract:", error);
      throw error;
    }
  }

  async approveEstimate(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined> {
    // MemStorage shim — defers to the DB. See DbStorage.approveEstimate for
    // the authoritative transactional implementation (with budget recalcs).
    try {
      const target = await this.getEstimate(estimateId);
      if (!target || !target.projectId) return undefined;
      const projectId = target.projectId;
      // A locked contract estimate must only be unlocked via the explicit
      // revert flow — never silently demoted by re-approving it here.
      if (target.status === "contract") throw new Error("ALREADY_CONTRACT");
      const lockedContracts = await db
        .select({ id: schema.estimates.id })
        .from(schema.estimates)
        .where(and(
          eq(schema.estimates.projectId, projectId),
          eq(schema.estimates.status, "contract"),
          ne(schema.estimates.id, estimateId),
        ));
      if (lockedContracts.length > 0) throw new Error("LOCKED_CONTRACT_EXISTS");
      const summary = await this.getEstimateSummary(estimateId);
      const contractPriceCents = Math.round((summary.total || 0) * 100);
      return await db.transaction(async (tx) => {
        const promotedRows = await tx.update(schema.estimates)
          .set({
            status: "approved",
            isLocked: false,
            approvedAt: target.approvedAt ?? new Date(),
            approvedById: target.approvedById ?? userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        const promoted = promotedRows[0];
        if (!promoted) throw new Error("Failed to approve estimate");
        const updatedProjectRows = await tx.update(schema.projects)
          .set({
            selectedEstimateId: estimateId,
            contractPrice: contractPriceCents > 0 ? contractPriceCents : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, projectId))
          .returning();
        const updatedProject = updatedProjectRows[0];
        if (!updatedProject) throw new Error("Failed to update project for approved estimate");
        this.estimates.set(estimateId, promoted);
        return { estimate: promoted, project: updatedProject, recalcWarnings: [] };
      });
    } catch (error) {
      console.error("Database error in approveEstimate (MemStorage):", error);
      throw error;
    }
  }

  async markEstimateAsContract(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined> {
    // MemStorage shim — defers to the DB. See DbStorage.markEstimateAsContract
    // for the authoritative transactional implementation (with budget recalcs).
    try {
      const target = await this.getEstimate(estimateId);
      if (!target || !target.projectId) return undefined;
      const projectId = target.projectId;
      const summary = await this.getEstimateSummary(estimateId);
      const contractPriceCents = Math.round((summary.total || 0) * 100);
      return await db.transaction(async (tx) => {
        await tx.update(schema.estimates)
          .set({
            status: "approved",
            isLocked: false,
            contractedAt: null,
            contractedById: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(schema.estimates.projectId, projectId),
            eq(schema.estimates.status, "contract"),
            ne(schema.estimates.id, estimateId),
          ));
        const promotedRows = await tx.update(schema.estimates)
          .set({
            status: "contract",
            isLocked: true,
            contractedAt: new Date(),
            contractedById: userId,
            approvedAt: target.approvedAt ?? new Date(),
            approvedById: target.approvedById ?? userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        const promoted = promotedRows[0];
        if (!promoted) throw new Error("Failed to promote estimate to contract");
        const updatedProjectRows = await tx.update(schema.projects)
          .set({
            selectedEstimateId: estimateId,
            contractPrice: contractPriceCents > 0 ? contractPriceCents : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, projectId))
          .returning();
        const updatedProject = updatedProjectRows[0];
        if (!updatedProject) throw new Error("Failed to update project for contract estimate");
        this.estimates.set(estimateId, promoted);
        return { estimate: promoted, project: updatedProject, recalcWarnings: [] };
      });
    } catch (error) {
      console.error("Database error in markEstimateAsContract (MemStorage):", error);
      throw error;
    }
  }

  async recomputeContractPriceSnapshots(): Promise<{ scanned: number; updated: number }> {
    let scanned = 0;
    let updated = 0;
    try {
      const rows = await db
        .select({
          id: schema.projects.id,
          selectedEstimateId: schema.projects.selectedEstimateId,
          contractPrice: schema.projects.contractPrice,
        })
        .from(schema.projects)
        .where(isNotNull(schema.projects.selectedEstimateId));
      for (const row of rows) {
        if (!row.selectedEstimateId) continue;
        scanned++;
        try {
          const summary = await this.getEstimateSummary(row.selectedEstimateId);
          const cents = Math.round((summary.total || 0) * 100);
          if (cents <= 0) continue;
          const current = Number(row.contractPrice) || 0;
          if (current !== cents) {
            await db.update(schema.projects)
              .set({ contractPrice: cents, updatedAt: new Date() })
              .where(eq(schema.projects.id, row.id));
            updated++;
          }
        } catch (err) {
          console.error(`[recomputeContractPriceSnapshots] project ${row.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error("[recomputeContractPriceSnapshots] (MemStorage) failed:", err);
    }
    return { scanned, updated };
  }

  // Summary calculations
  async getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    builderCostTotal: number;
    lineItemMarkupAmount: number;
    subtotalExTax: number;
    globalMarkupPercent: number;
    globalMarkupAmount: number;
    totalExTax: number;
    taxAmount: number;
    total: number;
    itemCount: number;
    // Legacy fields for backward compat
    markupAmount: number;
    subtotalWithMarkup: number;
  }> {
    const items = await this.getEstimateItems(estimateId);
    const estimate = await this.getEstimate(estimateId);
    return computeEstimateSummary(items, {
      projectMarkupPercent: estimate?.projectMarkupPercent,
      taxRate: estimate?.taxRate,
    });
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

  async getCompanyByStripeCustomerId(customerId: string): Promise<import("@shared/schema").Company | undefined> {
    return Array.from(this.companies.values()).find((c: any) => c.stripeCustomerId === customerId);
  }

  async expireLapsedTrials(): Promise<{ expired: number }> {
    let expired = 0;
    const now = Date.now();
    for (const [id, company] of Array.from(this.companies.entries())) {
      const c = company as any;
      if (c.planStatus === "trialing" && c.trialEndsAt && new Date(c.trialEndsAt).getTime() < now) {
        this.companies.set(id, { ...c, planStatus: "expired", plan: c.chosenPlan || "builder", updatedAt: new Date() });
        expired++;
      }
    }
    return { expired };
  }

  // Company Settings
  async getCompanySettings(): Promise<CompanySettings | undefined> {
    return this.companySettings;
  }

  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    if (!this.companySettings) {
      // Create new company settings if none exist
      this.companySettings = ({
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
      } as unknown) as CompanySettings;
    } else {
      // Update existing settings
      this.companySettings = ({
        ...this.companySettings,
        ...settings,
        updatedAt: new Date(),
      } as unknown) as CompanySettings;
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
        description: optData.description ?? null,
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
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt.getTime() - b.createdAt.getTime());
  }

  async batchUpdateSelectionSortOrder(updates: { id: string; sortOrder: number }[]): Promise<void> {
    for (const { id, sortOrder } of updates) {
      const sel = this.selections.get(id);
      if (sel) this.selections.set(id, { ...sel, sortOrder });
    }
  }

  async getSelection(id: string): Promise<Selection | undefined> {
    return this.selections.get(id);
  }

  async getSelectionByEstimateItemId(estimateItemId: string): Promise<Selection | undefined> {
    return Array.from(this.selections.values()).find(s => s.estimateItemId === estimateItemId);
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

  async getSelectionsWithOptions(projectId: string): Promise<SelectionWithOptions[]> {
    const selections = await this.getSelections(projectId);
    return Promise.all(selections.map(async (s) => (await this.getSelectionWithOptions(s.id))!));
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

  async getOptionAttachmentById(id: string): Promise<OptionAttachment | undefined> {
    return this.optionAttachments.get(id);
  }

  async deleteOptionAttachment(id: string): Promise<boolean> {
    return this.optionAttachments.delete(id);
  }

  async updateOptionAttachment(id: string, data: Partial<InsertOptionAttachment>): Promise<OptionAttachment | undefined> {
    const existing = this.optionAttachments.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.optionAttachments.set(id, updated);
    return updated;
  }

  async approveSelectionOption(id: string, userId: string, userName: string): Promise<SelectionOption | undefined> {
    const existing = this.selectionOptions.get(id);
    if (!existing) return undefined;
    const now = new Date();
    // Unselect any other option for the same selection
    for (const [oid, opt] of this.selectionOptions.entries()) {
      if (opt.selectionId === existing.selectionId && oid !== id && opt.isSelectedByClient) {
        this.selectionOptions.set(oid, { ...opt, isSelectedByClient: false, updatedAt: now });
      }
    }
    const updated: SelectionOption = { ...existing, approvedAt: now, approvedById: userId, approvedBy: userName, lockedAt: now, isSelectedByClient: true, updatedAt: now };
    this.selectionOptions.set(id, updated);
    return updated;
  }

  async unapproveSelectionOption(id: string): Promise<SelectionOption | undefined> {
    const existing = this.selectionOptions.get(id);
    if (!existing) return undefined;
    const now = new Date();
    const updated: SelectionOption = { ...existing, approvedAt: null, approvedById: null, approvedBy: null, lockedAt: null, updatedAt: now };
    this.selectionOptions.set(id, updated);
    return updated;
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

  async getClientSelectionBySelectionId(selectionId: string): Promise<ClientSelection | undefined> {
    return Array.from(this.clientSelections.values()).find(cs => cs.selectionId === selectionId);
  }

  async getSelectionComments(selectionId: string): Promise<SelectionComment[]> { return []; }
  async createSelectionComment(comment: InsertSelectionComment): Promise<SelectionComment> { throw new Error("Not implemented"); }
  async deleteSelectionComment(id: string): Promise<boolean> { return false; }

  // Product Library stubs
  async getProducts(_companyId: string, _filters?: any): Promise<schema.Product[]> { return []; }
  async getProduct(_id: number): Promise<schema.Product | undefined> { return undefined; }
  async createProduct(product: schema.InsertProduct): Promise<schema.Product> { throw new Error("Not implemented"); }
  async updateProduct(_id: number, _product: Partial<schema.InsertProduct>): Promise<schema.Product | undefined> { return undefined; }
  async deleteProduct(_id: number): Promise<boolean> { return false; }
  async getProductImages(_productId: number): Promise<schema.ProductImage[]> { return []; }
  async createProductImage(image: schema.InsertProductImage): Promise<schema.ProductImage> { throw new Error("Not implemented"); }
  async deleteProductImage(_id: number): Promise<boolean> { return false; }

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

  // Focus Blocks CRUD (in-memory implementation)
  async getFocusBlocks(userId: string, companyId: string): Promise<schema.FocusBlock[]> {
    return Array.from(this.focusBlocks.values()).filter(
      fb => fb.companyId === companyId && fb.userId === userId,
    );
  }
  async getFocusBlock(id: string, companyId: string): Promise<schema.FocusBlock | undefined> {
    const fb = this.focusBlocks.get(id);
    return fb && fb.companyId === companyId ? fb : undefined;
  }
  async createFocusBlock(block: schema.InsertFocusBlockWithOwner): Promise<schema.FocusBlock> {
    const id = crypto.randomUUID();
    const now = new Date();
    const newBlock: schema.FocusBlock = {
      ...block,
      id,
      daysOfWeek: block.daysOfWeek ?? [],
      specificDate: block.specificDate ?? null,
      categoryId: block.categoryId ?? null,
      pinnedTaskIds: block.pinnedTaskIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.focusBlocks.set(id, newBlock);
    return newBlock;
  }
  async updateFocusBlock(id: string, block: Partial<schema.InsertFocusBlock>, companyId: string): Promise<schema.FocusBlock | undefined> {
    const existing = this.focusBlocks.get(id);
    if (!existing || existing.companyId !== companyId) return undefined;
    const updated: schema.FocusBlock = { ...existing, ...block, updatedAt: new Date() };
    this.focusBlocks.set(id, updated);
    return updated;
  }
  async deleteFocusBlock(id: string, companyId: string): Promise<boolean> {
    const existing = this.focusBlocks.get(id);
    if (!existing || existing.companyId !== companyId) return false;
    this.focusBlocks.delete(id);
    return true;
  }
  async getFocusBlockTasks(blockId: string, companyId: string, limit: number = 4, userId?: string): Promise<schema.Task[]> {
    // MemStorage: return pinned tasks from block + unscheduled tasks for the user
    const block = this.focusBlocks.get(blockId);
    if (!block || block.companyId !== companyId) return [];
    const pinnedIds = new Set(block.pinnedTaskIds ?? []);
    const priorityOrder: Record<string, number> = { high: 1, medium: 2, low: 3 };
    const allNotes = Array.from(this.notes.values()) as schema.Task[];
    const candidates = allNotes.filter(n =>
      n.companyId === companyId &&
      n.type === 'task' &&
      !n.startTime && !n.endTime && !n.archivedAt &&
      !['done', 'complete', 'completed'].includes(n.status ?? '') &&
      (!userId || n.assigneeId === userId),
    );
    const pinned = candidates.filter(t => pinnedIds.has(t.id));
    const autoFill = candidates
      .filter(t => !pinnedIds.has(t.id))
      .sort((a, b) => {
        const pa = priorityOrder[a.priority ?? ''] ?? 4;
        const pb = priorityOrder[b.priority ?? ''] ?? 4;
        return pa - pb;
      })
      .slice(0, Math.max(0, limit - pinned.length));
    return [...pinned, ...autoFill];
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
        const enriched = scheduleItems.map(item => ({
          ...item,
          projectId: schedule.projectId,
          projectName: project.name,
          projectColor: (project as any).color ?? null,
        }));
        allItems.push(...(enriched as any as ScheduleItem[]));
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
  async getNotifications(userId: string, companyId: string, options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<InAppNotification[]> {
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
  async ensurePushTokensTable(): Promise<void> {
    return;
  }
  async upsertPushToken(data: { userId: string; token: string; platform?: string; deviceName?: string }): Promise<PushToken> {
    throw new Error("Not implemented in MemStorage");
  }
  async getPushTokensForUser(userId: string): Promise<PushToken[]> {
    return [];
  }
  async deletePushToken(token: string, userId?: string): Promise<boolean> {
    return false;
  }
  async deletePushTokens(tokens: string[]): Promise<number> {
    return 0;
  }
  async ensureSuggestionsTable(): Promise<void> {
    return;
  }
  async createSuggestion(data: InsertSuggestion & { userId: string; companyId: string | null; roleName: string | null }): Promise<Suggestion> {
    throw new Error("Not implemented in MemStorage");
  }
  async getSuggestions(filters?: { section?: string; status?: string }): Promise<SuggestionWithMeta[]> {
    return [];
  }
  async updateSuggestion(id: string, updates: { status?: string; priority?: string | null; internalNote?: string | null }): Promise<Suggestion | undefined> {
    return undefined;
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

  async getXeroConnectionByCompanyId(companyId: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    return undefined;
  }
  async getXeroConnectionByTenantId(tenantId: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    return undefined;
  }
  async getXeroConnection(id: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    return undefined;
  }
  async createXeroConnection(data: import("@shared/schema").InsertXeroConnection): Promise<import("@shared/schema").XeroConnection> {
    throw new Error("Not implemented in MemStorage");
  }
  async updateXeroConnection(id: string, data: Partial<import("@shared/schema").XeroConnection>): Promise<import("@shared/schema").XeroConnection | undefined> {
    return undefined;
  }
  async deleteXeroConnection(id: string): Promise<boolean> {
    return false;
  }

  // Teams (T006) - MemStorage stubs
  async getTeams(companyId: string): Promise<import("@shared/schema").Team[]> { return []; }
  async getTeam(id: string): Promise<import("@shared/schema").Team | undefined> { return undefined; }
  async createTeam(data: import("@shared/schema").InsertTeam): Promise<import("@shared/schema").Team> { throw new Error("Not implemented"); }
  async updateTeam(id: string, data: Partial<import("@shared/schema").InsertTeam>): Promise<import("@shared/schema").Team | undefined> { return undefined; }
  async deleteTeam(id: string): Promise<boolean> { return false; }

  async getNextClientInvoiceNumber(prefix: string, startNumber: number): Promise<string> {
    return `${prefix}${startNumber}`;
  }

  async getClientInvoiceNumbersByPrefix(_prefix: string): Promise<string[]> {
    return [];
  }

  // Supplier Name Mappings — MemStorage stubs
  async getSupplierNameMapping(_invoiceNameString: string, _companyId: string): Promise<import("@shared/schema").SupplierNameMapping | undefined> { return undefined; }
  async createSupplierNameMapping(data: import("@shared/schema").InsertSupplierNameMapping & { companyId: string }): Promise<import("@shared/schema").SupplierNameMapping> { throw new Error("Not implemented"); }
  async getSupplierNameMappings(_companyId: string): Promise<import("@shared/schema").SupplierNameMapping[]> { return []; }

  // Permission checks — MemStorage stubs (always true for in-memory/dev use)
  async canUserApproveBills(_userId: string): Promise<boolean> { return true; }
  async canUserViewAllBills(_userId: string): Promise<boolean> { return true; }
  async canUserApproveTimesheets(_userId: string): Promise<boolean> { return true; }
  async canUserViewTimesheetRates(_userId: string): Promise<boolean> { return true; }

  async healUserRoleNameCache(): Promise<{ updated: number }> { return { updated: 0 }; }
  async backfillBillsCompanyId(): Promise<{ updated: number }> { return { updated: 0 }; }
  async backfillCompanySettingsCompanyId(): Promise<{ updated: boolean }> { return { updated: false }; }
  async syncCompanyName(): Promise<{ synced: boolean; name?: string }> { return { synced: false }; }
  async repairDuplicateScopeStages(): Promise<{ projectsScanned: number; duplicatesRemoved: number }> { return { projectsScanned: 0, duplicatesRemoved: 0 }; }
  async syncClientInvoicePaidStatus(_invoiceId: string): Promise<void> {}
  async healVoidedClientInvoicePaidAmounts(): Promise<{ fixed: number }> { return { fixed: 0 }; }
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

    // Migrate financial.budget → financial.budget_labour + financial.budget_actuals (idempotent)
    await this.migrateBudgetPermissions();
    
    // Always ensure all required categories exist (idempotent)
    await this.ensureRequiredCategoriesExist();
    
    // Always ensure all required field options exist (idempotent)
    await this.ensureAllRequiredOptionsExist();

    // Always ensure required custom fields exist (idempotent)
    await this.ensureRequiredCustomFieldsExist();

    // Backfill isOnline for existing schedules (idempotent)
    // Schedules that were "online" or "locked" should be marked as online in the new column
    await this.backfillScheduleIsOnline();
  }

  private async backfillScheduleIsOnline(): Promise<void> {
    try {
      await db.update(schema.schedules)
        .set({ isOnline: true })
        .where(
          and(
            eq(schema.schedules.isOnline, false),
            inArray(schema.schedules.status, ["online", "locked"])
          )
        );
    } catch (error) {
      console.error("Error backfilling schedule isOnline:", error);
    }
  }

  // Ensure all built-in permissions exist (idempotent upsert by key)
  private async ensureBuiltInPermissionsExist(): Promise<void> {
    const now = new Date();
    
    const builtInPermissions = [
      // Admin category
      { key: "admin.users", name: "User (team)", description: "Manage team users", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.suppliers", name: "Sub/Vendor", description: "Manage suppliers/vendors", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.roles", name: "Role", description: "Manage user roles", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.cost_codes", name: "Cost code/category", description: "Manage cost codes", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.terms", name: "Terms and Conditions", description: "Manage terms", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.payment_templates", name: "Payment schedule templates", description: "Manage payment templates", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.company", name: "Company settings", description: "Manage company settings", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.manage_team_members", name: "Manage Team Members", description: "Edit team member profiles and details", category: "admin", actions: ["view", "edit"], isBuiltIn: true },

      // Projects category
      { key: "projects.view", name: "Projects", description: "View projects", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.schedule", name: "Schedule", description: "Manage project schedules", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.variations", name: "Variations", description: "Manage project variations", category: "projects", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "projects.todos", name: "To Dos", description: "Manage project to-dos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.invoices", name: "Progress Claims", description: "Manage client invoices and progress claims", category: "projects", actions: ["view", "add", "edit", "delete", "approve", "send"], isBuiltIn: true },
      { key: "projects.site_diary", name: "Site Diary", description: "Manage site diary", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.selections", name: "Selections and Allowances", description: "Manage selections", category: "projects", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "projects.timesheet", name: "Project Timesheet", description: "Manage per-project timesheets", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.rfi", name: "RFI", description: "Manage RFIs", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.team_calendars", name: "View Team Calendars", description: "View other team members' calendars", category: "projects", actions: ["view"], isBuiltIn: true },
      { key: "projects.messages", name: "Project Messages", description: "Access project messaging", category: "projects", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "projects.notes", name: "Project Notes", description: "Access project notes and memos", category: "projects", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "projects.contract", name: "Contracts & Proposals", description: "Manage project contracts and proposals", category: "projects", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },
      { key: "schedules.view_offline", name: "View Offline Schedules", description: "Can see offline (draft) schedules not yet published", category: "projects", actions: ["view"], isBuiltIn: true },

      // Tasks category
      { key: "tasks.manage", name: "Tasks", description: "Manage tasks (with view-scope control)", category: "tasks", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "tasks.project", name: "Project Tasks", description: "Manage tasks within projects", category: "tasks", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "tasks.business", name: "Business Tasks", description: "Manage company-wide business tasks", category: "tasks", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },

      // Financial category
      { key: "financial.estimate", name: "Estimate", description: "Manage estimates", category: "financial", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "financial.purchase_orders", name: "Purchase Orders", description: "Manage purchase orders", category: "financial", actions: ["view", "add", "edit", "delete", "approve", "send"], isBuiltIn: true },
      { key: "financial.bills", name: "Bills", description: "Manage bills", category: "financial", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "financial.budget_labour", name: "Labour Hours Budget", description: "View labour hours tracker (hours worked vs budgeted per cost code)", category: "financial", actions: ["view"], isBuiltIn: true },
      { key: "financial.budget_actuals", name: "Financial Budget", description: "View full cost budget (estimate vs actuals, margins, dollar figures)", category: "financial", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "financial.quotes", name: "Request for Quotes", description: "Manage quotes", category: "financial", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "financial.proposal", name: "Proposal", description: "Manage proposals", category: "financial", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },
      { key: "financial.reports", name: "Financial Reports", description: "Access financial reports and summaries", category: "financial", actions: ["view", "summary_only"], isBuiltIn: true },

      // Sales category
      { key: "sales.client", name: "Client", description: "Manage clients", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "sales.leads", name: "Leads & Prospects", description: "Manage sales leads and prospects", category: "sales", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "sales.proposals", name: "Proposals", description: "Manage sales proposals", category: "sales", actions: ["view", "add", "edit", "delete", "approve", "send", "convert"], isBuiltIn: true },

      // Team & Operations category
      { key: "files.manage", name: "Files", description: "Manage files and folders", category: "operations", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "timesheets.manage", name: "Timesheets", description: "Manage company-wide timesheets (with view-scope control)", category: "operations", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "timesheets.rates", name: "Labour Rates", description: "View labour cost rates and totals on timesheets", category: "operations", actions: ["view"], isBuiltIn: true },
      { key: "calendar.manage", name: "Calendar", description: "Manage team calendar and scheduling (with view-scope control)", category: "operations", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "messages.team", name: "Team Messaging", description: "Access team-wide messaging", category: "operations", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "leave.manage", name: "Leave", description: "Manage employee leave requests and balances", category: "operations", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },

      // Dashboard & KPIs category
      { key: "dashboard.overview", name: "Overview Dashboard", description: "View the main business overview dashboard", category: "dashboard", actions: ["view"], isBuiltIn: true },
      { key: "dashboard.financial", name: "Financial Metrics", description: "View financial KPIs and metrics dashboard", category: "dashboard", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "dashboard.project_health", name: "Project Health", description: "View project health and status dashboard", category: "dashboard", actions: ["view"], isBuiltIn: true },
      { key: "dashboard.team_performance", name: "Team Performance", description: "View team performance and productivity metrics", category: "dashboard", actions: ["view"], isBuiltIn: true },

      // Business category (13 keys)
      { key: "business.dashboard", name: "Business Dashboard", description: "Access business-level dashboard and KPIs", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.schedule", name: "Business Schedule", description: "Manage company-wide schedule", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.overheads", name: "Overheads", description: "Manage business overhead costs", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.timesheets", name: "Business Timesheets", description: "View company-wide timesheets (with view-scope control)", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.calendar", name: "Business Calendar", description: "Manage business-level calendar (with view-scope control)", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.files", name: "Business Files", description: "Access company-level file library", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.messages", name: "Business Messages", description: "Access company-wide messaging", category: "business", actions: ["view", "add", "edit", "delete", "send"], isBuiltIn: true },
      { key: "business.notes", name: "Business Notes", description: "Manage company notes and memos", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.leave", name: "Leave Management", description: "Manage employee leave requests", category: "business", actions: ["view", "add", "edit", "delete", "approve"], isBuiltIn: true },
      { key: "business.team", name: "Team Directory", description: "View team member directory", category: "business", actions: ["view"], isBuiltIn: true },
      { key: "business.contacts", name: "Business Contacts", description: "Manage company-wide contact directory", category: "business", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "business.purchase_orders", name: "Business Purchase Orders", description: "View company-wide purchase order summary", category: "business", actions: ["view", "summary_only"], isBuiltIn: true },
      { key: "business.reports", name: "Business Reports", description: "Access company-level reports and analytics", category: "business", actions: ["view", "summary_only"], isBuiltIn: true },
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

  // One-time migration: any role that had financial.budget gets financial.budget_labour
  // and financial.budget_actuals granted automatically. Idempotent — safe to run on every boot.
  private async migrateBudgetPermissions(): Promise<void> {
    try {
      // Look up the permission IDs we care about
      const [oldPerm] = await db.select().from(schema.permissions)
        .where(eq(schema.permissions.key, 'financial.budget')).limit(1);
      const [labourPerm] = await db.select().from(schema.permissions)
        .where(eq(schema.permissions.key, 'financial.budget_labour')).limit(1);
      const [actualsPerm] = await db.select().from(schema.permissions)
        .where(eq(schema.permissions.key, 'financial.budget_actuals')).limit(1);

      if (!oldPerm || !labourPerm || !actualsPerm) return;

      // Find all role-permission rows for the old financial.budget permission
      const oldRolePerms = await db.select().from(schema.rolePermissions)
        .where(eq(schema.rolePermissions.permissionId, oldPerm.id));

      for (const rp of oldRolePerms) {
        const oldActions = Array.isArray(rp.allowedActions) ? rp.allowedActions as string[] : [];
        if (!oldActions.includes('view')) continue;

        // Grant financial.budget_labour if not already granted
        const [existingLabour] = await db.select().from(schema.rolePermissions)
          .where(and(
            eq(schema.rolePermissions.roleId, rp.roleId),
            eq(schema.rolePermissions.permissionId, labourPerm.id),
          )).limit(1);
        if (!existingLabour) {
          await db.insert(schema.rolePermissions).values({
            id: `rp-${rp.roleId}-${labourPerm.id}`,
            roleId: rp.roleId,
            permissionId: labourPerm.id,
            allowedActions: ['view'] as PermissionAction[],
            viewScope: 'all',
            viewableRoleIds: [],
            createdAt: new Date(),
          });
        }

        // Grant financial.budget_actuals if not already granted
        const [existingActuals] = await db.select().from(schema.rolePermissions)
          .where(and(
            eq(schema.rolePermissions.roleId, rp.roleId),
            eq(schema.rolePermissions.permissionId, actualsPerm.id),
          )).limit(1);
        if (!existingActuals) {
          await db.insert(schema.rolePermissions).values({
            id: `rp-${rp.roleId}-${actualsPerm.id}`,
            roleId: rp.roleId,
            permissionId: actualsPerm.id,
            allowedActions: ['view'] as PermissionAction[],
            viewScope: 'all',
            viewableRoleIds: [],
            createdAt: new Date(),
          });
        }
      }

      // Delete the old financial.budget role-permission rows now that the new ones are in place
      if (oldRolePerms.length > 0) {
        await db.delete(schema.rolePermissions)
          .where(eq(schema.rolePermissions.permissionId, oldPerm.id));
      }

      // Delete the old financial.budget permission record itself so it no longer
      // appears in the Roles & Permissions UI or API responses
      await db.delete(schema.permissions)
        .where(eq(schema.permissions.key, 'financial.budget'));
    } catch (error) {
      console.error('[migrateBudgetPermissions] Error:', error);
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
      {
        id: 'cat-enote-status',
        key: 'enote.status',
        label: 'E-Notes Status',
        entity: 'enote',
        description: 'Status options for E-Notes rows',
        isBuiltIn: true,
        isActive: true,
        sortOrder: 16,
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
      try {
        await this.ensureOptionsForCategory(category, now);
      } catch (err: any) {
        console.warn(`[init] Could not ensure options for category "${category.key}": ${err?.message || err}`);
      }
    }
  }

  private async ensureOptionsForCategory(category: any, now: Date): Promise<void> {
    const requiredOptions = this.getRequiredOptionsForCategory(category.key, category.id);
    
    // First pass: insert parent options (no parentId) so FK references resolve
    const parentOptions = requiredOptions.filter((o: any) => !o.parentId);
    const childOptions = requiredOptions.filter((o: any) => !!o.parentId);

    for (const optionData of parentOptions) {
      const existing = await db.select().from(schema.fieldOptions)
        .where(and(
          eq(schema.fieldOptions.categoryId, category.id),
          eq(schema.fieldOptions.key, optionData.key)
        ))
        .limit(1);
        
      if (existing.length === 0) {
        await db.insert(schema.fieldOptions).values({
          ...optionData,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Second pass: insert child options, resolving parent IDs from DB
    for (const optionData of childOptions) {
      const existingChild = await db.select().from(schema.fieldOptions)
        .where(and(
          eq(schema.fieldOptions.categoryId, category.id),
          eq(schema.fieldOptions.key, optionData.key)
        ))
        .limit(1);

      if (existingChild.length > 0) continue;

      // Look up the actual parent ID by the parent's hardcoded key suffix
      // e.g. parentId 'opt-project-status-pre-construction' → key 'pre_construction'
      const hardcodedParentId: string = optionData.parentId;
      // Find the parent option in the DB by matching the hardcoded ID (if it was inserted)
      // OR by finding the sibling option in parentOptions for this category
      const parentOption = parentOptions.find((p: any) => p.id === hardcodedParentId);
      let resolvedParentId: string = hardcodedParentId;

      if (parentOption) {
        // Look up what was actually inserted for this parent key
        const actualParent = await db.select().from(schema.fieldOptions)
          .where(and(
            eq(schema.fieldOptions.categoryId, category.id),
            eq(schema.fieldOptions.key, parentOption.key)
          ))
          .limit(1);
        if (actualParent.length > 0) {
          resolvedParentId = actualParent[0].id;
        }
      }

      try {
        await db.insert(schema.fieldOptions).values({
          ...optionData,
          parentId: resolvedParentId,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err: any) {
        console.warn(`[init] Skipping child option "${optionData.key}" (parentId resolution failed): ${err?.message || err}`);
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
          { id: 'opt-priority-low', categoryId, key: 'low', name: 'Low', color: '#10B981', isDefault: true, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: false, sortOrder: 1 },
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
      case 'enote.status':
        return [
          { id: 'opt-enote-status-not-started', categoryId, key: 'not_started', name: 'Not Started', color: '#6B7280', isDefault: true, isCompleted: false, sortOrder: 0 },
          { id: 'opt-enote-status-in-progress', categoryId, key: 'in_progress', name: 'In Progress', color: '#F59E0B', isDefault: false, isCompleted: false, sortOrder: 1 },
          { id: 'opt-enote-status-complete', categoryId, key: 'complete', name: 'Complete', color: '#10B981', isDefault: false, isCompleted: true, sortOrder: 2 },
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

  private async _seedOptionsForCategoryV1(category: any, now: Date): Promise<void> {
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
          { id: 'opt-priority-low', categoryId: category.id, key: 'low', name: 'Low', color: '#10B981', isDefault: true, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId: category.id, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: false, sortOrder: 1 },
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
      { id: 'opt-priority-low', categoryId: 'cat-task-priority', key: 'low', name: 'Low', color: '#10B981', isDefault: true, sortOrder: 0 },
      { id: 'opt-priority-medium', categoryId: 'cat-task-priority', key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: false, sortOrder: 1 },
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
          { id: 'opt-priority-low', categoryId, key: 'low', name: 'Low', color: '#10B981', isDefault: true, sortOrder: 0 },
          { id: 'opt-priority-medium', categoryId, key: 'medium', name: 'Medium', color: '#F59E0B', isDefault: false, sortOrder: 1 },
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
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean, assigneeId?: string, dateRange?: { startDate?: string; endDate?: string }, companyId?: string): Promise<Task[]> {
    const conditions = [eq(schema.notes.type, "task")];

    if (companyId) {
      conditions.push(eq(schema.notes.companyId, companyId));
    }
    
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
    return await db.select().from(schema.selections)
      .where(eq(schema.selections.projectId, projectId))
      .orderBy(schema.selections.sortOrder, schema.selections.createdAt);
  }

  async batchUpdateSelectionSortOrder(updates: { id: string; sortOrder: number }[]): Promise<void> {
    await Promise.all(
      updates.map(({ id, sortOrder }) =>
        db.update(schema.selections).set({ sortOrder }).where(eq(schema.selections.id, id))
      )
    );
  }

  async getSelection(id: string): Promise<Selection | undefined> {
    const [selection] = await db.select().from(schema.selections).where(eq(schema.selections.id, id)).limit(1);
    return selection;
  }

  async getSelectionByEstimateItemId(estimateItemId: string): Promise<Selection | undefined> {
    const [selection] = await db.select().from(schema.selections)
      .where(eq(schema.selections.estimateItemId, estimateItemId))
      .limit(1);
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

  async getSelectionsWithOptions(projectId: string): Promise<SelectionWithOptions[]> {
    const selections = await this.getSelections(projectId);
    return Promise.all(selections.map(async (s) => (await this.getSelectionWithOptions(s.id))!));
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
    const options = await db.select().from(schema.selectionOptions).where(eq(schema.selectionOptions.selectionId, selectionId));
    if (options.length === 0) return [];
    const optionIds = options.map((o) => o.id);
    const attachments = await db.select().from(schema.optionAttachments)
      .where(inArray(schema.optionAttachments.optionId, optionIds))
      .orderBy(asc(schema.optionAttachments.sortOrder));
    const attachmentsByOption = attachments.reduce<Record<string, OptionAttachment[]>>((acc, att) => {
      if (!acc[att.optionId]) acc[att.optionId] = [];
      acc[att.optionId].push(att);
      return acc;
    }, {});
    return options.map((o) => ({ ...o, attachments: attachmentsByOption[o.id] ?? [] })) as SelectionOption[];
  }

  async getSelectionOption(id: string): Promise<SelectionOption | undefined> {
    const [option] = await db.select().from(schema.selectionOptions).where(eq(schema.selectionOptions.id, id)).limit(1);
    if (!option) return undefined;
    const attachments = await this.getOptionAttachments(id);
    return { ...option, attachments } as SelectionOption;
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

  async approveSelectionOption(id: string, userId: string, userName: string): Promise<SelectionOption | undefined> {
    const now = new Date();
    // Get the selectionId first so we can unselect sibling options
    const [existing] = await db.select().from(schema.selectionOptions).where(eq(schema.selectionOptions.id, id)).limit(1);
    if (!existing) return undefined;
    // Unselect any other option for the same selection
    await db.update(schema.selectionOptions)
      .set({ isSelectedByClient: false, updatedAt: now })
      .where(and(
        eq(schema.selectionOptions.selectionId, existing.selectionId),
        ne(schema.selectionOptions.id, id),
        eq(schema.selectionOptions.isSelectedByClient, true),
      ));
    const [option] = await db.update(schema.selectionOptions).set({
      approvedAt: now,
      approvedById: userId,
      approvedBy: userName,
      lockedAt: now,
      isSelectedByClient: true,
      updatedAt: now,
    }).where(eq(schema.selectionOptions.id, id)).returning();
    return option;
  }

  async unapproveSelectionOption(id: string): Promise<SelectionOption | undefined> {
    const now = new Date();
    const [option] = await db.update(schema.selectionOptions).set({
      approvedAt: null,
      approvedById: null,
      approvedBy: null,
      lockedAt: null,
      updatedAt: now,
    }).where(eq(schema.selectionOptions.id, id)).returning();
    return option;
  }

  async getOptionAttachments(optionId: string): Promise<OptionAttachment[]> {
    return await db.select().from(schema.optionAttachments)
      .where(eq(schema.optionAttachments.optionId, optionId))
      .orderBy(asc(schema.optionAttachments.sortOrder));
  }

  async createOptionAttachment(insertAttachment: InsertOptionAttachment): Promise<OptionAttachment> {
    const [attachment] = await db.insert(schema.optionAttachments).values(insertAttachment).returning();
    return attachment;
  }

  async getOptionAttachmentById(id: string): Promise<OptionAttachment | undefined> {
    const [attachment] = await db.select().from(schema.optionAttachments).where(eq(schema.optionAttachments.id, id)).limit(1);
    return attachment;
  }

  async updateOptionAttachment(id: string, data: Partial<InsertOptionAttachment>): Promise<OptionAttachment | undefined> {
    const [attachment] = await db.update(schema.optionAttachments).set(data).where(eq(schema.optionAttachments.id, id)).returning();
    return attachment;
  }

  async deleteOptionAttachment(id: string): Promise<boolean> {
    const result = await db.delete(schema.optionAttachments).where(eq(schema.optionAttachments.id, id));
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
        { companyId, name: "Owner", description: "Full system administration access", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 0 },
        { companyId, name: "Admin", description: "Company administration and management", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 1 },
        { companyId, name: "Project Manager", description: "Project oversight and financial management", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 2 },
        { companyId, name: "Site Supervisor", description: "On-site team lead with field access", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 3 },
        { companyId, name: "Subcontractor", description: "External subcontractor with limited access", userCategory: "supplier" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 4 },
        { companyId, name: "Client", description: "Client portal access — read-only view of project progress", userCategory: "client" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 5 },
        { companyId, name: "Accounts", description: "Financial specialist with full billing and invoicing access", userCategory: "team" as UserCategory, isBuiltIn: true, isActive: true, displayOrder: 6 },
      ];

      let ownerRoleId = '';

      await db.transaction(async (tx) => {
        const insertedRoles = await tx.insert(schema.userRoles)
          .values(builtInRoles)
          .returning();

        const ownerRole = insertedRoles.find(r => r.name === "Owner");
        if (!ownerRole) {
          throw new Error("Failed to create Owner role");
        }
        ownerRoleId = ownerRole.id;

        const allPermissions = await tx.select().from(schema.permissions);

        // Owner gets full access to everything
        const ownerPermissions = allPermissions.map(permission => ({
          roleId: ownerRoleId,
          permissionId: permission.id,
          allowedActions: permission.actions as PermissionAction[],
        }));

        if (ownerPermissions.length > 0) {
          await tx.insert(schema.rolePermissions).values(ownerPermissions);
        }

        // Seed default permissions for other roles
        const permByKey: Record<string, typeof allPermissions[0]> = {};
        for (const p of allPermissions) permByKey[p.key] = p;

        for (const role of insertedRoles) {
          if (role.name === "Owner") continue;
          const defaultActions = getDefaultActionsForRole(role.name, allPermissions, permByKey);
          const rolePerms = Object.entries(defaultActions)
            .filter(([, actions]) => actions.length > 0)
            .map(([permId, actions]) => ({
              roleId: role.id,
              permissionId: permId,
              allowedActions: actions as PermissionAction[],
            }));
          if (rolePerms.length > 0) {
            await tx.insert(schema.rolePermissions).values(rolePerms);
          }
        }
      });

      return ownerRoleId;
    } catch (error) {
      console.error("Database error in seedDefaultRolesForCompany:", error);
      throw error;
    }
  }

  async resetDefaultPermissions(companyId: string): Promise<void> {
    try {
      const allPermissions = await db.select().from(schema.permissions);
      const permByKey: Record<string, typeof allPermissions[0]> = {};
      for (const p of allPermissions) permByKey[p.key] = p;

      const builtInRoles = await db.select().from(schema.userRoles)
        .where(and(eq(schema.userRoles.companyId, companyId), eq(schema.userRoles.isBuiltIn, true)));

      await db.transaction(async (tx) => {
        for (const role of builtInRoles) {
          await tx.delete(schema.rolePermissions)
            .where(eq(schema.rolePermissions.roleId, role.id));

          const isFullAdmin = ['owner', 'admin', 'general manager'].includes(role.name.toLowerCase());
          let rolePerms: { roleId: string; permissionId: string; allowedActions: PermissionAction[] }[];

          if (isFullAdmin) {
            rolePerms = allPermissions.map(p => ({
              roleId: role.id,
              permissionId: p.id,
              allowedActions: p.actions as PermissionAction[],
            }));
          } else {
            const defaultActions = getDefaultActionsForRole(role.name, allPermissions, permByKey);
            rolePerms = Object.entries(defaultActions)
              .filter(([, actions]) => actions.length > 0)
              .map(([permId, actions]) => ({
                roleId: role.id,
                permissionId: permId,
                allowedActions: actions as PermissionAction[],
              }));
          }

          if (rolePerms.length > 0) {
            await tx.insert(schema.rolePermissions).values(rolePerms);
          }
        }
      });
    } catch (error) {
      console.error("Database error in resetDefaultPermissions:", error);
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
  async getUserInvitation(id: string): Promise<UserInvitation | undefined> {
    try {
      const [invitation] = await db.select()
        .from(schema.userInvitations)
        .where(eq(schema.userInvitations.id, id))
        .limit(1);
      return invitation;
    } catch (error) {
      console.error("Database error in getUserInvitation:", error);
      throw error;
    }
  }

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

      // Grant project access from invitation.projectIds.
      // The admin selected these projects in InviteUserDialog; persist them now
      // so the new user can see/edit those projects on first login.
      try {
        const rawProjectIds = invitation.projectIds;
        const requestedProjectIds: string[] = Array.isArray(rawProjectIds)
          ? rawProjectIds.filter((p: unknown): p is string => typeof p === "string" && p.length > 0)
          : [];

        if (requestedProjectIds.length > 0) {
          // SECURITY: Only grant access to projects that belong to the
          // invitation's company. This blocks any cross-tenant escalation
          // path where an invitation row was created with foreign projectIds
          // (the create-invitation endpoint does not currently enforce this).
          const tenantSafeIds: string[] = [];
          for (const projectId of Array.from(new Set(requestedProjectIds))) {
            try {
              const project = await this.getProject(projectId);
              if (project && project.companyId === invitation.companyId) {
                tenantSafeIds.push(projectId);
              } else {
                console.warn(
                  `[DbStorage.acceptInvitation] Skipping project ${projectId} for user ${newUser.id}: not in invitation company ${invitation.companyId}`,
                );
              }
            } catch (lookupErr) {
              console.error(
                `[DbStorage.acceptInvitation] Failed to look up project ${projectId}:`,
                lookupErr,
              );
            }
          }

          // Dedupe against any access this user already has (covers the
          // existing-user-re-invited path; never downgrades existing rows).
          const existing = await this.getUserProjectAccess(newUser.id);
          const existingProjectIds = new Set(existing.map((a) => a.projectId));
          const toGrant = tenantSafeIds.filter((pid) => !existingProjectIds.has(pid));

          for (const projectId of toGrant) {
            try {
              await this.createUserProjectAccess({
                userId: newUser.id,
                projectId,
                accessLevel: "edit",
                grantedBy: invitation.invitedBy,
              });
            } catch (grantErr) {
              console.error(
                `[DbStorage.acceptInvitation] Failed to grant access to project ${projectId} for user ${newUser.id}:`,
                grantErr,
              );
            }
          }
          console.log(
            `[DbStorage.acceptInvitation] Granted ${toGrant.length}/${requestedProjectIds.length} project access rows to user ${newUser.id} (${requestedProjectIds.length - tenantSafeIds.length} skipped for tenant mismatch, ${tenantSafeIds.length - toGrant.length} already existed)`,
          );
        }
      } catch (accessErr) {
        // Never fail invitation acceptance because of a project-access grant problem.
        console.error("[DbStorage.acceptInvitation] Error granting project access:", accessErr);
      }

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

  async getPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | undefined> {
    try {
      const [token] = await db.select().from(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.token, tokenHash));
      return token;
    } catch (error) {
      console.error("Database error in getPasswordResetToken:", error);
      throw error;
    }
  }

  async deletePasswordResetToken(id: string): Promise<void> {
    try {
      await db.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.id, id));
    } catch (error) {
      console.error("Database error in deletePasswordResetToken:", error);
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
        // No project filter specified, but userId is provided.
        // Personal notes set ownerId (not assigneeId), so match either field
        // to correctly surface both personal notes and assigned project notes.
        baseConditions.push(
          or(
            eq(schema.notes.assigneeId, userId),
            eq(schema.notes.ownerId, userId)
          )
        );
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

  async getPersonalNotesByUser(userId: string, companyId: string): Promise<{ myNotes: Note[], assignedNotes: Note[] }> {
    try {
      // Personal notes: owned by this user, scope=personal, type=note
      const myNotes = await db
        .select()
        .from(schema.notes)
        .innerJoin(schema.users, eq(schema.notes.ownerId, schema.users.id))
        .where(and(
          eq(schema.notes.ownerId, userId),
          eq(schema.notes.scope, 'personal'),
          eq(schema.users.companyId, companyId),
          eq(schema.notes.type, 'note')
        ))
        .orderBy(desc(schema.notes.createdAt));

      // Assigned notes: any note where this user is in assigneeIds, not archived, not owned by them
      const assignedNotes = await db
        .select()
        .from(schema.notes)
        .innerJoin(schema.users, eq(schema.notes.companyId, schema.users.companyId))
        .where(and(
          eq(schema.users.id, userId),
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, 'note'),
          isNull(schema.notes.archivedAt),
          sql`${schema.notes.assigneeIds} @> ARRAY[${userId}]::text[]`,
          not(eq(schema.notes.ownerId, userId))
        ))
        .orderBy(desc(schema.notes.createdAt));

      return {
        myNotes: myNotes.map(r => r.notes) as Note[],
        assignedNotes: assignedNotes.map(r => r.notes) as Note[],
      };
    } catch (error) {
      console.error("Database error in getPersonalNotesByUser:", error);
      return { myNotes: [], assignedNotes: [] };
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
      // Manually delete records in tables that don't have ON DELETE CASCADE
      // on their project_id foreign key, to avoid FK constraint violations.
      await db.delete(schema.estimates).where(eq(schema.estimates.projectId, id));
      await db.delete(schema.rfqs).where(eq(schema.rfqs.projectId, id));
      await db.delete(schema.rfis).where(eq(schema.rfis.projectId, id));

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
      
      const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
        unitCostExTax: insertItem.unitCostExTax,
        quantity: insertItem.quantity,
        markupPercent: insertItem.markupPercent,
        projectMarkupPercent: estimate?.projectMarkupPercent,
        taxRate: estimate?.taxRate,
        existingPriceIncTax: insertItem.priceIncTax,
      });

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

      const preparedItems = insertItems.map(insertItem => {
        const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
          unitCostExTax: insertItem.unitCostExTax,
          quantity: insertItem.quantity,
          markupPercent: insertItem.markupPercent,
          projectMarkupPercent: estimate?.projectMarkupPercent,
          taxRate: estimate?.taxRate,
          existingPriceIncTax: insertItem.priceIncTax,
        });

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

      // Prepare update data. We trust priceIncTax/taxAmount when the caller
      // (typically the PATCH /api/estimate-items/:id route) has already
      // computed them — the route's recompute is the single source of truth
      // and correctly applies project-level markup. The previous in-storage
      // recompute here ignored quantity and markup entirely and overwrote
      // the route's correct values, corrupting prices on every edit that
      // touched unitCostExTax or quantity.
      const updateData: any = { ...item };

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

      // Get all groups for these estimates so we can attach groupName to each item
      const groupsRows = await db.select().from(schema.estimateGroups)
        .where(inArray(schema.estimateGroups.estimateId, estimateIds));
      const groupsMap = new Map(groupsRows.map(g => [g.id, g]));
      
      // For each item, calculate actual costs from bills and timesheets
      const allowancesWithCosts = await Promise.all(
        allowanceItems.map(async (item) => {
          const estimate = estimates.find(e => e.id === item.estimateId);
          const group = item.groupId ? groupsMap.get(item.groupId) : undefined;
          
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
          // price_inc_tax is stored in dollars; round to 2dp first to eliminate any
          // floating-point drift from the 3dp rounding used in older calculation paths
          const priceInCents = Math.round(Number((item.priceIncTax || 0).toFixed(2)) * 100);
          const variance = actualCost - priceInCents;
          
          return {
            item: {
              ...item,
              estimateName: estimate?.name || "Unknown",
              estimateVersion: estimate?.version || 1,
              groupName: group?.name || null,
              groupOrder: group?.order ?? null,
              priceIncTax: priceInCents,
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
        .orderBy(asc(schema.estimateGroups.order), asc(schema.estimateGroups.id));
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

      // Allow isCollapsed toggle on locked estimates (UI-only state)
      const onlyTogglingCollapse = Object.keys(updateGroup).length === 1 && 'isCollapsed' in updateGroup;
      if (!onlyTogglingCollapse) {
        const estimate = await this.getEstimate(existingGroup.estimateId);
        if (estimate?.isLocked) {
          throw new Error("Cannot update group in locked estimate. Unlock the estimate first.");
        }
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

      // Find max order among siblings to place duplicate at the bottom
      const [maxOrderResult] = await db
        .select({ maxOrder: max(schema.estimateGroups.order) })
        .from(schema.estimateGroups)
        .where(
          and(
            eq(schema.estimateGroups.estimateId, group[0].estimateId),
            group[0].parentGroupId
              ? eq(schema.estimateGroups.parentGroupId, group[0].parentGroupId)
              : isNull(schema.estimateGroups.parentGroupId)
          )
        );

      // Create duplicate with new ID
      const newGroupData = {
        ...group[0],
        id: undefined,
        name: `${group[0].name} (Copy)`,
        order: (maxOrderResult?.maxOrder ?? -1) + 1,
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
        // Recompute price against the TARGET estimate's project markup + tax
        // rate so cloned items don't carry stale cached cache values.
        const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
          unitCostExTax: item.unitCostExTax,
          quantity: item.quantity,
          markupPercent: item.markupPercent,
          projectMarkupPercent: targetEstimate.projectMarkupPercent,
          taxRate: targetEstimate.taxRate,
          existingPriceIncTax: item.priceIncTax,
        });

        const newItemData = {
          ...item,
          id: undefined,
          estimateId: targetEstimateId,
          groupId: newGroup.id,
          taxAmount,
          priceIncTax,
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

  async applyGroupCostCodeToItems(groupId: string, costCode: string | null, costCategoryId: string | null): Promise<number> {
    try {
      const updateData: Record<string, any> = {};
      if (costCode !== null) updateData.costCode = costCode;
      if (costCategoryId !== null) updateData.costCategoryId = costCategoryId;
      const result = await db
        .update(schema.estimateItems)
        .set(updateData)
        .where(eq(schema.estimateItems.groupId, groupId));
      return (result as any).rowCount ?? 0;
    } catch (error) {
      console.error("Database error in applyGroupCostCodeToItems:", error);
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

  // ── E-Notes ────────────────────────────────────────────────────────────────
  private defaultEnoteCategories = [
    { groupName: "Preliminaries", categories: ["Preliminaries", "Project Management", "Handover Inspection", "Job Specifications", "Site Supervision", "Travel & Accommodation", "Site Services", "Crane Hire", "Aluminium Scaffolding", "Edge Protection", "Set Out", "Surveyors"] },
    { groupName: "Demolition", categories: ["Demolition", "Entry", "Living", "Dining", "Kitchen", "Rumpus", "Bed 1", "Bed 2", "Bed 3", "Bed 4", "Bath 1", "Bath 2", "Ensuite", "Laundry", "Garage", "Outdoor Area"] },
    { groupName: "Site & Structure", categories: ["Work to Existing", "Excavation", "Concrete Works", "Structural Steel", "Sub-Floor", "Drainage"] },
    { groupName: "Framing & Roofing", categories: ["Framing", "L1 Floor", "L1 Frame", "L2 Floor", "L2 Frame", "Roof Framing", "Roofing", "WRB Roof & Batten", "WRB Walls & Batten"] },
    { groupName: "External", categories: ["External Linings", "Window Installation", "Eaves & Soffits", "Ventilation Detailing", "Passivhaus & Airtightness", "Brickwork", "External Cladding", "Decking & External Balustrades", "Fencing", "Driveways & Footpaths", "External Works", "Landscaping"] },
    { groupName: "Internal", categories: ["Internal Carpentry", "Internal Linings", "Insulation", "Waterproofing", "Tiling", "Painting", "Flooring"] },
    { groupName: "Fitout", categories: ["Fix Out", "Joinery", "Carpentry Fit Off", "Plumbing Fixtures", "Electrical Fitout", "Appliances"] },
    { groupName: "Services", categories: ["Plumbing Rough-In", "Electrical Rough-In", "HVAC", "Solar"] },
    { groupName: "Allowances", categories: ["General Allowances", "Provisional Sums", "Prime Cost Items", "Contingency"] },
  ];

  async getEstimateEnotes(estimateId: string): Promise<any[]> {
    try {
      const rows = await db
        .select()
        .from(schema.estimateEnotes)
        .where(eq(schema.estimateEnotes.estimateId, estimateId))
        .orderBy(schema.estimateEnotes.sortOrder);

      if (rows.length === 0) {
        // Seed defaults
        let order = 0;
        const toInsert: any[] = [];
        for (const group of this.defaultEnoteCategories) {
          for (const cat of group.categories) {
            toInsert.push({ estimateId, groupName: group.groupName, categoryName: cat, sortOrder: order++ });
          }
        }
        const seeded = await db.insert(schema.estimateEnotes).values(toInsert).returning();
        return seeded.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      }
      return rows;
    } catch (error) {
      console.error("Database error in getEstimateEnotes:", error);
      return [];
    }
  }

  async createEstimateEnote(data: any): Promise<any> {
    try {
      const [row] = await db.insert(schema.estimateEnotes).values(data).returning();
      return row;
    } catch (error) {
      console.error("Database error in createEstimateEnote:", error);
      throw error;
    }
  }

  async updateEstimateEnote(id: string, data: Partial<any>): Promise<any> {
    try {
      const [updated] = await db
        .update(schema.estimateEnotes)
        .set(data)
        .where(eq(schema.estimateEnotes.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateEstimateEnote:", error);
      throw error;
    }
  }

  async deleteEstimateEnote(id: string): Promise<{ success: boolean; reason?: string }> {
    try {
      const [row] = await db.select().from(schema.estimateEnotes).where(eq(schema.estimateEnotes.id, id));
      if (!row) return { success: false, reason: "not_found" };
      if (!row.isCustom) return { success: false, reason: "not_custom" };
      await db.delete(schema.estimateEnotes).where(eq(schema.estimateEnotes.id, id));
      return { success: true };
    } catch (error) {
      console.error("Database error in deleteEstimateEnote:", error);
      return { success: false, reason: "error" };
    }
  }

  // ── E-Note Attachments ─────────────────────────────────────────────────────
  async getEnoteAttachmentCounts(estimateId: string): Promise<Record<string, number>> {
    try {
      const rows = await db
        .select({
          enoteId: schema.enoteAttachments.enoteId,
          count: sql<number>`COUNT(*)`,
        })
        .from(schema.enoteAttachments)
        .innerJoin(schema.estimateEnotes, eq(schema.enoteAttachments.enoteId, schema.estimateEnotes.id))
        .where(eq(schema.estimateEnotes.estimateId, estimateId))
        .groupBy(schema.enoteAttachments.enoteId);
      const result: Record<string, number> = {};
      for (const r of rows) result[r.enoteId] = Number(r.count);
      return result;
    } catch (error) {
      console.error("Database error in getEnoteAttachmentCounts:", error);
      return {};
    }
  }

  async getEnoteAttachments(enoteId: string): Promise<any[]> {
    try {
      return await db
        .select()
        .from(schema.enoteAttachments)
        .where(eq(schema.enoteAttachments.enoteId, enoteId))
        .orderBy(schema.enoteAttachments.uploadedAt);
    } catch (error) {
      console.error("Database error in getEnoteAttachments:", error);
      return [];
    }
  }

  async createEnoteAttachment(data: any): Promise<any> {
    try {
      const [created] = await db
        .insert(schema.enoteAttachments)
        .values(data)
        .returning();
      return created;
    } catch (error) {
      console.error("Database error in createEnoteAttachment:", error);
      throw error;
    }
  }

  async deleteEnoteAttachment(id: string): Promise<boolean> {
    try {
      await db.delete(schema.enoteAttachments).where(eq(schema.enoteAttachments.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteEnoteAttachment:", error);
      return false;
    }
  }

  // ── HBCF Project Tracker ────────────────────────────────────────────────────

  async getHbcfProjects(companyId: string): Promise<any[]> {
    try {
      return await db
        .select()
        .from(schema.hbcfProjects)
        .where(eq(schema.hbcfProjects.companyId, companyId))
        .orderBy(schema.hbcfProjects.sortOrder, schema.hbcfProjects.createdAt);
    } catch (error) {
      console.error("Database error in getHbcfProjects:", error);
      return [];
    }
  }

  async createHbcfProject(data: any): Promise<any> {
    try {
      const [row] = await db.insert(schema.hbcfProjects).values(data).returning();
      return row;
    } catch (error) {
      console.error("Database error in createHbcfProject:", error);
      throw error;
    }
  }

  async updateHbcfProject(id: string, data: Partial<any>): Promise<any> {
    try {
      const [updated] = await db
        .update(schema.hbcfProjects)
        .set(data)
        .where(eq(schema.hbcfProjects.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateHbcfProject:", error);
      throw error;
    }
  }

  async deleteHbcfProject(id: string): Promise<boolean> {
    try {
      await db.delete(schema.hbcfProjects).where(eq(schema.hbcfProjects.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteHbcfProject:", error);
      return false;
    }
  }

  // ── Labour Estimates ────────────────────────────────────────────────────────
  private defaultLabourCategories = [
    "Preliminaries", "Project Management Off-site", "Project Management On-site",
    "Site Establishment", "Set Out", "Demolition", "Works to Existing",
    "Excavation", "Concrete Works", "Structural Steel", "Sub-Floor", "Framing",
    "L1 Floor", "L1 Frame", "L2 Floor", "L2 Frame", "Roof Framing",
    "Window Installation", "WRB Roof & Batten", "WRB Walls & Batten",
    "Ventilation Detailing", "Passivhaus & Airtightness", "Eaves & Soffits",
    "External Linings", "Internal Carpentry", "Internal Linings",
    "Fix Out", "Carpentry Fit Off", "Decking & External Balustrades",
    "Driveways & Footpaths", "Fencing", "External Works",
    "General Allowances & Handover",
  ];

  async getLabourEstimate(projectId: string, companyId: string): Promise<any | undefined> {
    try {
      const [row] = await db
        .select()
        .from(schema.labourEstimates)
        .where(eq(schema.labourEstimates.projectId, projectId))
        .limit(1);
      return row;
    } catch (error) {
      console.error("Database error in getLabourEstimate:", error);
      return undefined;
    }
  }

  async createLabourEstimate(data: any): Promise<any> {
    try {
      const [row] = await db.insert(schema.labourEstimates).values(data).returning();
      // Seed default categories
      const cats = this.defaultLabourCategories.map((name, i) => ({
        labourEstimateId: row.id,
        name,
        sortOrder: i,
        status: "not_complete",
      }));
      await db.insert(schema.labourEstimateCategories).values(cats);
      return row;
    } catch (error) {
      console.error("Database error in createLabourEstimate:", error);
      throw error;
    }
  }

  async updateLabourEstimate(id: string, data: Partial<any>): Promise<any> {
    try {
      const [row] = await db
        .update(schema.labourEstimates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.labourEstimates.id, id))
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in updateLabourEstimate:", error);
      throw error;
    }
  }

  async getLabourEstimateCategories(labourEstimateId: string): Promise<any[]> {
    try {
      const categories = await db
        .select()
        .from(schema.labourEstimateCategories)
        .where(eq(schema.labourEstimateCategories.labourEstimateId, labourEstimateId))
        .orderBy(schema.labourEstimateCategories.sortOrder);
      if (categories.length === 0) return [];
      const catIds = categories.map(c => c.id);
      const tasks = await db
        .select({ categoryId: schema.labourEstimateTasks.categoryId, totalHours: schema.labourEstimateTasks.totalHours })
        .from(schema.labourEstimateTasks)
        .where(inArray(schema.labourEstimateTasks.categoryId, catIds));
      const hoursByCat: Record<string, number> = {};
      for (const t of tasks) {
        hoursByCat[t.categoryId] = (hoursByCat[t.categoryId] ?? 0) + t.totalHours;
      }
      return categories.map(c => ({ ...c, totalHours: hoursByCat[c.id] ?? 0 }));
    } catch (error) {
      console.error("Database error in getLabourEstimateCategories:", error);
      return [];
    }
  }

  async createLabourEstimateCategory(labourEstimateId: string, name: string): Promise<any> {
    try {
      const existing = await db
        .select({ sortOrder: schema.labourEstimateCategories.sortOrder })
        .from(schema.labourEstimateCategories)
        .where(eq(schema.labourEstimateCategories.labourEstimateId, labourEstimateId))
        .orderBy(desc(schema.labourEstimateCategories.sortOrder))
        .limit(1);
      const nextOrder = (existing[0]?.sortOrder ?? -1) + 1;
      const [row] = await db.insert(schema.labourEstimateCategories).values({
        labourEstimateId,
        name,
        status: "not_complete",
        sortOrder: nextOrder,
      }).returning();
      return { ...row, totalHours: 0 };
    } catch (error) {
      console.error("Database error in createLabourEstimateCategory:", error);
      throw error;
    }
  }

  async deleteLabourEstimateCategory(id: string): Promise<boolean> {
    try {
      await db.delete(schema.labourEstimateCategories).where(eq(schema.labourEstimateCategories.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteLabourEstimateCategory:", error);
      return false;
    }
  }

  async reorderLabourEstimateCategories(updates: { id: string; sortOrder: number }[]): Promise<void> {
    try {
      for (const { id, sortOrder } of updates) {
        await db.update(schema.labourEstimateCategories).set({ sortOrder }).where(eq(schema.labourEstimateCategories.id, id));
      }
    } catch (error) {
      console.error("Database error in reorderLabourEstimateCategories:", error);
      throw error;
    }
  }

  async updateLabourEstimateCategory(id: string, data: Partial<any>): Promise<any> {
    try {
      const [row] = await db
        .update(schema.labourEstimateCategories)
        .set(data)
        .where(eq(schema.labourEstimateCategories.id, id))
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in updateLabourEstimateCategory:", error);
      throw error;
    }
  }

  async getLabourEstimateTasks(categoryId: string): Promise<any[]> {
    try {
      return await db
        .select()
        .from(schema.labourEstimateTasks)
        .where(eq(schema.labourEstimateTasks.categoryId, categoryId))
        .orderBy(schema.labourEstimateTasks.sortOrder);
    } catch (error) {
      console.error("Database error in getLabourEstimateTasks:", error);
      return [];
    }
  }

  async createLabourEstimateTask(data: any): Promise<any> {
    try {
      const total = (data.numMen ?? 1) * (data.hoursPerMan ?? 0);
      const [row] = await db.insert(schema.labourEstimateTasks).values({ ...data, totalHours: total }).returning();
      return row;
    } catch (error) {
      console.error("Database error in createLabourEstimateTask:", error);
      throw error;
    }
  }

  async updateLabourEstimateTask(id: string, data: Partial<any>): Promise<any> {
    try {
      const existing = await db.select().from(schema.labourEstimateTasks).where(eq(schema.labourEstimateTasks.id, id)).limit(1);
      const merged = { ...existing[0], ...data };
      const total = (merged.numMen ?? 1) * (merged.hoursPerMan ?? 0);
      const [row] = await db
        .update(schema.labourEstimateTasks)
        .set({ ...data, totalHours: total })
        .where(eq(schema.labourEstimateTasks.id, id))
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in updateLabourEstimateTask:", error);
      throw error;
    }
  }

  async deleteLabourEstimateTask(id: string): Promise<boolean> {
    try {
      await db.delete(schema.labourEstimateTasks).where(eq(schema.labourEstimateTasks.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteLabourEstimateTask:", error);
      return false;
    }
  }

  async reorderLabourEstimateTasks(updates: { id: string; sortOrder: number }[]): Promise<void> {
    try {
      for (const { id, sortOrder } of updates) {
        await db.update(schema.labourEstimateTasks).set({ sortOrder }).where(eq(schema.labourEstimateTasks.id, id));
      }
    } catch (error) {
      console.error("Database error in reorderLabourEstimateTasks:", error);
      throw error;
    }
  }

  async getLabourTaskTemplates(companyId: string, categoryName?: string): Promise<any[]> {
    try {
      const conditions = [eq(schema.labourTaskTemplates.companyId, companyId)];
      if (categoryName) conditions.push(eq(schema.labourTaskTemplates.categoryName, categoryName));
      return await db
        .select()
        .from(schema.labourTaskTemplates)
        .where(and(...conditions))
        .orderBy(schema.labourTaskTemplates.categoryName, schema.labourTaskTemplates.sortOrder);
    } catch (error) {
      console.error("Database error in getLabourTaskTemplates:", error);
      return [];
    }
  }

  async createLabourTaskTemplate(data: any): Promise<any> {
    try {
      const [row] = await db.insert(schema.labourTaskTemplates).values(data).returning();
      return row;
    } catch (error) {
      console.error("Database error in createLabourTaskTemplate:", error);
      throw error;
    }
  }

  async updateLabourTaskTemplate(id: string, data: Partial<any>): Promise<any> {
    try {
      const [row] = await db.update(schema.labourTaskTemplates).set(data).where(eq(schema.labourTaskTemplates.id, id)).returning();
      return row;
    } catch (error) {
      console.error("Database error in updateLabourTaskTemplate:", error);
      throw error;
    }
  }

  async deleteLabourTaskTemplate(id: string): Promise<boolean> {
    try {
      await db.delete(schema.labourTaskTemplates).where(eq(schema.labourTaskTemplates.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteLabourTaskTemplate:", error);
      return false;
    }
  }

  async reorderLabourTaskTemplates(updates: { id: string; sortOrder: number }[]): Promise<void> {
    try {
      for (const { id, sortOrder } of updates) {
        await db.update(schema.labourTaskTemplates).set({ sortOrder }).where(eq(schema.labourTaskTemplates.id, id));
      }
    } catch (error) {
      console.error("Database error in reorderLabourTaskTemplates:", error);
      throw error;
    }
  }

  async copyCategoryToTemplate(companyId: string, categoryId: string, categoryName: string): Promise<any[]> {
    try {
      const tasks = await db.select().from(schema.labourEstimateTasks)
        .where(eq(schema.labourEstimateTasks.categoryId, categoryId))
        .orderBy(schema.labourEstimateTasks.sortOrder);
      if (tasks.length === 0) return [];
      const templateItems = tasks.map((t, i) => ({
        companyId,
        categoryName,
        description: t.description,
        subHeading: t.subHeading,
        numMen: t.numMen,
        hoursPerMan: t.hoursPerMan,
        sortOrder: i,
      }));
      const inserted = await db.insert(schema.labourTaskTemplates).values(templateItems).returning();
      return inserted;
    } catch (error) {
      console.error("Database error in copyCategoryToTemplate:", error);
      throw error;
    }
  }

  async getEnoteTemplates(companyId: string): Promise<any[]> {
    try {
      return await db.select().from(schema.enoteTemplates)
        .where(eq(schema.enoteTemplates.companyId, companyId))
        .orderBy(schema.enoteTemplates.sortOrder);
    } catch (error) {
      console.error("Database error in getEnoteTemplates:", error);
      return [];
    }
  }

  async createEnoteTemplate(data: any): Promise<any> {
    try {
      const [row] = await db.insert(schema.enoteTemplates).values(data).returning();
      return row;
    } catch (error) {
      console.error("Database error in createEnoteTemplate:", error);
      throw error;
    }
  }

  async updateEnoteTemplate(id: string, data: Partial<any>): Promise<any> {
    try {
      const [row] = await db.update(schema.enoteTemplates).set(data).where(eq(schema.enoteTemplates.id, id)).returning();
      return row;
    } catch (error) {
      console.error("Database error in updateEnoteTemplate:", error);
      throw error;
    }
  }

  async deleteEnoteTemplate(id: string): Promise<boolean> {
    try {
      await db.delete(schema.enoteTemplates).where(eq(schema.enoteTemplates.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteEnoteTemplate:", error);
      return false;
    }
  }

  async getEnoteTemplateSets(companyId: string): Promise<any[]> {
    try {
      return await db.select().from(schema.enoteTemplateSets)
        .where(eq(schema.enoteTemplateSets.companyId, companyId))
        .orderBy(schema.enoteTemplateSets.createdAt);
    } catch (error) {
      console.error("Database error in getEnoteTemplateSets:", error);
      return [];
    }
  }

  async createEnoteTemplateSet(data: { companyId: string; name: string }): Promise<any> {
    try {
      const [row] = await db.insert(schema.enoteTemplateSets).values(data).returning();
      return row;
    } catch (error) {
      console.error("Database error in createEnoteTemplateSet:", error);
      throw error;
    }
  }

  async renameEnoteTemplateSet(id: string, name: string): Promise<any> {
    try {
      const [row] = await db.update(schema.enoteTemplateSets).set({ name }).where(eq(schema.enoteTemplateSets.id, id)).returning();
      return row;
    } catch (error) {
      console.error("Database error in renameEnoteTemplateSet:", error);
      throw error;
    }
  }

  async deleteEnoteTemplateSet(id: string): Promise<boolean> {
    try {
      await db.delete(schema.enoteTemplates).where(eq(schema.enoteTemplates.templateSetId, id));
      await db.delete(schema.enoteTemplateSets).where(eq(schema.enoteTemplateSets.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteEnoteTemplateSet:", error);
      return false;
    }
  }

  async getEnoteTemplateSetRows(templateSetId: string): Promise<any[]> {
    try {
      return await db.select().from(schema.enoteTemplates)
        .where(eq(schema.enoteTemplates.templateSetId, templateSetId))
        .orderBy(schema.enoteTemplates.sortOrder);
    } catch (error) {
      console.error("Database error in getEnoteTemplateSetRows:", error);
      return [];
    }
  }

  async saveEstimateAsEnoteTemplate(estimateId: string, companyId: string, templateName: string): Promise<any> {
    try {
      const [templateSet] = await db.insert(schema.enoteTemplateSets).values({ companyId, name: templateName }).returning();
      const enotes = await db.select().from(schema.estimateEnotes)
        .where(eq(schema.estimateEnotes.estimateId, estimateId))
        .orderBy(schema.estimateEnotes.sortOrder);
      if (enotes.length > 0) {
        const rows = enotes.map((e: any, i: number) => ({
          companyId,
          groupName: e.groupName,
          categoryName: e.categoryName,
          brainstormNotes: e.brainstormNotes ?? null,
          isRequired: e.required ?? false,
          sortOrder: i,
          templateSetId: templateSet.id,
        }));
        await db.insert(schema.enoteTemplates).values(rows);
      }
      return templateSet;
    } catch (error) {
      console.error("Database error in saveEstimateAsEnoteTemplate:", error);
      throw error;
    }
  }

  async applyEnoteTemplateSetToEstimate(templateSetId: string, estimateId: string, companyId: string, replaceExisting: boolean): Promise<any[]> {
    try {
      const templateRows = await db.select().from(schema.enoteTemplates)
        .where(eq(schema.enoteTemplates.templateSetId, templateSetId))
        .orderBy(schema.enoteTemplates.sortOrder);
      if (templateRows.length === 0) return [];
      if (replaceExisting) {
        await db.delete(schema.estimateEnotes).where(eq(schema.estimateEnotes.estimateId, estimateId));
      }
      const newRows = templateRows.map((t: any, i: number) => ({
        estimateId,
        groupName: t.groupName,
        categoryName: t.categoryName,
        brainstormNotes: t.brainstormNotes ?? null,
        required: t.isRequired,
        sortOrder: i,
        completed: false,
        status: "pending",
      }));
      const inserted = await db.insert(schema.estimateEnotes).values(newRows).returning();
      return inserted;
    } catch (error) {
      console.error("Database error in applyEnoteTemplateSetToEstimate:", error);
      throw error;
    }
  }

  async applyLabourTemplate(companyId: string, categoryId: string, categoryName: string): Promise<any[]> {
    try {
      const templates = await db
        .select()
        .from(schema.labourTaskTemplates)
        .where(and(eq(schema.labourTaskTemplates.companyId, companyId), eq(schema.labourTaskTemplates.categoryName, categoryName)))
        .orderBy(schema.labourTaskTemplates.sortOrder);
      if (templates.length === 0) return [];
      const tasks = templates.map((t, i) => ({
        categoryId,
        description: t.description,
        subHeading: t.subHeading,
        numMen: t.numMen,
        hoursPerMan: t.hoursPerMan,
        totalHours: t.numMen * t.hoursPerMan,
        sortOrder: i,
      }));
      const inserted = await db.insert(schema.labourEstimateTasks).values(tasks).returning();
      return inserted;
    } catch (error) {
      console.error("Database error in applyLabourTemplate:", error);
      throw error;
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

      // Recompute price against the TARGET estimate's project markup + tax
      // rate so cloned items don't carry stale cached values.
      const { taxAmount, priceIncTax } = resolveEstimateStoredPrice({
        unitCostExTax: item[0].unitCostExTax,
        quantity: item[0].quantity,
        markupPercent: item[0].markupPercent,
        projectMarkupPercent: targetEstimate.projectMarkupPercent,
        taxRate: targetEstimate.taxRate,
        existingPriceIncTax: item[0].priceIncTax,
      });

      // Create copy in target estimate (without group assignment)
      const newItemData = {
        ...item[0],
        id: undefined,
        estimateId: targetEstimateId,
        groupId: null, // Don't assign to a group in target estimate
        taxAmount,
        priceIncTax,
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

  async bulkUpdateCostCodes(ids: string[], updates: Partial<InsertCostCode>, companyId: string): Promise<CostCode[]> {
    if (ids.length === 0) return [];
    try {
      const result = await db
        .update(schema.costCodes)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(and(
          inArray(schema.costCodes.id, ids),
          eq(schema.costCodes.companyId, companyId)
        ))
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in bulkUpdateCostCodes:", error);
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

  async createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate> {
    const [currentEstimate] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!currentEstimate) throw new Error("Estimate not found");

    // Lock the current version (preserve its workflow status — a parent that
    // was Approved or Contract should keep that status).
    await db.update(schema.estimates)
      .set({ isLocked: true, updatedAt: new Date() })
      .where(eq(schema.estimates.id, estimateId));

    // parentEstimateId always points to the original Rev A (root) estimate
    const parentEstimateId = currentEstimate.parentEstimateId || estimateId;
    const newId = randomUUID();
    const now = new Date();

    const [newVersion] = await db.insert(schema.estimates).values({
      ...currentEstimate,
      ...newVersionData,
      id: newId,
      version: currentEstimate.version + 1,
      isLocked: false,
      status: "draft",
      approvedAt: null,
      approvedById: null,
      contractedAt: null,
      contractedById: null,
      parentEstimateId,
      createdAt: now,
      updatedAt: now,
    }).returning();

    // Clone groups and build a mapping old→new group id
    const groups = await db.select().from(schema.estimateGroups).where(eq(schema.estimateGroups.estimateId, estimateId));
    const groupMapping = new Map<string, string>();
    for (const group of groups) {
      const newGroupId = randomUUID();
      groupMapping.set(group.id, newGroupId);
      await db.insert(schema.estimateGroups).values({
        ...group,
        id: newGroupId,
        estimateId: newId,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Clone items with updated groupId references
    const items = await db.select().from(schema.estimateItems).where(eq(schema.estimateItems.estimateId, estimateId));
    for (const item of items) {
      await db.insert(schema.estimateItems).values({
        ...item,
        id: randomUUID(),
        estimateId: newId,
        groupId: item.groupId ? (groupMapping.get(item.groupId) ?? null) : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return newVersion;
  }

  async getEstimateVersions(estimateId: string): Promise<Estimate[]> {
    const [current] = await db.select().from(schema.estimates).where(eq(schema.estimates.id, estimateId)).limit(1);
    if (!current) return [];
    const rootId = current.parentEstimateId || estimateId;
    return db.select().from(schema.estimates)
      .where(or(eq(schema.estimates.id, rootId), eq(schema.estimates.parentEstimateId, rootId)))
      .orderBy(asc(schema.estimates.version));
  }

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

  async updateEstimateStatus(estimateId: string, patch: Partial<Estimate>): Promise<Estimate | undefined> {
    try {
      const result = await db.update(schema.estimates)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.estimates.id, estimateId))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateEstimateStatus:", error);
      throw error;
    }
  }

  async promoteEstimateToContract(estimateId: string, userId: string): Promise<Estimate | undefined> {
    // One Contract per project: demote any existing Contract on the same
    // project back to Approved (kept locked), then promote this one.
    try {
      const target = await this.getEstimate(estimateId);
      if (!target) return undefined;
      return await db.transaction(async (tx) => {
        await tx.update(schema.estimates)
          .set({ status: "approved", updatedAt: new Date() })
          .where(and(
            eq(schema.estimates.projectId, target.projectId),
            eq(schema.estimates.status, "contract"),
            ne(schema.estimates.id, estimateId),
          ));
        const result = await tx.update(schema.estimates)
          .set({
            status: "contract",
            isLocked: true,
            contractedAt: new Date(),
            contractedById: userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        return result[0];
      });
    } catch (error) {
      console.error("Database error in promoteEstimateToContract:", error);
      throw error;
    }
  }

  /**
   * Atomic "Approve" for the Estimate-to-Contract flow. In a single DB
   * transaction:
   *   - any existing contract estimate on the same project is demoted to
   *     "approved" (kept locked);
   *   - the target estimate is promoted to "contract" with isLocked=true,
   *     contractedAt/contractedById, and approvedAt/approvedById stamped if
   *     not already set;
   *   - the project's selectedEstimateId is set to the target estimate, and
   *     contractPrice is overwritten with the supplied total.
   * If any step fails, the whole change is rolled back so neither the
   * estimate, project, budget, nor labour-hours rows can disagree about
   * which estimate is the contract. Budget + labour-hours recalcs run
   * inside the same transaction and rollback together with the contract
   * promotion if any step throws. Recalc warnings are returned as a
   * separate field for callers that want to surface partial-failure
   * messaging (currently always empty since failures roll back).
   */
  // Stage 1 of the approval workflow. Promotes an estimate to "approved":
  // it becomes the project's selected estimate and its canonical total is
  // stamped onto projects.contractPrice, but it stays UNLOCKED so the
  // contract price tracks further edits live. Refuses if a DIFFERENT estimate
  // on the project is already a locked contract — the user must revert that
  // contract first (an explicit replace).
  async approveEstimate(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined> {
    try {
      const target = await this.getEstimate(estimateId);
      if (!target || !target.projectId) return undefined;
      const projectId = target.projectId;

      // A locked contract estimate must only be unlocked via the explicit
      // revert flow — never silently demoted by re-approving it here.
      if (target.status === "contract") {
        throw new Error("ALREADY_CONTRACT");
      }

      const lockedContracts = await db
        .select({ id: schema.estimates.id })
        .from(schema.estimates)
        .where(and(
          eq(schema.estimates.projectId, projectId),
          eq(schema.estimates.status, "contract"),
          ne(schema.estimates.id, estimateId),
        ));
      if (lockedContracts.length > 0) {
        throw new Error("LOCKED_CONTRACT_EXISTS");
      }

      // Canonical estimate total (cents) — the single source of truth.
      const summary = await this.getEstimateSummary(estimateId);
      const contractPriceCents = Math.round((summary.total || 0) * 100);

      return await db.transaction(async (tx) => {
        const promotedRows = await tx.update(schema.estimates)
          .set({
            status: "approved",
            isLocked: false,
            approvedAt: target.approvedAt ?? new Date(),
            approvedById: target.approvedById ?? userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        const promoted = promotedRows[0];
        if (!promoted) {
          throw new Error("Failed to approve estimate");
        }

        const updatedProjectRows = await tx.update(schema.projects)
          .set({
            selectedEstimateId: estimateId,
            contractPrice: contractPriceCents > 0 ? contractPriceCents : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, projectId))
          .returning();
        const updatedProject = updatedProjectRows[0];
        if (!updatedProject) {
          throw new Error("Failed to update project for approved estimate");
        }

        const recomputedBudget = await this.calculateBudget(projectId, tx);
        if (recomputedBudget) {
          await this.recalculateBudgetLineItems(recomputedBudget.id, tx);
        }
        await this.recalculateLabourHoursBudget(projectId, tx);

        return { estimate: promoted, project: updatedProject, recalcWarnings: [] };
      });
    } catch (error) {
      console.error("Database error in approveEstimate:", error);
      throw error;
    }
  }

  // Stage 2 of the approval workflow. Locks an approved estimate as the
  // contract: freezes the canonical total onto projects.contractPrice, sets
  // isLocked + contracted audit fields, and demotes any prior contract back to
  // approved. Budget + labour-hours recalcs run inside the same transaction so
  // everything commits or rolls back together.
  async markEstimateAsContract(
    estimateId: string,
    userId: string,
  ): Promise<{ estimate: Estimate; project: Project; recalcWarnings: string[] } | undefined> {
    try {
      const target = await this.getEstimate(estimateId);
      if (!target || !target.projectId) return undefined;
      const projectId = target.projectId;

      // Freeze the canonical estimate total (cents).
      const summary = await this.getEstimateSummary(estimateId);
      const contractPriceCents = Math.round((summary.total || 0) * 100);

      return await db.transaction(async (tx) => {
        // Demote any prior contract on this project (and unlock it).
        await tx.update(schema.estimates)
          .set({
            status: "approved",
            isLocked: false,
            contractedAt: null,
            contractedById: null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(schema.estimates.projectId, projectId),
            eq(schema.estimates.status, "contract"),
            ne(schema.estimates.id, estimateId),
          ));

        // Promote target + stamp approve/contract audit fields + lock.
        const promotedRows = await tx.update(schema.estimates)
          .set({
            status: "contract",
            isLocked: true,
            contractedAt: new Date(),
            contractedById: userId,
            approvedAt: target.approvedAt ?? new Date(),
            approvedById: target.approvedById ?? userId,
            updatedAt: new Date(),
          })
          .where(eq(schema.estimates.id, estimateId))
          .returning();
        const promoted = promotedRows[0];
        if (!promoted) {
          throw new Error("Failed to promote estimate to contract");
        }

        // Update project selectedEstimateId + frozen contractPrice in the same tx.
        const updatedProjectRows = await tx.update(schema.projects)
          .set({
            selectedEstimateId: estimateId,
            contractPrice: contractPriceCents > 0 ? contractPriceCents : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.projects.id, projectId))
          .returning();
        const updatedProject = updatedProjectRows[0];
        if (!updatedProject) {
          throw new Error("Failed to update project for contract estimate");
        }

        const recomputedBudget = await this.calculateBudget(projectId, tx);
        if (recomputedBudget) {
          await this.recalculateBudgetLineItems(recomputedBudget.id, tx);
        }
        await this.recalculateLabourHoursBudget(projectId, tx);

        return { estimate: promoted, project: updatedProject, recalcWarnings: [] };
      });
    } catch (error) {
      console.error("Database error in markEstimateAsContract:", error);
      throw error;
    }
  }

  // Idempotent backfill. For every project that has a selected estimate,
  // recompute the canonical estimate total and update projects.contractPrice
  // when the cached snapshot has drifted. Non-destructive (only corrects a
  // derived cache) — safe to run on every startup.
  async recomputeContractPriceSnapshots(): Promise<{ scanned: number; updated: number }> {
    let scanned = 0;
    let updated = 0;
    try {
      const rows = await db
        .select({
          id: schema.projects.id,
          selectedEstimateId: schema.projects.selectedEstimateId,
          contractPrice: schema.projects.contractPrice,
        })
        .from(schema.projects)
        .where(isNotNull(schema.projects.selectedEstimateId));
      for (const row of rows) {
        if (!row.selectedEstimateId) continue;
        scanned++;
        try {
          const summary = await this.getEstimateSummary(row.selectedEstimateId);
          const cents = Math.round((summary.total || 0) * 100);
          if (cents <= 0) continue;
          const current = Number(row.contractPrice) || 0;
          if (current !== cents) {
            await db.update(schema.projects)
              .set({ contractPrice: cents, updatedAt: new Date() })
              .where(eq(schema.projects.id, row.id));
            updated++;
          }
        } catch (err) {
          console.error(`[recomputeContractPriceSnapshots] project ${row.id} failed:`, err);
        }
      }
    } catch (err) {
      console.error("[recomputeContractPriceSnapshots] failed:", err);
    }
    return { scanned, updated };
  }

  async getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    builderCostTotal: number;
    lineItemMarkupAmount: number;
    subtotalExTax: number;
    globalMarkupPercent: number;
    globalMarkupAmount: number;
    totalExTax: number;
    taxAmount: number;
    total: number;
    itemCount: number;
    markupAmount: number;
    subtotalWithMarkup: number;
  }> {
    try {
      const items = await this.getEstimateItems(estimateId);
      const estimate = await this.getEstimate(estimateId);
      return computeEstimateSummary(items, {
        projectMarkupPercent: estimate?.projectMarkupPercent,
        taxRate: estimate?.taxRate,
      });
    } catch (error) {
      console.error("Database error in getEstimateSummary:", error);
      return { subtotal: 0, builderCostTotal: 0, lineItemMarkupAmount: 0, subtotalExTax: 0, globalMarkupPercent: 0, globalMarkupAmount: 0, totalExTax: 0, taxAmount: 0, total: 0, itemCount: 0, markupAmount: 0, subtotalWithMarkup: 0 };
    }
  }
  
  // Scope Item Type Definitions CRUD
  async getScopeItemTypeDefinitions(companyId: string): Promise<ScopeItemTypeDefinition[]> {
    try {
      const defs = await db.select().from(schema.scopeItemTypeDefinitions)
        .where(eq(schema.scopeItemTypeDefinitions.companyId, companyId))
        .orderBy(asc(schema.scopeItemTypeDefinitions.displayOrder));
      return defs;
    } catch (error) {
      console.error("Database error in getScopeItemTypeDefinitions:", error);
      return [];
    }
  }

  async createScopeItemTypeDefinition(def: InsertScopeItemTypeDefinition): Promise<ScopeItemTypeDefinition> {
    const [created] = await db.insert(schema.scopeItemTypeDefinitions).values(def).returning();
    return created;
  }

  async updateScopeItemTypeDefinition(id: string, def: Partial<InsertScopeItemTypeDefinition>): Promise<ScopeItemTypeDefinition | undefined> {
    try {
      const [updated] = await db.update(schema.scopeItemTypeDefinitions)
        .set(def)
        .where(eq(schema.scopeItemTypeDefinitions.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateScopeItemTypeDefinition:", error);
      return undefined;
    }
  }

  async deleteScopeItemTypeDefinition(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.scopeItemTypeDefinitions)
        .where(eq(schema.scopeItemTypeDefinitions.id, id));
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error("Database error in deleteScopeItemTypeDefinition:", error);
      return false;
    }
  }

  async getScopeItemTypeDefinitionById(id: string): Promise<ScopeItemTypeDefinition | undefined> {
    const [def] = await db.select().from(schema.scopeItemTypeDefinitions)
      .where(eq(schema.scopeItemTypeDefinitions.id, id))
      .limit(1);
    return def;
  }

  async reorderScopeItemTypeDefinitions(orderedIds: string[], companyId: string): Promise<void> {
    // Only update IDs that belong to the specified company (prevents cross-tenant IDOR)
    await Promise.all(
      orderedIds.map((id, index) =>
        db.update(schema.scopeItemTypeDefinitions)
          .set({ displayOrder: index })
          .where(
            and(
              eq(schema.scopeItemTypeDefinitions.id, id),
              eq(schema.scopeItemTypeDefinitions.companyId, companyId)
            )
          )
      )
    );
  }

  async renameScopeItemTypeOnItems(companyId: string, oldName: string, newName: string): Promise<void> {
    // When a type definition is renamed, update all scope items for that company
    // so items with the old type string are updated to the new name (case-insensitive match).
    // This ensures scope items continue to match their definition after a rename.
    await db.update(schema.scopeItems)
      .set({ itemType: newName.toLowerCase() })
      .where(
        and(
          eq(schema.scopeItems.companyId, companyId),
          sql`lower(${schema.scopeItems.itemType}) = ${oldName.toLowerCase()}`
        )
      );
  }

  async seedDefaultScopeItemTypes(companyId: string): Promise<ScopeItemTypeDefinition[]> {
    const defaults = [
      { name: 'Scope', displayOrder: 0 },
      { name: 'Note', displayOrder: 1 },
      { name: 'E-Note', displayOrder: 2 },
      { name: 'Tool', displayOrder: 3 },
      { name: 'Material', displayOrder: 4 },
      { name: 'Proposal', displayOrder: 5 },
      { name: 'Checklist', displayOrder: 6 },
    ];
    const inserted = await db.insert(schema.scopeItemTypeDefinitions)
      .values(defaults.map(d => ({ ...d, companyId, visibleToRoles: [] })))
      .returning();
    return inserted;
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

  async bulkUpdateScopeItemsInStage(projectId: string, stageName: string, update: Partial<InsertScopeItem>): Promise<void> {
    try {
      await db.update(schema.scopeItems)
        .set({ ...update, updatedAt: new Date() })
        .where(and(
          eq(schema.scopeItems.projectId, projectId),
          eq(schema.scopeItems.stage, stageName),
        ));
    } catch (error) {
      console.error("Database error in bulkUpdateScopeItemsInStage:", error);
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
      // If the name is changing we need to (a) cascade the new name onto
      // every scope_items.stage that referenced the old text name and
      // (b) reject the update with a tagged error if it would collide
      // with another stage on the same project. Both of those need to
      // happen atomically with the update on scope_stages itself.
      const willRename = typeof stage.name === 'string';

      if (willRename) {
        const newName = (stage.name as string).trim();
        if (newName.length === 0) {
          const err: any = new Error("Stage name cannot be empty");
          err.code = 'STAGE_NAME_EMPTY';
          throw err;
        }

        const [current] = await db.select().from(schema.scopeStages)
          .where(eq(schema.scopeStages.id, id))
          .limit(1);
        if (!current) return undefined;

        const oldName = current.name;
        const normalizedNew = newName.toLowerCase();
        const normalizedOld = oldName.toLowerCase().trim();

        if (normalizedNew !== normalizedOld) {
          // Pre-check: would the rename collide with another stage on
          // this project? The DB index would catch it, but we surface a
          // clear error before opening a transaction.
          const collisions = await db.select().from(schema.scopeStages)
            .where(and(
              eq(schema.scopeStages.projectId, current.projectId),
              ne(schema.scopeStages.id, id),
              sql`lower(btrim(${schema.scopeStages.name})) = ${normalizedNew}`,
            ))
            .limit(1);
          if (collisions.length > 0) {
            const err: any = new Error(`A stage named "${newName}" already exists in this project`);
            err.code = 'STAGE_NAME_DUPLICATE';
            throw err;
          }

          return await db.transaction(async (tx) => {
            const [updated] = await tx.update(schema.scopeStages)
              .set({ ...stage, name: newName, updatedAt: new Date() })
              .where(eq(schema.scopeStages.id, id))
              .returning();

            // Cascade onto scope_items.stage so items follow the rename
            // instead of being orphaned by name. Match on the OLD name
            // (exact, since that is what the items currently store).
            await tx.update(schema.scopeItems)
              .set({ stage: newName, updatedAt: new Date() })
              .where(and(
                eq(schema.scopeItems.projectId, current.projectId),
                eq(schema.scopeItems.stage, oldName),
              ));

            return updated;
          });
        }
      }

      const [updated] = await db.update(schema.scopeStages)
        .set({ ...stage, updatedAt: new Date() })
        .where(eq(schema.scopeStages.id, id))
        .returning();
      return updated;
    } catch (error: any) {
      // Re-throw tagged errors so the route layer can translate them
      // (e.g. STAGE_NAME_DUPLICATE → 409). Swallow other DB errors as
      // before to preserve existing behavior.
      if (error?.code === 'STAGE_NAME_DUPLICATE' || error?.code === 'STAGE_NAME_EMPTY') {
        throw error;
      }
      // Re-throw the underlying PG unique-violation too, in case the
      // pre-check raced and the index was the one that caught it. Match
      // both bare driver errors and Drizzle wrappers (DrizzleQueryError),
      // and constraint-name fallbacks for safety.
      const causeCode = error?.cause?.code;
      const constraint = error?.constraint || error?.cause?.constraint;
      const message = String(error?.message || error?.cause?.message || '');
      if (
        error?.code === '23505' ||
        causeCode === '23505' ||
        constraint === 'scope_stages_project_normalized_name_unique' ||
        message.includes('scope_stages_project_normalized_name_unique')
      ) {
        throw error;
      }
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

  // One-shot repair: collapse scope_stages whose (project_id, lower(trim(name)))
  // collide. Picks the oldest row as the survivor, re-points anything that
  // referenced a duplicate's id (parentId on sibling stages, scopeStageId on
  // checklist_instances/schedule_items/task_templates/purchase_orders), merges
  // inline checklist + attachments arrays, and deletes the duplicate row.
  // Idempotent — safe to run on every startup.
  async repairDuplicateScopeStages(): Promise<{ projectsScanned: number; duplicatesRemoved: number }> {
    let projectsScanned = 0;
    let duplicatesRemoved = 0;
    try {
      const allStages = await db.select().from(schema.scopeStages)
        .orderBy(asc(schema.scopeStages.createdAt));

      // Group by project + normalized name
      const groups = new Map<string, typeof allStages>();
      const projectIds = new Set<string>();
      for (const stage of allStages) {
        projectIds.add(stage.projectId);
        const key = `${stage.projectId}::${stage.name.toLowerCase().trim()}`;
        const arr = groups.get(key) || [];
        arr.push(stage);
        groups.set(key, arr);
      }
      projectsScanned = projectIds.size;

      for (const [, stagesInGroup] of groups) {
        if (stagesInGroup.length <= 1) continue;

        // Survivor = oldest (groups are already sorted by createdAt asc)
        const survivor = stagesInGroup[0];
        const duplicates = stagesInGroup.slice(1);
        const dupIds = duplicates.map(d => d.id);

        // Merge inline arrays from duplicates onto survivor
        const mergedChecklist: any[] = Array.isArray(survivor.checklist) ? [...survivor.checklist] : [];
        const mergedAttachments: any[] = Array.isArray(survivor.attachments) ? [...survivor.attachments] : [];
        for (const dup of duplicates) {
          if (Array.isArray(dup.checklist)) mergedChecklist.push(...dup.checklist);
          if (Array.isArray(dup.attachments)) mergedAttachments.push(...dup.attachments);
        }

        // De-dup checklist by id, attachments by id
        const seenChecklist = new Set<string>();
        const dedupedChecklist = mergedChecklist.filter((c: any) => {
          if (!c?.id) return true;
          if (seenChecklist.has(c.id)) return false;
          seenChecklist.add(c.id);
          return true;
        });
        const seenAttach = new Set<string>();
        const dedupedAttachments = mergedAttachments.filter((a: any) => {
          if (!a?.id) return true;
          if (seenAttach.has(a.id)) return false;
          seenAttach.add(a.id);
          return true;
        });

        await db.transaction(async (tx) => {
          // Re-point everything that references the duplicate stage ids
          await tx.update(schema.checklistInstances)
            .set({ scopeStageId: survivor.id })
            .where(inArray(schema.checklistInstances.scopeStageId, dupIds));

          await tx.update(schema.scheduleItems)
            .set({ scopeStageId: survivor.id })
            .where(inArray(schema.scheduleItems.scopeStageId, dupIds));

          await tx.update(schema.taskTemplates)
            .set({ scopeStageId: survivor.id })
            .where(inArray(schema.taskTemplates.scopeStageId, dupIds));

          await tx.update(schema.purchaseOrders)
            .set({ scopeStageId: survivor.id })
            .where(inArray(schema.purchaseOrders.scopeStageId, dupIds));

          // Re-parent any sub-stages that pointed at a duplicate as their parent
          await tx.update(schema.scopeStages)
            .set({ parentId: survivor.id })
            .where(inArray(schema.scopeStages.parentId, dupIds));

          // scope_items.stage is a denormalized text field (matched by name,
          // scoped per project). When duplicates differ only by case/whitespace
          // (e.g. "Prelim" vs "Prelim "), items pointing at the duplicate's
          // raw name would be orphaned from the survivor's grouping. Re-point
          // them to the survivor's exact name so they stay visible.
          for (const dup of duplicates) {
            if (dup.name === survivor.name) continue;
            await tx.update(schema.scopeItems)
              .set({ stage: survivor.name, updatedAt: new Date() })
              .where(and(
                eq(schema.scopeItems.projectId, survivor.projectId),
                eq(schema.scopeItems.stage, dup.name),
              ));
          }

          // Persist merged inline arrays on survivor
          await tx.update(schema.scopeStages)
            .set({
              checklist: dedupedChecklist,
              attachments: dedupedAttachments,
              updatedAt: new Date(),
            })
            .where(eq(schema.scopeStages.id, survivor.id));

          // Drop the duplicate stage rows
          await tx.delete(schema.scopeStages)
            .where(inArray(schema.scopeStages.id, dupIds));
        });

        duplicatesRemoved += duplicates.length;
        console.log(`[scope-stage-repair] project=${survivor.projectId} merged ${duplicates.length} duplicate(s) of "${survivor.name}" into ${survivor.id}`);
      }
    } catch (error) {
      console.error("Database error in repairDuplicateScopeStages:", error);
    }
    return { projectsScanned, duplicatesRemoved };
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

      // Get existing stages for this project. Track them in a name-keyed
      // map so collisions during template apply re-use the existing row
      // instead of trying (and failing) to insert a duplicate.
      let existingStages = await this.getScopeStages(projectId);
      const stagesByNormalizedName = new Map<string, ScopeStage>();
      for (const s of existingStages) {
        stagesByNormalizedName.set(s.name.toLowerCase().trim(), s);
      }
      const existingStageNames = new Set(stagesByNormalizedName.keys());

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
          // Try to create the new stage. If the unique index trips
          // (concurrent template apply, or a duplicate within the
          // template payload itself), fall back to the existing row.
          try {
            const newStage = await this.createScopeStage({
              projectId,
              companyId,
              name: stageData.name,
              displayOrder: maxExistingOrder + i,
            });
            createdStageMap[stageData.name] = newStage.name;
            existingStageNames.add(normalizedName);
            stagesByNormalizedName.set(normalizedName, newStage);
          } catch (insertError: any) {
            const code = insertError?.code || insertError?.cause?.code;
            const constraint = insertError?.constraint || insertError?.cause?.constraint;
            const isUniqueViolation =
              code === '23505' ||
              (typeof constraint === 'string' && constraint.includes('scope_stages_project_normalized_name_unique'));
            if (!isUniqueViolation) throw insertError;

            // Refresh from DB once and re-resolve via the survivor
            existingStages = await this.getScopeStages(projectId);
            stagesByNormalizedName.clear();
            for (const s of existingStages) {
              stagesByNormalizedName.set(s.name.toLowerCase().trim(), s);
              existingStageNames.add(s.name.toLowerCase().trim());
            }
            const survivor = stagesByNormalizedName.get(normalizedName);
            if (survivor) {
              createdStageMap[stageData.name] = survivor.name;
            }
          }
        } else {
          // Stage already exists - map to existing name
          const existing = stagesByNormalizedName.get(normalizedName);
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

  async getCompanyByStripeCustomerId(customerId: string): Promise<import("@shared/schema").Company | undefined> {
    const [company] = await db.select().from(schema.companies)
      .where(eq(schema.companies.stripeCustomerId, customerId))
      .limit(1);
    return company;
  }

  async expireLapsedTrials(): Promise<{ expired: number }> {
    // Flip companies whose trial has lapsed to 'expired' and drop their
    // effective plan to what they chose at signup. Only touches 'trialing'
    // rows with a past trial_ends_at — idempotent and non-destructive.
    const result = await db.execute(sql`
      UPDATE companies
      SET plan_status = 'expired',
          plan = COALESCE(chosen_plan, 'builder'),
          updated_at = now()
      WHERE plan_status = 'trialing'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < now()
    `);
    return { expired: result.rowCount ?? 0 };
  }

  async getCompanySettings(): Promise<CompanySettings | undefined> { 
    // Get first (and only) company settings record
    const [settings] = await db.select().from(schema.companySettings).limit(1);
    return settings;
  }

  async getFirstCompanyId(): Promise<string | undefined> {
    // Prefer the company with the most real (non-system) users so we don't
    // accidentally stamp data onto an orphaned or demo company.
    const result = await db.execute(sql`
      SELECT company_id
      FROM users
      WHERE company_id IS NOT NULL
        AND email NOT LIKE '%@system.local'
        AND email NOT LIKE '%orphaned%'
      GROUP BY company_id
      ORDER BY COUNT(*) DESC
      LIMIT 1
    `);
    const rows = (result as any).rows ?? [];
    if (rows.length > 0) return rows[0].company_id as string;
    // Hard fallback: first company row
    const [company] = await db.select({ id: schema.companies.id }).from(schema.companies).limit(1);
    return company?.id;
  }
  
  async healUserRoleNameCache(): Promise<{ updated: number }> {
    try {
      const result = await db.execute(sql`
        UPDATE users u
        SET role_name = r.name
        FROM user_roles r
        WHERE u.role_id = r.id
          AND (u.role_name IS NULL OR u.role_name = '')
      `);
      return { updated: (result as any).rowCount ?? 0 };
    } catch (err) {
      console.error("healUserRoleNameCache failed (non-fatal):", err);
      return { updated: 0 };
    }
  }

  async backfillCompanySettingsCompanyId(): Promise<{ updated: boolean }> {
    try {
      const [settings] = await db.select({ id: schema.companySettings.id, companyId: schema.companySettings.companyId })
        .from(schema.companySettings).limit(1);
      if (!settings) return { updated: false };
      if (settings.companyId) return { updated: false }; // already set
      const primaryId = await this.getFirstCompanyId();
      if (!primaryId) return { updated: false };
      await db.update(schema.companySettings)
        .set({ companyId: primaryId })
        .where(eq(schema.companySettings.id, settings.id));
      return { updated: true };
    } catch (err) {
      console.error("backfillCompanySettingsCompanyId failed (non-fatal):", err);
      return { updated: false };
    }
  }

  async syncCompanyName(): Promise<{ synced: boolean; name?: string }> {
    try {
      const settings = await this.getCompanySettings();
      if (!settings?.companyName) return { synced: false };
      const primaryId = await this.getFirstCompanyId();
      if (!primaryId) return { synced: false };
      await db.update(schema.companies)
        .set({ name: settings.companyName })
        .where(and(
          eq(schema.companies.id, primaryId),
          ne(schema.companies.name, settings.companyName),
        ));
      return { synced: true, name: settings.companyName };
    } catch (err) {
      console.error("syncCompanyName failed (non-fatal):", err);
      return { synced: false };
    }
  }

  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> {
    // Get existing settings
    const existing = await this.getCompanySettings();
    
    if (existing) {
      // Update existing record
      const [updated] = await db.update(schema.companySettings)
        .set({ ...settings, updatedAt: new Date() } as any)
        .where(eq(schema.companySettings.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new record
      const [created] = await db.insert(schema.companySettings)
        .values(settings as any)
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
        description: optData.description ?? null,
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
  async getClientSelections(projectId: string): Promise<ClientSelection[]> { return []; }
  async createClientSelection(selection: InsertClientSelection): Promise<ClientSelection> { throw new Error("Not implemented"); }
  async deleteClientSelection(id: string): Promise<boolean> { return false; }
  async getClientSelectionBySelectionId(selectionId: string): Promise<ClientSelection | undefined> { return undefined; }
  async getSelectionComments(selectionId: string): Promise<SelectionComment[]> { return []; }
  async createSelectionComment(comment: InsertSelectionComment): Promise<SelectionComment> { throw new Error("Not implemented"); }
  async deleteSelectionComment(id: string): Promise<boolean> { return false; }

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
      // For business contacts (trade/supplier) `name` is the Business Name
      // and must be supplied by the caller — never auto-fall-back to the
      // key person, because that overwrites business identity in lists.
      // For team/client/etc. the firstName + lastName fallback is fine.
      const isBusiness = contact.contactType === "trade" || contact.contactType === "supplier";
      const trimmedName = (contact.name || "").trim();
      const name = isBusiness
        ? trimmedName
        : trimmedName || [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || "";

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
          // For trade/supplier the canonical `name` is the Business Name
          // and editing the key person must NOT overwrite it. Only
          // re-derive `name` from firstName + lastName for team/client.
          const effectiveType = (contact.contactType ?? existing.contactType) as string;
          const isBusiness = effectiveType === "trade" || effectiveType === "supplier";

          if (!isBusiness) {
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

  // Supplier Name Mapping Methods
  async getSupplierNameMapping(invoiceNameString: string, companyId: string): Promise<import("@shared/schema").SupplierNameMapping | undefined> {
    try {
      const rows = await db.select()
        .from(schema.supplierNameMappings)
        .where(and(
          eq(schema.supplierNameMappings.invoiceNameString, invoiceNameString),
          eq(schema.supplierNameMappings.companyId, companyId)
        ))
        .limit(1);
      return rows[0];
    } catch (error) {
      console.error("Database error in getSupplierNameMapping:", error);
      return undefined;
    }
  }

  async createSupplierNameMapping(data: import("@shared/schema").InsertSupplierNameMapping & { companyId: string }): Promise<import("@shared/schema").SupplierNameMapping> {
    try {
      // Upsert: if a mapping for this name+company already exists, update the supplierId
      const existing = await this.getSupplierNameMapping(data.invoiceNameString, data.companyId);
      if (existing) {
        const rows = await db.update(schema.supplierNameMappings)
          .set({ supplierId: data.supplierId })
          .where(eq(schema.supplierNameMappings.id, existing.id))
          .returning();
        return rows[0];
      }
      const rows = await db.insert(schema.supplierNameMappings).values(data).returning();
      return rows[0];
    } catch (error) {
      console.error("Database error in createSupplierNameMapping:", error);
      throw error;
    }
  }

  async getSupplierNameMappings(companyId: string): Promise<import("@shared/schema").SupplierNameMapping[]> {
    try {
      return await db.select()
        .from(schema.supplierNameMappings)
        .where(eq(schema.supplierNameMappings.companyId, companyId))
        .orderBy(schema.supplierNameMappings.createdAt);
    } catch (error) {
      console.error("Database error in getSupplierNameMappings:", error);
      return [];
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

  async ensureTaskCommentsTable(): Promise<void> {
    // Additive, idempotent safety net. The deploy build does NOT run drizzle
    // push, so this guarantees the task_comments table exists in production the
    // first time the server boots after this feature ships. CREATE ... IF NOT
    // EXISTS is non-destructive and a no-op once the table is present.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS task_comments (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id varchar NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          content text NOT NULL,
          created_by_id varchar NOT NULL REFERENCES users(id),
          created_by_name text NOT NULL,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now(),
          edited_at timestamp
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments (task_id)`);
    } catch (error) {
      console.error("Failed to ensure task_comments table exists:", error);
    }
  }

  async getTaskComments(taskId: string): Promise<TaskComment[]> {
    try {
      return await db.select()
        .from(schema.taskComments)
        .where(eq(schema.taskComments.taskId, taskId))
        .orderBy(asc(schema.taskComments.createdAt));
    } catch (error) {
      console.error("Database error in getTaskComments:", error);
      throw error;
    }
  }

  async getTaskCommentById(id: string): Promise<TaskComment | undefined> {
    try {
      const [row] = await db.select()
        .from(schema.taskComments)
        .where(eq(schema.taskComments.id, id))
        .limit(1);
      return row;
    } catch (error) {
      console.error("Database error in getTaskCommentById:", error);
      throw error;
    }
  }

  async createTaskComment(comment: InsertTaskComment): Promise<TaskComment> {
    try {
      const [row] = await db.insert(schema.taskComments).values(comment).returning();
      return row;
    } catch (error) {
      console.error("Database error in createTaskComment:", error);
      throw error;
    }
  }

  async updateTaskComment(id: string, content: string): Promise<TaskComment | undefined> {
    try {
      const now = new Date();
      const [row] = await db.update(schema.taskComments)
        .set({ content, updatedAt: now, editedAt: now })
        .where(eq(schema.taskComments.id, id))
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in updateTaskComment:", error);
      throw error;
    }
  }

  async deleteTaskComment(id: string): Promise<boolean> {
    try {
      const deleted = await db.delete(schema.taskComments)
        .where(eq(schema.taskComments.id, id))
        .returning();
      return deleted.length > 0;
    } catch (error) {
      console.error("Database error in deleteTaskComment:", error);
      throw error;
    }
  }

  async ensureTaskActivityTable(): Promise<void> {
    // Additive, idempotent safety net. The deploy build does NOT run drizzle
    // push, so this guarantees the task_activity table exists in production the
    // first time the server boots after this feature ships.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS task_activity (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          task_id varchar NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          company_id varchar NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
          actor_name text NOT NULL,
          event_type text NOT NULL,
          summary text NOT NULL,
          previous_value text,
          new_value text,
          detail text,
          created_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS task_activity_task_idx ON task_activity (task_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS task_activity_created_at_idx ON task_activity (created_at)`);
    } catch (error) {
      console.error("Failed to ensure task_activity table exists:", error);
    }
  }

  async getTaskActivity(taskId: string): Promise<TaskActivity[]> {
    try {
      return await db.select()
        .from(schema.taskActivity)
        .where(eq(schema.taskActivity.taskId, taskId))
        .orderBy(asc(schema.taskActivity.createdAt));
    } catch (error) {
      console.error("Database error in getTaskActivity:", error);
      throw error;
    }
  }

  async createTaskActivity(entry: InsertTaskActivity): Promise<TaskActivity> {
    try {
      const [row] = await db.insert(schema.taskActivity).values(entry).returning();
      return row;
    } catch (error) {
      console.error("Database error in createTaskActivity:", error);
      throw error;
    }
  }

  async getClientSelectionBySelectionId(selectionId: string): Promise<ClientSelection | undefined> {
    const [cs] = await db.select().from(schema.clientSelections)
      .where(eq(schema.clientSelections.selectionId, selectionId))
      .limit(1);
    return cs;
  }

  async getSelectionComments(selectionId: string): Promise<SelectionComment[]> {
    return db.select().from(schema.selectionComments)
      .where(eq(schema.selectionComments.selectionId, selectionId))
      .orderBy(asc(schema.selectionComments.createdAt));
  }

  async createSelectionComment(comment: InsertSelectionComment): Promise<SelectionComment> {
    const [newComment] = await db.insert(schema.selectionComments).values(comment).returning();
    return newComment;
  }

  async deleteSelectionComment(id: string): Promise<boolean> {
    const result = await db.delete(schema.selectionComments).where(eq(schema.selectionComments.id, id)).returning();
    return result.length > 0;
  }

  // ── Product Library ──────────────────────────────────────────────────
  async getProducts(companyId: string, filters?: { category?: string; search?: string; isActive?: boolean }): Promise<schema.Product[]> {
    const conditions: any[] = [eq(schema.products.companyId, companyId)];
    if (filters?.isActive !== undefined) conditions.push(eq(schema.products.isActive, filters.isActive));
    if (filters?.category) conditions.push(eq(schema.products.category, filters.category));
    let rows = await db.select().from(schema.products).where(and(...conditions)).orderBy(schema.products.name);
    if (filters?.search) {
      const t = filters.search.toLowerCase();
      rows = rows.filter(p => p.name.toLowerCase().includes(t) || (p.brand?.toLowerCase().includes(t)) || (p.sku?.toLowerCase().includes(t)));
    }
    return rows;
  }

  async getProduct(id: number): Promise<schema.Product | undefined> {
    const [row] = await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1);
    return row;
  }

  async createProduct(product: schema.InsertProduct): Promise<schema.Product> {
    const [row] = await db.insert(schema.products).values(product).returning();
    return row;
  }

  async updateProduct(id: number, product: Partial<schema.InsertProduct>): Promise<schema.Product | undefined> {
    const [row] = await db.update(schema.products).set({ ...product, updatedAt: new Date() }).where(eq(schema.products.id, id)).returning();
    return row;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const [row] = await db.update(schema.products).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.products.id, id)).returning();
    return !!row;
  }

  async getProductImages(productId: number): Promise<schema.ProductImage[]> {
    return db.select().from(schema.productImages).where(eq(schema.productImages.productId, productId)).orderBy(schema.productImages.sortOrder);
  }

  async createProductImage(image: schema.InsertProductImage): Promise<schema.ProductImage> {
    const [row] = await db.insert(schema.productImages).values(image).returning();
    return row;
  }

  async deleteProductImage(id: number): Promise<boolean> {
    const result = await db.delete(schema.productImages).where(eq(schema.productImages.id, id)).returning();
    return result.length > 0;
  }

  async getBills(projectId?: string | null, status?: string, companyId?: string): Promise<Bill[]> {
    try {
      let query = db.select({ bill: schema.bills })
        .from(schema.bills)
        .leftJoin(schema.projects, eq(schema.bills.projectId, schema.projects.id));
      const conditions = [];

      if (companyId) {
        conditions.push(
          or(
            // Bill is directly owned by this company
            eq(schema.bills.companyId, companyId),
            // Bill is linked to a project that belongs to this company (covers bills with
            // null or mismatched companyId that were still assigned to a company project)
            eq(schema.projects.companyId, companyId)
          )
        );
      }
      if (projectId) {
        conditions.push(eq(schema.bills.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.bills.status, status as any));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      const rows = await (query as any).orderBy(desc(schema.bills.createdAt));
      return rows.map((r: any) => r.bill ?? r) as Bill[];
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

  async getBillByXeroId(xeroInvoiceId: string, companyId?: string): Promise<Bill | null> {
    try {
      // Scope by company through the project relation when provided to prevent cross-tenant matches
      if (companyId) {
        const result = await db.select({ bill: schema.bills })
          .from(schema.bills)
          .innerJoin(schema.projects, eq(schema.bills.projectId, schema.projects.id))
          .where(and(
            eq(schema.bills.xeroInvoiceId, xeroInvoiceId),
            eq(schema.projects.companyId, companyId),
          ))
          .limit(1);
        return (result[0]?.bill as Bill) || null;
      }
      const bills = await db.select()
        .from(schema.bills)
        .where(eq(schema.bills.xeroInvoiceId, xeroInvoiceId))
        .limit(1);
      return bills[0] || null;
    } catch (error) {
      console.error("Database error in getBillByXeroId:", error);
      throw error;
    }
  }

  async getBillByGmailMessageId(messageId: string): Promise<Bill | null> {
    try {
      const result = await db.select()
        .from(schema.bills)
        .where(eq(schema.bills.gmailMessageId, messageId))
        .limit(1);
      return result[0] || null;
    } catch (error) {
      console.error("Database error in getBillByGmailMessageId:", error);
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

  async backfillBillsCompanyId(): Promise<{ updated: number }> {
    try {
      // Step 1: fill NULL companyId bills using the project's companyId where available
      const step1 = await db.execute(sql`
        UPDATE bills
        SET company_id = p.company_id
        FROM projects p
        WHERE bills.project_id = p.id
          AND bills.company_id IS NULL
          AND p.company_id IS NOT NULL
      `);
      const step1Count = (step1 as any).rowCount ?? 0;

      // Step 2: for any remaining NULL-company bills (no project), use the primary company
      const primaryId = await this.getFirstCompanyId();
      let step2Count = 0;
      if (primaryId) {
        const step2 = await db.update(schema.bills)
          .set({ companyId: primaryId })
          .where(isNull(schema.bills.companyId));
        step2Count = (step2 as any).rowCount ?? 0;
      }

      // Step 3: fix bills whose company has no real users but whose project's company does.
      // This corrects bills created by the poller when getFirstCompanyId() returned an
      // orphaned/demo company instead of the real user-populated company.
      const step3 = await db.execute(sql`
        UPDATE bills
        SET company_id = p.company_id
        FROM projects p
        WHERE bills.project_id = p.id
          AND bills.company_id IS DISTINCT FROM p.company_id
          AND p.company_id IN (
            SELECT DISTINCT company_id FROM users
            WHERE company_id IS NOT NULL
              AND email NOT LIKE '%@system.local'
              AND email NOT LIKE '%orphaned%'
          )
          AND bills.company_id NOT IN (
            SELECT DISTINCT company_id FROM users
            WHERE company_id IS NOT NULL
              AND email NOT LIKE '%@system.local'
              AND email NOT LIKE '%orphaned%'
          )
      `);
      const step3Count = (step3 as any).rowCount ?? 0;

      // Step 4: for bills still in an orphaned company but with no usable project company,
      // move them to the primary (most-user-populated) company as a last resort.
      let step4Count = 0;
      if (primaryId) {
        const step4 = await db.execute(sql`
          UPDATE bills
          SET company_id = ${primaryId}
          WHERE company_id NOT IN (
            SELECT DISTINCT company_id FROM users
            WHERE company_id IS NOT NULL
              AND email NOT LIKE '%@system.local'
              AND email NOT LIKE '%orphaned%'
          )
        `);
        step4Count = (step4 as any).rowCount ?? 0;
      }

      return { updated: step1Count + step2Count + step3Count + step4Count };
    } catch (error) {
      console.error("Database error in backfillBillsCompanyId:", error);
      return { updated: 0 };
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

  async appendBillAttachment(id: string, attachment: import("@shared/schema").BillAttachment): Promise<Bill> {
    try {
      // Atomic JSONB append in a single typed Drizzle UPDATE statement —
      // avoids read-modify-write races when multiple uploads happen
      // concurrently against the same bill.
      const payload = JSON.stringify([attachment]);
      const updated = await db.update(schema.bills)
        .set({
          attachmentUrls: sql`(COALESCE(${schema.bills.attachmentUrls}::jsonb, '[]'::jsonb) || ${payload}::jsonb)::json`,
          updatedAt: new Date(),
        })
        .where(eq(schema.bills.id, id))
        .returning();
      if (!updated[0]) throw new Error("Bill not found");
      return updated[0];
    } catch (error) {
      console.error("Database error in appendBillAttachment:", error);
      throw error;
    }
  }

  async removeBillAttachment(id: string, objectPath: string): Promise<Bill> {
    try {
      // Read current attachments, filter out matches by objectPath, write back atomically.
      // Handles both legacy string entries and rich record objects.
      const existing = await db.select({ attachmentUrls: schema.bills.attachmentUrls })
        .from(schema.bills)
        .where(eq(schema.bills.id, id))
        .limit(1);
      if (!existing[0]) throw new Error("Bill not found");
      type Entry = string | { objectPath?: string };
      const current: Entry[] = Array.isArray(existing[0].attachmentUrls)
        ? (existing[0].attachmentUrls as Entry[])
        : [];
      const next = current.filter((a) => {
        const path = typeof a === "string" ? a : a?.objectPath;
        return path !== objectPath;
      });
      const updated = await db.update(schema.bills)
        .set({ attachmentUrls: next, updatedAt: new Date() })
        .where(eq(schema.bills.id, id))
        .returning();
      if (!updated[0]) throw new Error("Bill not found");
      return updated[0];
    } catch (error) {
      console.error("Database error in removeBillAttachment:", error);
      throw error;
    }
  }

  async deleteBill(id: string): Promise<void> {
    try {
      const lineItems = await db.select({ id: schema.billLineItems.id })
        .from(schema.billLineItems)
        .where(eq(schema.billLineItems.billId, id));
      for (const li of lineItems) {
        await db.delete(schema.billLineItemAllowances)
          .where(eq(schema.billLineItemAllowances.billLineItemId, li.id));
      }
      await db.delete(schema.billLineItems)
        .where(eq(schema.billLineItems.billId, id));
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
      // Keep the bill header (subtotal/tax/total) in lockstep with its lines.
      await this.recomputeBillTotals(newItems[0].billId).catch((e) =>
        console.error("[recomputeBillTotals] after create line item failed:", e));
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

      await this.recomputeBillTotals(updatedItems[0].billId).catch((e) =>
        console.error("[recomputeBillTotals] after update line item failed:", e));
      return updatedItems[0];
    } catch (error) {
      console.error("Database error in updateBillLineItem:", error);
      throw error;
    }
  }

  async deleteBillLineItem(id: string): Promise<void> {
    try {
      const existing = await db.select({ billId: schema.billLineItems.billId })
        .from(schema.billLineItems)
        .where(eq(schema.billLineItems.id, id))
        .limit(1);
      await db.delete(schema.billLineItems)
        .where(eq(schema.billLineItems.id, id));
      if (existing[0]?.billId) {
        await this.recomputeBillTotals(existing[0].billId).catch((e) =>
          console.error("[recomputeBillTotals] after delete line item failed:", e));
      }
    } catch (error) {
      console.error("Database error in deleteBillLineItem:", error);
      throw error;
    }
  }

  // Recompute a bill's header (subtotal/tax/total) from its line items, which
  // are the source of truth. Skips bills with no line items so freight- or
  // header-only bills are never clobbered. Returns true when a change was made.
  async recomputeBillTotals(billId: string): Promise<boolean> {
    try {
      const billRows = await db.select().from(schema.bills)
        .where(eq(schema.bills.id, billId)).limit(1);
      const bill = billRows[0];
      if (!bill) return false;

      const lines = await db.select().from(schema.billLineItems)
        .where(eq(schema.billLineItems.billId, billId));
      if (lines.length === 0) return false;

      const settings = await this.getCompanySettings();
      const taxRate = Number(settings?.taxRate ?? 10) || 10;
      const taxMode = bill.taxMode === "inclusive" ? "inclusive" : "exclusive";
      const { subtotal, tax, total } = computeBillTotalsCents(
        lines.map((l: BillLineItem) => ({ total: l.total ?? 0, tax: l.tax })),
        taxMode,
        taxRate,
      );

      if (subtotal === (bill.subtotal ?? 0) && tax === (bill.tax ?? 0) && total === (bill.total ?? 0)) {
        return false;
      }

      await db.update(schema.bills)
        .set({ subtotal, tax, total, updatedAt: new Date() })
        .where(eq(schema.bills.id, billId));
      return true;
    } catch (error) {
      console.error("Database error in recomputeBillTotals:", error);
      throw error;
    }
  }

  async getBillPayments(billId: string): Promise<BillPayment[]> {
    try {
      return await db.select()
        .from(schema.billPayments)
        .where(eq(schema.billPayments.billId, billId))
        .orderBy(desc(schema.billPayments.paymentDate));
    } catch (error) {
      console.error("Database error in getBillPayments:", error);
      throw error;
    }
  }

  async getBillPaymentById(id: string): Promise<BillPayment | undefined> {
    try {
      const result = await db.select()
        .from(schema.billPayments)
        .where(eq(schema.billPayments.id, id))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getBillPaymentById:", error);
      throw error;
    }
  }

  async createBillPayment(payment: InsertBillPayment): Promise<BillPayment> {
    try {
      const result = await db.insert(schema.billPayments)
        .values(payment)
        .returning();
      await this.syncBillPaidStatus(payment.billId);
      return result[0];
    } catch (error) {
      console.error("Database error in createBillPayment:", error);
      throw error;
    }
  }

  async deleteBillPayment(id: string): Promise<boolean> {
    try {
      const existing = await db.select({ billId: schema.billPayments.billId })
        .from(schema.billPayments)
        .where(eq(schema.billPayments.id, id))
        .limit(1);
      await db.delete(schema.billPayments)
        .where(eq(schema.billPayments.id, id));
      if (existing[0]?.billId) await this.syncBillPaidStatus(existing[0].billId);
      return true;
    } catch (error) {
      console.error("Database error in deleteBillPayment:", error);
      return false;
    }
  }

  async voidBillPayment(id: string): Promise<BillPayment | undefined> {
    try {
      const result = await db.update(schema.billPayments)
        .set({ isVoided: true, updatedAt: new Date() })
        .where(eq(schema.billPayments.id, id))
        .returning();
      if (result[0]?.billId) await this.syncBillPaidStatus(result[0].billId);
      return result[0];
    } catch (error) {
      console.error("Database error in voidBillPayment:", error);
      throw error;
    }
  }

  // Recompute bills.paidAmount and status from the non-voided payment history.
  // Full payment => paid; partial => awaiting_payment; nothing left but bill was
  // previously "paid" => fall back to awaiting_payment so it can't get stuck.
  async syncBillPaidStatus(billId: string): Promise<void> {
    try {
      const billRows = await db.select().from(schema.bills)
        .where(eq(schema.bills.id, billId)).limit(1);
      const bill = billRows[0];
      if (!bill) return;

      const payments = await db.select().from(schema.billPayments)
        .where(and(
          eq(schema.billPayments.billId, billId),
          eq(schema.billPayments.isVoided, false),
        ));
      const paid = payments.reduce((sum: number, p: BillPayment) => sum + (p.amount ?? 0), 0);
      const total = bill.total ?? 0;

      let status = bill.status;
      if (total > 0 && paid >= total) {
        status = "paid";
      } else if (paid > 0) {
        status = "awaiting_payment";
      } else if (bill.status === "paid") {
        status = "awaiting_payment";
      }

      const update: Partial<InsertBill> = { paidAmount: paid } as any;
      if (status !== bill.status) (update as any).status = status;
      await db.update(schema.bills)
        .set({ ...(update as any), updatedAt: new Date() })
        .where(eq(schema.bills.id, billId));
    } catch (error) {
      console.error("Database error in syncBillPaidStatus:", error);
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

  async canUserViewTimesheetRates(userId: string): Promise<boolean> {
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

      const ratesPermission = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'timesheets.rates'))
        .limit(1);

      if (!ratesPermission.length) {
        return false;
      }

      const rolePermission = await db.select()
        .from(schema.rolePermissions)
        .where(
          and(
            eq(schema.rolePermissions.roleId, user[0].roleId),
            eq(schema.rolePermissions.permissionId, ratesPermission[0].id)
          )
        )
        .limit(1);

      if (!rolePermission.length) {
        return false;
      }

      const allowedActions = rolePermission[0].allowedActions as string[];
      return allowedActions && allowedActions.includes('view');
    } catch (error) {
      console.error("Database error in canUserViewTimesheetRates:", error);
      return false;
    }
  }

  async canUserViewAllBills(userId: string): Promise<boolean> {
    try {
      const user = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!user.length || !user[0].roleId) return false;

      // Admin-level roles always see everything
      const role = await db.select()
        .from(schema.userRoles)
        .where(eq(schema.userRoles.id, user[0].roleId))
        .limit(1);

      if (role.length) {
        const rn = (role[0].name ?? '').toLowerCase();
        if (role[0].isBuiltIn && (rn.includes('admin') || rn.includes('owner') || rn.includes('general manage'))) {
          return true;
        }
      }

      // Otherwise check financial.bills → view permission
      const perm = await db.select()
        .from(schema.permissions)
        .where(eq(schema.permissions.key, 'financial.bills'))
        .limit(1);

      if (!perm.length) return false;

      const rp = await db.select()
        .from(schema.rolePermissions)
        .where(and(
          eq(schema.rolePermissions.roleId, user[0].roleId),
          eq(schema.rolePermissions.permissionId, perm[0].id)
        ))
        .limit(1);

      if (!rp.length) return false;
      const allowed = rp[0].allowedActions as string[];
      return Array.isArray(allowed) && allowed.includes('view');
    } catch (error) {
      console.error("Database error in canUserViewAllBills:", error);
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

  async getNextClientInvoiceNumber(prefix: string, startNumber: number): Promise<string> {
    try {
      const allInvoices = await db.select({ invoiceNumber: schema.clientInvoices.invoiceNumber })
        .from(schema.clientInvoices)
        .where(sql`${schema.clientInvoices.invoiceNumber} like ${prefix + '%'}`);

      let maxNum = startNumber - 1;
      for (const inv of allInvoices) {
        const raw = inv.invoiceNumber;
        if (!raw) continue;
        const numStr = raw.slice(prefix.length);
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
      return `${prefix}${maxNum + 1}`;
    } catch (error) {
      console.error("Database error in getNextClientInvoiceNumber:", error);
      throw error;
    }
  }

  async getClientInvoiceNumbersByPrefix(prefix: string): Promise<string[]> {
    try {
      const rows = await db.select({ invoiceNumber: schema.clientInvoices.invoiceNumber })
        .from(schema.clientInvoices)
        .where(sql`${schema.clientInvoices.invoiceNumber} like ${prefix + '%'}`);
      return rows
        .map((r) => r.invoiceNumber)
        .filter((n): n is string => !!n);
    } catch (error) {
      console.error("Database error in getClientInvoiceNumbersByPrefix:", error);
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

  async getClientInvoiceByXeroId(xeroInvoiceId: string): Promise<ClientInvoice | undefined> {
    try {
      const result = await db.select()
        .from(schema.clientInvoices)
        .where(eq(schema.clientInvoices.xeroInvoiceId, xeroInvoiceId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getClientInvoiceByXeroId:", error);
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
      const existing = await db.select({ invoiceId: schema.clientInvoicePayments.invoiceId })
        .from(schema.clientInvoicePayments)
        .where(eq(schema.clientInvoicePayments.id, id))
        .limit(1);
      await db.delete(schema.clientInvoicePayments)
        .where(eq(schema.clientInvoicePayments.id, id));
      if (existing[0]?.invoiceId) await this.syncClientInvoicePaidStatus(existing[0].invoiceId);
      return true;
    } catch (error) {
      console.error("Database error in deleteClientInvoicePayment:", error);
      return false;
    }
  }

  async voidClientInvoicePayment(id: string): Promise<ClientInvoicePayment | undefined> {
    try {
      const result = await db.update(schema.clientInvoicePayments)
        .set({ isVoided: true, updatedAt: new Date() })
        .where(eq(schema.clientInvoicePayments.id, id))
        .returning();
      if (result[0]?.invoiceId) await this.syncClientInvoicePaidStatus(result[0].invoiceId);
      return result[0];
    } catch (error) {
      console.error("Database error in voidClientInvoicePayment:", error);
      throw error;
    }
  }

  // Recompute clientInvoices.paidAmount, balanceAmount and status from the
  // non-voided payment history. Mirrors syncBillPaidStatus. A voided payment
  // must be subtracted from the paid total — otherwise it keeps counting as
  // "Paid" and the invoice/project balances go negative.
  async syncClientInvoicePaidStatus(invoiceId: string): Promise<void> {
    try {
      const invoiceRows = await db.select().from(schema.clientInvoices)
        .where(eq(schema.clientInvoices.id, invoiceId)).limit(1);
      const invoice = invoiceRows[0];
      if (!invoice) return;

      const payments = await db.select().from(schema.clientInvoicePayments)
        .where(and(
          eq(schema.clientInvoicePayments.invoiceId, invoiceId),
          eq(schema.clientInvoicePayments.isVoided, false),
        ));
      const paid = payments.reduce((sum: number, p: ClientInvoicePayment) => sum + (p.amount ?? 0), 0);
      const total = invoice.totalAmount ?? 0;
      // Clamp to 0 so a genuine overpayment never produces a negative
      // "Outstanding" — matches the Xero sync paths (Math.max(0, ...)).
      const balance = Math.max(0, total - paid);

      let status = invoice.status;
      if (total > 0 && paid >= total) {
        status = "paid";
      } else if (paid > 0) {
        status = "partial";
      } else if (invoice.status === "paid" || invoice.status === "partial") {
        // All payments voided/removed — revert a previously-paid invoice to
        // "sent" so it isn't stuck showing as paid.
        status = "sent";
      }

      await db.update(schema.clientInvoices)
        .set({ paidAmount: paid, balanceAmount: balance, status, updatedAt: new Date() })
        .where(eq(schema.clientInvoices.id, invoiceId));
    } catch (error) {
      console.error("Database error in syncClientInvoicePaidStatus:", error);
      throw error;
    }
  }

  // One-time, idempotent heal for invoices whose stored paidAmount still counts
  // a voided payment (the pre-fix void path never recomputed the totals).
  // Scoped precisely to the bug: only invoices that (a) have at least one voided
  // payment AND (b) whose stored paidAmount equals the sum of ALL payment rows
  // (voided + active) are corrected. Condition (b) proves paidAmount was built
  // purely from payment rows, so recomputing from the non-voided rows is safe.
  // Invoices that track paidAmount by other means are left untouched.
  async healVoidedClientInvoicePaidAmounts(): Promise<{ fixed: number }> {
    try {
      const voidedInvoiceRows = await db
        .selectDistinct({ invoiceId: schema.clientInvoicePayments.invoiceId })
        .from(schema.clientInvoicePayments)
        .where(eq(schema.clientInvoicePayments.isVoided, true));

      let fixed = 0;
      for (const { invoiceId } of voidedInvoiceRows) {
        if (!invoiceId) continue;
        const invoiceRows = await db.select().from(schema.clientInvoices)
          .where(eq(schema.clientInvoices.id, invoiceId)).limit(1);
        const invoice = invoiceRows[0];
        if (!invoice) continue;

        const allPayments = await db.select().from(schema.clientInvoicePayments)
          .where(eq(schema.clientInvoicePayments.invoiceId, invoiceId));
        const allSum = allPayments.reduce((s: number, p: ClientInvoicePayment) => s + (p.amount ?? 0), 0);
        const activeSum = allPayments
          .filter((p: ClientInvoicePayment) => !p.isVoided)
          .reduce((s: number, p: ClientInvoicePayment) => s + (p.amount ?? 0), 0);

        if ((invoice.paidAmount ?? 0) === allSum && allSum !== activeSum) {
          await this.syncClientInvoicePaidStatus(invoiceId);
          fixed++;
        }
      }
      return { fixed };
    } catch (error) {
      console.error("Database error in healVoidedClientInvoicePaidAmounts:", error);
      return { fixed: 0 };
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

  async getInvoiceVariationsByProject(projectId: string): Promise<Array<{ variationId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>> {
    try {
      const rows = await db
        .select({
          variationId: schema.invoiceVariations.variationId,
          invoiceId: schema.invoiceVariations.invoiceId,
          invoiceNumber: schema.clientInvoices.invoiceNumber,
          claimPercent: schema.invoiceVariations.claimPercent,
        })
        .from(schema.invoiceVariations)
        .innerJoin(schema.clientInvoices, eq(schema.invoiceVariations.invoiceId, schema.clientInvoices.id))
        .where(eq(schema.clientInvoices.projectId, projectId));
      return rows;
    } catch (error) {
      console.error("Database error in getInvoiceVariationsByProject:", error);
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

  async updateInvoiceVariation(id: string, data: Partial<InsertInvoiceVariation>): Promise<InvoiceVariation | undefined> {
    try {
      const result = await db.update(schema.invoiceVariations)
        .set(data)
        .where(eq(schema.invoiceVariations.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateInvoiceVariation:", error);
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

  // Invoice-Allowance Junction Table
  async getInvoiceAllowances(invoiceId: string): Promise<InvoiceAllowance[]> {
    try {
      return await db.select()
        .from(schema.invoiceAllowances)
        .where(eq(schema.invoiceAllowances.invoiceId, invoiceId));
    } catch (error) {
      console.error("Database error in getInvoiceAllowances:", error);
      throw error;
    }
  }

  async getInvoiceAllowancesByProject(projectId: string): Promise<Array<{ estimateItemId: string; invoiceId: string; invoiceNumber: string | null; claimPercent: number }>> {
    try {
      const rows = await db
        .select({
          estimateItemId: schema.invoiceAllowances.estimateItemId,
          invoiceId: schema.invoiceAllowances.invoiceId,
          invoiceNumber: schema.clientInvoices.invoiceNumber,
          claimPercent: schema.invoiceAllowances.claimPercent,
        })
        .from(schema.invoiceAllowances)
        .innerJoin(schema.clientInvoices, eq(schema.invoiceAllowances.invoiceId, schema.clientInvoices.id))
        .where(eq(schema.clientInvoices.projectId, projectId));
      return rows;
    } catch (error) {
      console.error("Database error in getInvoiceAllowancesByProject:", error);
      throw error;
    }
  }

  async createInvoiceAllowance(data: InsertInvoiceAllowance): Promise<InvoiceAllowance> {
    try {
      const result = await db.insert(schema.invoiceAllowances)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceAllowance:", error);
      throw error;
    }
  }

  async updateInvoiceAllowance(id: string, data: Partial<InsertInvoiceAllowance>): Promise<InvoiceAllowance | undefined> {
    try {
      const result = await db.update(schema.invoiceAllowances)
        .set(data)
        .where(eq(schema.invoiceAllowances.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateInvoiceAllowance:", error);
      throw error;
    }
  }

  async deleteInvoiceAllowance(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceAllowances)
        .where(eq(schema.invoiceAllowances.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceAllowance:", error);
      return false;
    }
  }

  // Variation-Bill Junction Table
  async getVariationBills(variationId: string): Promise<any[]> {
    try {
      const rows = await db
        .select({
          id: schema.variationBills.id,
          variationId: schema.variationBills.variationId,
          billId: schema.variationBills.billId,
          createdAt: schema.variationBills.createdAt,
          billNumber: schema.bills.billNumber,
          supplierId: schema.bills.supplierId,
          billDate: schema.bills.billDate,
          total: schema.bills.total,
        })
        .from(schema.variationBills)
        .innerJoin(schema.bills, eq(schema.variationBills.billId, schema.bills.id))
        .where(eq(schema.variationBills.variationId, variationId));
      return rows;
    } catch (error) {
      console.error("Database error in getVariationBills:", error);
      throw error;
    }
  }

  async createVariationBill(data: InsertVariationBill): Promise<VariationBill> {
    try {
      const result = await db.insert(schema.variationBills).values(data).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createVariationBill:", error);
      throw error;
    }
  }

  async deleteVariationBillsByVariationId(variationId: string): Promise<void> {
    try {
      await db.delete(schema.variationBills).where(eq(schema.variationBills.variationId, variationId));
    } catch (error) {
      console.error("Database error in deleteVariationBillsByVariationId:", error);
      throw error;
    }
  }

  // Variation-Timesheet Junction Table
  async getVariationTimesheets(variationId: string): Promise<any[]> {
    try {
      const rows = await db
        .select({
          id: schema.variationTimesheets.id,
          variationId: schema.variationTimesheets.variationId,
          timesheetId: schema.variationTimesheets.timesheetId,
          createdAt: schema.variationTimesheets.createdAt,
          date: schema.timesheets.date,
          userId: schema.timesheets.userId,
          duration: schema.timesheets.duration,
          hourlyRate: schema.timesheets.hourlyRate,
          total: schema.timesheets.total,
          status: schema.timesheets.status,
          description: schema.timesheets.description,
        })
        .from(schema.variationTimesheets)
        .innerJoin(schema.timesheets, eq(schema.variationTimesheets.timesheetId, schema.timesheets.id))
        .where(eq(schema.variationTimesheets.variationId, variationId));
      return rows;
    } catch (error) {
      console.error("Database error in getVariationTimesheets:", error);
      throw error;
    }
  }

  async createVariationTimesheet(data: InsertVariationTimesheet): Promise<VariationTimesheet> {
    try {
      const result = await db.insert(schema.variationTimesheets).values(data).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createVariationTimesheet:", error);
      throw error;
    }
  }

  async deleteVariationTimesheetsByVariationId(variationId: string): Promise<void> {
    try {
      await db.delete(schema.variationTimesheets).where(eq(schema.variationTimesheets.variationId, variationId));
    } catch (error) {
      console.error("Database error in deleteVariationTimesheetsByVariationId:", error);
      throw error;
    }
  }

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

  // Invoice-Timesheet Junction Table
  async getInvoiceTimesheets(invoiceId: string): Promise<any[]> {
    try {
      const rows = await db
        .select({
          id: schema.invoiceTimesheets.id,
          invoiceId: schema.invoiceTimesheets.invoiceId,
          timesheetId: schema.invoiceTimesheets.timesheetId,
          createdAt: schema.invoiceTimesheets.createdAt,
          date: schema.timesheets.date,
          userId: schema.timesheets.userId,
          duration: schema.timesheets.duration,
          hourlyRate: schema.timesheets.hourlyRate,
          total: schema.timesheets.total,
          status: schema.timesheets.status,
          description: schema.timesheets.description,
        })
        .from(schema.invoiceTimesheets)
        .innerJoin(schema.timesheets, eq(schema.invoiceTimesheets.timesheetId, schema.timesheets.id))
        .where(eq(schema.invoiceTimesheets.invoiceId, invoiceId));
      return rows;
    } catch (error) {
      console.error("Database error in getInvoiceTimesheets:", error);
      throw error;
    }
  }

  async createInvoiceTimesheet(data: InsertInvoiceTimesheet): Promise<InvoiceTimesheet> {
    try {
      const result = await db.insert(schema.invoiceTimesheets)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceTimesheet:", error);
      throw error;
    }
  }

  async deleteInvoiceTimesheet(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceTimesheets)
        .where(eq(schema.invoiceTimesheets.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceTimesheet:", error);
      return false;
    }
  }

  // Invoice-Selection Junction Table
  async getInvoiceSelections(invoiceId: string): Promise<any[]> {
    try {
      const rows = await db
        .select({
          id: schema.invoiceSelections.id,
          invoiceId: schema.invoiceSelections.invoiceId,
          selectionOptionId: schema.invoiceSelections.selectionOptionId,
          createdAt: schema.invoiceSelections.createdAt,
          optionName: schema.selectionOptions.name,
          totalCost: schema.selectionOptions.totalCost,
          quantity: schema.selectionOptions.quantity,
          unitType: schema.selectionOptions.unitType,
          selectionId: schema.selectionOptions.selectionId,
          selectionName: schema.selections.name,
          room: schema.selections.room,
          category: schema.selectionOptions.category,
        })
        .from(schema.invoiceSelections)
        .innerJoin(schema.selectionOptions, eq(schema.invoiceSelections.selectionOptionId, schema.selectionOptions.id))
        .innerJoin(schema.selections, eq(schema.selectionOptions.selectionId, schema.selections.id))
        .where(eq(schema.invoiceSelections.invoiceId, invoiceId));
      return rows;
    } catch (error) {
      console.error("Database error in getInvoiceSelections:", error);
      throw error;
    }
  }

  async createInvoiceSelection(data: InsertInvoiceSelection): Promise<InvoiceSelection> {
    try {
      const result = await db.insert(schema.invoiceSelections)
        .values(data)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createInvoiceSelection:", error);
      throw error;
    }
  }

  async deleteInvoiceSelection(id: string): Promise<boolean> {
    try {
      await db.delete(schema.invoiceSelections)
        .where(eq(schema.invoiceSelections.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteInvoiceSelection:", error);
      return false;
    }
  }

  // Proposals CRUD operations
  async getProposals(projectId?: string, status?: string, parentProposalId?: string): Promise<Proposal[]> {
    try {
      let query = db.select().from(schema.proposals);

      const conditions = [];
      if (projectId) {
        conditions.push(eq(schema.proposals.projectId, projectId));
      }
      if (status) {
        conditions.push(eq(schema.proposals.status, status));
      }
      if (parentProposalId) {
        conditions.push(or(
          eq(schema.proposals.id, parentProposalId),
          eq(schema.proposals.parentProposalId, parentProposalId),
        )!);
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

  // Proposal Payment Milestones
  async getProposalPaymentMilestones(proposalId: string): Promise<ProposalPaymentMilestone[]> {
    return await db.select()
      .from(schema.proposalPaymentMilestones)
      .where(eq(schema.proposalPaymentMilestones.proposalId, proposalId))
      .orderBy(schema.proposalPaymentMilestones.order);
  }

  async createProposalPaymentMilestone(m: InsertProposalPaymentMilestone): Promise<ProposalPaymentMilestone> {
    const result = await db.insert(schema.proposalPaymentMilestones).values(m).returning();
    return result[0];
  }

  async updateProposalPaymentMilestone(id: string, m: Partial<InsertProposalPaymentMilestone>): Promise<ProposalPaymentMilestone | undefined> {
    const result = await db.update(schema.proposalPaymentMilestones)
      .set({ ...m, updatedAt: new Date() })
      .where(eq(schema.proposalPaymentMilestones.id, id))
      .returning();
    return result[0];
  }

  async deleteProposalPaymentMilestone(id: string): Promise<boolean> {
    try {
      await db.delete(schema.proposalPaymentMilestones)
        .where(eq(schema.proposalPaymentMilestones.id, id));
      return true;
    } catch {
      return false;
    }
  }

  async replaceProposalPaymentMilestones(proposalId: string, items: InsertProposalPaymentMilestone[]): Promise<ProposalPaymentMilestone[]> {
    return await db.transaction(async (tx) => {
      await tx.delete(schema.proposalPaymentMilestones)
        .where(eq(schema.proposalPaymentMilestones.proposalId, proposalId));
      if (items.length === 0) return [];
      const toInsert = items.map((it, idx) => ({ ...it, proposalId, order: it.order ?? idx }));
      return await tx.insert(schema.proposalPaymentMilestones).values(toInsert).returning();
    });
  }

  async getNextProposalNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(42, ${year})`);
      const result = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_number FROM ${prefix.length + 1}) AS INTEGER)), 0) AS max_num
        FROM proposals
        WHERE proposal_number LIKE ${prefix + '%'}
      `);
      const row = (result as unknown as { rows: Array<{ max_num: number | string }> }).rows?.[0];
      const max = row ? Number(row.max_num) || 0 : 0;
      return `${prefix}${String(max + 1).padStart(4, '0')}`;
    });
  }

  async createProposalAtomic(proposal: Omit<InsertProposal, 'proposalNumber'>): Promise<Proposal> {
    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(42, ${year})`);
      const result = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_number FROM ${prefix.length + 1}) AS INTEGER)), 0) AS max_num
        FROM proposals
        WHERE proposal_number LIKE ${prefix + '%'}
      `);
      const row = (result as unknown as { rows: Array<{ max_num: number | string }> }).rows?.[0];
      const max = row ? Number(row.max_num) || 0 : 0;
      const proposalNumber = `${prefix}${String(max + 1).padStart(4, '0')}`;
      const inserted = await tx.insert(schema.proposals)
        .values({ ...proposal, proposalNumber })
        .returning();
      return inserted[0];
    });
  }

  async createProposalRevision(parentId: string, overrides?: Partial<InsertProposal>): Promise<Proposal> {
    const parent = await this.getProposal(parentId);
    if (!parent) throw new Error('Parent proposal not found');

    const REVISABLE = new Set(['sent', 'viewed', 'rejected', 'accepted']);
    if (!REVISABLE.has(String(parent.status))) {
      throw new InvalidProposalStateError(
        `Cannot revise a proposal in status "${parent.status}". ` +
        `Only sent, viewed, rejected or accepted proposals can be revised.`
      );
    }

    const rootId = parent.parentProposalId ?? parent.id;

    return await db.transaction(async (tx) => {
      const year = new Date().getFullYear();
      const numPrefix = `PROP-${year}-`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(42, ${year})`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(43, hashtext(${rootId}))`);

      const familyRows = await tx
        .select()
        .from(schema.proposals)
        .where(or(eq(schema.proposals.id, rootId), eq(schema.proposals.parentProposalId, rootId)));
      const latest = familyRows
        .filter((r) => r.status !== 'superseded')
        .sort((a, b) => (b.version ?? 1) - (a.version ?? 1))[0] ?? parent;
      const supersedeId = latest.id;

      await tx.update(schema.proposals)
        .set({ status: 'superseded', updatedAt: new Date() })
        .where(eq(schema.proposals.id, supersedeId));

      const maxVersion = familyRows.reduce((m, r) => Math.max(m, r.version ?? 1), parent.version ?? 1);
      const nextVersion = maxVersion + 1;

      const numResult = await tx.execute(sql`
        SELECT COALESCE(MAX(CAST(SUBSTRING(proposal_number FROM ${numPrefix.length + 1}) AS INTEGER)), 0) AS max_num
        FROM proposals
        WHERE proposal_number LIKE ${numPrefix + '%'}
      `);
      const numRow = (numResult as unknown as { rows: Array<{ max_num: number | string }> }).rows?.[0];
      const numMax = numRow ? Number(numRow.max_num) || 0 : 0;
      const newNumber = `${numPrefix}${String(numMax + 1).padStart(4, '0')}`;

      const baseValues: typeof schema.proposals.$inferInsert = {
        proposalNumber: newNumber,
        name: parent.name,
        projectId: parent.projectId,
        estimateId: parent.estimateId,
        clientId: parent.clientId,
        introductionText: parent.introductionText,
        closingText: parent.closingText,
        termsAndConditions: parent.termsAndConditions,
        subtotal: parent.subtotal,
        gstAmount: parent.gstAmount,
        totalAmount: parent.totalAmount,
        status: 'draft',
        expiryDate: parent.expiryDate,
        sentDate: null,
        viewedDate: null,
        acceptedDate: null,
        acceptedBy: null,
        acceptedByName: null,
        acceptedByEmail: null,
        signature: null,
        rejectedDate: null,
        rejectionReason: null,
        convertedToInvoiceId: null,
        convertedDate: null,
        showPricing: parent.showPricing,
        allowClientOptions: parent.allowClientOptions,
        createdBy: parent.createdBy,
        createdByName: parent.createdByName,
        notes: parent.notes,
        isArchived: false,
        version: nextVersion,
        parentProposalId: parent.parentProposalId ?? parent.id,
        contentSnapshot: null,
        viewCount: 0,
        lastViewedAt: null,
        viewerDevice: null,
        layoutSettings: parent.layoutSettings ?? {},
      };

      const allowedOverrides: Partial<Pick<InsertProposal, 'name' | 'notes' | 'expiryDate'>> = {};
      if (overrides?.name !== undefined) allowedOverrides.name = overrides.name;
      if (overrides?.notes !== undefined) allowedOverrides.notes = overrides.notes;
      if (overrides?.expiryDate !== undefined) allowedOverrides.expiryDate = overrides.expiryDate;

      const cloneValues: typeof schema.proposals.$inferInsert = {
        ...baseValues,
        ...allowedOverrides,
      };

      const created = (await tx.insert(schema.proposals).values(cloneValues).returning())[0];

      const sections = await tx
        .select()
        .from(schema.proposalSections)
        .where(eq(schema.proposalSections.proposalId, parentId));
      const sectionIdMap = new Map<string, string>();
      for (const s of sections) {
        const { id: oldId, createdAt: _c, updatedAt: _u, ...rest } = s;
        const inserted = await tx
          .insert(schema.proposalSections)
          .values({ ...rest, proposalId: created.id })
          .returning({ id: schema.proposalSections.id });
        if (inserted[0]) sectionIdMap.set(oldId, inserted[0].id);
      }
      const items = await tx
        .select()
        .from(schema.proposalItems)
        .where(eq(schema.proposalItems.proposalId, parentId));
      for (const it of items) {
        const { id: _id, createdAt: _c, updatedAt: _u, sectionId: oldSectionId, ...rest } = it;
        const newSectionId = oldSectionId ? sectionIdMap.get(oldSectionId) ?? null : null;
        await tx.insert(schema.proposalItems).values({
          ...rest,
          proposalId: created.id,
          sectionId: newSectionId,
        });
      }
      const ms = await tx
        .select()
        .from(schema.proposalPaymentMilestones)
        .where(eq(schema.proposalPaymentMilestones.proposalId, parentId));
      for (const m of ms) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = m;
        await tx.insert(schema.proposalPaymentMilestones).values({ ...rest, proposalId: created.id });
      }
      return created;
    });
  }

  async recordProposalView(id: string, device?: string | null): Promise<Proposal | undefined> {
    const existing = await this.getProposal(id);
    if (!existing) return undefined;
    const isFirst = (existing.viewCount ?? 0) === 0;
    const now = new Date();
    type ProposalUpdate = Partial<typeof schema.proposals.$inferInsert>;
    const patch: ProposalUpdate = {
      viewCount: sql<number>`${schema.proposals.viewCount} + 1` as unknown as number,
      lastViewedAt: now,
      updatedAt: now,
    };
    if (isFirst) {
      patch.viewedDate = now;
      patch.viewerDevice = device ?? null;
      if (existing.status === 'sent') patch.status = 'viewed';
    }
    const result = await db.update(schema.proposals)
      .set(patch)
      .where(eq(schema.proposals.id, id))
      .returning();
    return result[0];
  }

  async reorderProposalPaymentMilestones(proposalId: string, orderedIds: string[]): Promise<ProposalPaymentMilestone[]> {
    return await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(schema.proposalPaymentMilestones)
          .set({ order: i, updatedAt: new Date() })
          .where(and(
            eq(schema.proposalPaymentMilestones.id, orderedIds[i]),
            eq(schema.proposalPaymentMilestones.proposalId, proposalId),
          ));
      }
      return await tx.select()
        .from(schema.proposalPaymentMilestones)
        .where(eq(schema.proposalPaymentMilestones.proposalId, proposalId))
        .orderBy(schema.proposalPaymentMilestones.order);
    });
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
  async getChecklistTemplates(roleId?: string, companyId?: string): Promise<ChecklistTemplate[]> {
    try {
      const where = companyId
        ? and(
            eq(schema.checklistTemplates.isArchived, false),
            eq(schema.checklistTemplates.companyId, companyId),
          )
        : eq(schema.checklistTemplates.isArchived, false);

      const rows = await db.select()
        .from(schema.checklistTemplates)
        .where(where)
        .orderBy(desc(schema.checklistTemplates.createdAt));

      if (!roleId) return rows;

      return rows.filter(t => {
        const roles = t.visibleToRoles as string[] | null;
        if (!roles || roles.length === 0) return true;
        return roles.includes(roleId);
      });
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

  async createChecklistTemplate(template: InsertChecklistTemplate & { companyId?: string | null }): Promise<ChecklistTemplate> {
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
  async getChecklistInstances(projectId?: string, userId?: string, isAdmin?: boolean): Promise<ChecklistInstance[]> {
    try {
      const buildWhere = (projectFilter?: ReturnType<typeof eq>) => {
        const conditions = [];
        if (projectFilter) conditions.push(projectFilter);
        // Visibility filter: hide assignee_only checklists from non-assignees (unless admin).
        // NULL visibility treated as 'everyone' for backwards-compat with pre-migration rows.
        if (!isAdmin) {
          if (userId) {
            // Authenticated non-admin: see 'everyone' instances + own assignee_only instances
            conditions.push(
              or(
                isNull(schema.checklistInstances.visibility),
                eq(schema.checklistInstances.visibility, 'everyone'),
                eq(schema.checklistInstances.assigneeId, userId)
              )
            );
          } else {
            // No authenticated user: only show 'everyone' instances
            conditions.push(
              or(
                isNull(schema.checklistInstances.visibility),
                eq(schema.checklistInstances.visibility, 'everyone')
              )
            );
          }
        }
        return conditions.length > 0 ? and(...conditions) : undefined;
      };

      const whereClause = buildWhere(
        projectId ? eq(schema.checklistInstances.projectId, projectId) : undefined
      );

      const query = db.select()
        .from(schema.checklistInstances)
        .orderBy(desc(schema.checklistInstances.createdAt));

      if (whereClause) {
        return await query.where(whereClause);
      }
      return await query;
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
  async getBudget(projectId: string, tx?: any): Promise<Budget | undefined> {
    const exec = tx ?? db;
    try {
      const result = await exec.select()
        .from(schema.budgets)
        .where(eq(schema.budgets.projectId, projectId))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getBudget:", error);
      throw error;
    }
  }

  async createBudget(budget: InsertBudget, tx?: any): Promise<Budget> {
    const exec = tx ?? db;
    try {
      const result = await exec.insert(schema.budgets)
        .values(budget)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createBudget:", error);
      throw error;
    }
  }

  async updateBudget(id: string, budget: Partial<InsertBudget>, tx?: any): Promise<Budget | undefined> {
    const exec = tx ?? db;
    try {
      const result = await exec.update(schema.budgets)
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

  async calculateBudget(projectId: string, tx?: any): Promise<Budget | undefined> {
    const exec = tx ?? db;
    try {
      // Get or create budget for this project
      let budget = await this.getBudget(projectId, tx);
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
        }, tx);
      }

      // Calculate baseline from the single Contract estimate on the project.
      // Estimates are only considered budget-feeding once promoted to
      // status='contract'. There is at most one Contract estimate per project
      // (enforced by the /contract endpoint, which demotes any prior Contract
      // back to Approved).
      const estimates: Estimate[] = await exec.select()
        .from(schema.estimates)
        .where(and(
          eq(schema.estimates.projectId, projectId),
          eq(schema.estimates.status, "contract"),
        ));

      const estimateIds = estimates.map((e) => e.id);
      const estimateItems: EstimateItem[] = estimateIds.length > 0 ? await exec.select()
        .from(schema.estimateItems)
        .where(inArray(schema.estimateItems.estimateId, estimateIds)) : [];

      // COST-ONLY baseline. The Budget page is a pure cost view, so the
      // baseline must EXCLUDE GST and ALL markup (both per-line markup and the
      // global project markup). estimateItemBuilderCostExTax returns the raw
      // builder cost ex-tax per line (qty * unitCost, or the cached ex-tax
      // value for fixed-price PC-sum lines) — the same cost basis the canonical
      // estimate summary produces. Convert per-line to integer CENTS and round
      // before summing (priceIncTax/unitCost are doublePrecision DOLLARS while
      // budgets.baselineAmount is integer CENTS, and the UI divides by 100).
      const baselineAmount = estimateItems.reduce(
        (sum, item) => sum + Math.round(estimateItemBuilderCostExTax(item) * 100),
        0,
      );

      // Calculate actual from bills. Sum bill LINE ITEMS (not the inc-GST header
      // total) and strip GST from tax-inclusive lines so the actual is ex-GST —
      // matching the ex-GST baseline and the per-cost-code line items.
      const bills: Bill[] = await exec.select()
        .from(schema.bills)
        .where(eq(schema.bills.projectId, projectId));
      const billIdsForActual = bills.map((b) => b.id);
      const billLineItemsForActual: BillLineItem[] = billIdsForActual.length > 0
        ? await exec.select()
            .from(schema.billLineItems)
            .where(inArray(schema.billLineItems.billId, billIdsForActual))
        : [];
      const billByIdForActual = new Map<string, Bill>(bills.map((b) => [b.id, b]));

      const actualAmount = billLineItemsForActual.reduce((sum, li) => {
        const bill = billByIdForActual.get(li.billId);
        const exGst = billLineExGstCents(li.total || 0, li.tax, bill?.taxMode);
        return sum + (bill?.billType === 'credit' ? -exGst : exGst);
      }, 0);

      // Calculate variations
      const variations: Variation[] = await exec.select()
        .from(schema.variations)
        .where(and(
          eq(schema.variations.projectId, projectId),
          eq(schema.variations.status, "approved")
        ));

      const variationAmount = variations.reduce((sum, v) => sum + (v.subtotal || 0), 0);

      const revisedAmount = baselineAmount + variationAmount;
      const forecastAmount = actualAmount + (revisedAmount - actualAmount); // Simple forecast
      const varianceAmount = revisedAmount - forecastAmount;
      const profitPercent = revisedAmount > 0 ? Math.round(((revisedAmount - forecastAmount) / revisedAmount) * 100) : 0;

      // Update budget. Amount columns are integer-typed so we round any
      // float sums (estimate items use doublePrecision price columns) before
      // persisting — Postgres rejects e.g. 55653.41 for an integer column.
      const updated = await this.updateBudget(budget.id, {
        baselineAmount: Math.round(baselineAmount),
        revisedAmount: Math.round(revisedAmount),
        actualAmount: Math.round(actualAmount),
        forecastAmount: Math.round(forecastAmount),
        varianceAmount: Math.round(varianceAmount),
        profitPercent
      }, tx);

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

  async createBudgetLineItem(item: InsertBudgetLineItem, tx?: any): Promise<BudgetLineItem> {
    const exec = tx ?? db;
    try {
      const result = await exec.insert(schema.budgetLineItems)
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

  async recalculateBudgetLineItems(budgetId: string, tx?: any): Promise<BudgetLineItem[]> {
    const exec = tx ?? db;
    try {
      const budgetResult = await exec.select()
        .from(schema.budgets)
        .where(eq(schema.budgets.id, budgetId))
        .limit(1);
      if (!budgetResult[0]) throw new Error("Budget not found");

      const budget = budgetResult[0];
      const projectId = budget.projectId;

      // Load cost codes and categories for lookups
      const costCodes = await exec.select().from(schema.costCodes).where(eq(schema.costCodes.isActive, true));
      const costCategories = await exec.select().from(schema.costCategories);

      const costCodeMap = new Map<string, CostCode>(costCodes.map((cc: CostCode) => [cc.id, cc]));
      const categoryMap = new Map<string, string>(costCategories.map((cat: CostCategory) => [cat.id, `${cat.code} - ${cat.title}`]));

      // Pull items from the project's Contract estimate only (see
      // calculateBudget for the rationale).
      const estimates: Estimate[] = await exec.select().from(schema.estimates).where(and(
        eq(schema.estimates.projectId, projectId),
        eq(schema.estimates.status, "contract"),
      ));
      const estimateIds = estimates.map((e) => e.id);
      const estimateItems: EstimateItem[] = estimateIds.length > 0 ? await exec.select()
        .from(schema.estimateItems)
        .where(inArray(schema.estimateItems.estimateId, estimateIds)) : [];

      // Get bills (exclude vendor credits from "actual" or subtract them)
      const bills: Bill[] = await exec.select().from(schema.bills).where(eq(schema.bills.projectId, projectId));
      const billIds = bills.map((b) => b.id);
      const billLineItems: BillLineItem[] = billIds.length > 0 ? await exec.select()
        .from(schema.billLineItems)
        .where(inArray(schema.billLineItems.billId, billIds)) : [];

      // Key: costCodeId | "cat:{categoryId}" | "uncategorized"
      type BucketData = { budgeted: number; actual: number; costCodeId: string | null; costCodeTitle: string; categoryTitle: string };
      const buckets = new Map<string, BucketData>();

      const getBucket = (key: string, costCodeId: string | null, costCodeTitle: string, categoryTitle: string): BucketData => {
        if (!buckets.has(key)) {
          buckets.set(key, { budgeted: 0, actual: 0, costCodeId, costCodeTitle, categoryTitle });
        }
        return buckets.get(key)!;
      };

      // Budget from estimate items — COST ONLY (ex-tax, no per-line markup, no
      // global project markup), matching the cost-only baseline in
      // calculateBudget. estimateItemBuilderCostExTax returns dollars; convert
      // per line to integer CENTS (budget_line_items.budgetedAmount is integer).
      for (const item of estimateItems) {
        const amount = Math.round(estimateItemBuilderCostExTax(item) * 100);
        if (item.costCode) {
          const cc = costCodeMap.get(item.costCode);
          const catTitle = cc?.categoryId ? (categoryMap.get(cc.categoryId) || "") : "";
          const bucket = getBucket(item.costCode, cc?.id || null, cc ? `${cc.code} - ${cc.title}` : item.costCode, catTitle);
          bucket.budgeted += amount;
        } else if ((item as any).costCategoryId) {
          const catId = (item as any).costCategoryId as string;
          const catTitle = categoryMap.get(catId) || "Unknown Category";
          const bucket = getBucket(`cat:${catId}`, null, catTitle, catTitle);
          bucket.budgeted += amount;
        } else {
          const bucket = getBucket("uncategorized", null, "Uncategorized", "");
          bucket.budgeted += amount;
        }
      }

      // Actuals from bill line items. Bill line totals are stored INC-GST for
      // tax-inclusive bills, so strip GST to keep the actual ex-GST and
      // comparable with the ex-GST budgeted amounts above.
      for (const billItem of billLineItems) {
        const bill = bills.find((b) => b.id === billItem.billId);
        const multiplier = bill?.billType === "credit" ? -1 : 1;
        const amount = billLineExGstCents(billItem.total || 0, billItem.tax, bill?.taxMode) * multiplier;
        if (billItem.costCodeId) {
          const cc = costCodeMap.get(billItem.costCodeId);
          const catTitle = cc?.categoryId ? (categoryMap.get(cc.categoryId) || "") : "";
          const bucket = getBucket(billItem.costCodeId, billItem.costCodeId, cc ? `${cc.code} - ${cc.title}` : billItem.costCodeId, catTitle);
          bucket.actual += amount;
        } else {
          const bucket = getBucket("uncategorized", null, "Uncategorized", "");
          bucket.actual += amount;
        }
      }

      // Delete and recreate budget line items
      await exec.delete(schema.budgetLineItems).where(eq(schema.budgetLineItems.budgetId, budgetId));

      const lineItems: BudgetLineItem[] = [];
      let sortOrder = 0;

      for (const [, data] of buckets.entries()) {
        const forecast = data.actual + Math.max(0, data.budgeted - data.actual);
        const variance = data.budgeted - forecast;
        const variancePercent = data.budgeted > 0 ? Math.round((variance / data.budgeted) * 100) : 0;

        // budget_line_items amount columns are integer-typed; the source
        // estimate items expose priceIncTax as doublePrecision dollars, so
        // we must round before insert to avoid Postgres rejecting decimals.
        const lineItem = await this.createBudgetLineItem({
          budgetId,
          costCodeId: data.costCodeId,
          costCodeTitle: data.costCodeTitle,
          categoryTitle: data.categoryTitle,
          budgetedAmount: Math.round(data.budgeted),
          actualAmount: Math.round(data.actual),
          variationAmount: 0,
          forecastAmount: Math.round(forecast),
          variance: Math.round(variance),
          variancePercent,
          profitAmount: Math.round(variance),
          sortOrder: sortOrder++
        }, tx);
        lineItems.push(lineItem);
      }

      return lineItems;
    } catch (error) {
      console.error("Database error in recalculateBudgetLineItems:", error);
      throw error;
    }
  }

  async getProjectIdsWithContractEstimate(companyId: string): Promise<string[]> {
    try {
      const rows = await db.selectDistinct({ projectId: schema.estimates.projectId })
        .from(schema.estimates)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.estimates.projectId))
        .where(and(
          eq(schema.estimates.status, "contract"),
          eq(schema.projects.companyId, companyId),
        ));
      return rows.map((r: { projectId: string }) => r.projectId).filter(Boolean);
    } catch (error) {
      console.error("Database error in getProjectIdsWithContractEstimate:", error);
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

  async recalculateLabourHoursBudget(projectId: string, tx?: any): Promise<LabourHoursBudget[]> {
    const exec = tx ?? db;
    try {
      // Get project's company for scoping cost codes
      const projectRows = await exec.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
      if (!projectRows[0] || !projectRows[0].companyId) {
        return [];
      }
      const companyId = projectRows[0].companyId;

      // Pull cost codes flagged as labour for this company. These are the
      // exclusive source of rows on the labour-hours budget; non-labour codes
      // never appear (even if a stray timesheet references one).
      const labourCostCodes = await exec.select()
        .from(schema.costCodes)
        .where(and(
          eq(schema.costCodes.isActive, true),
          eq(schema.costCodes.isArchived, false),
          eq(schema.costCodes.isLabour, true),
          eq(schema.costCodes.companyId, companyId)
        ))
        .orderBy(schema.costCodes.sortOrder, schema.costCodes.code);

      const labourCostCodeIds = new Set(labourCostCodes.map((cc: CostCode) => cc.id));

      // Seed map with the labour-flagged skeleton so every flagged code
      // appears with zero hours when there's no Contract estimate yet.
      const costCodeMap = new Map<string, {
        budgetedHours: number;
        costCodeTitle: string;
        categoryTitle: string;
        costCodeId: string | null;
      }>();

      for (const cc of labourCostCodes) {
        costCodeMap.set(cc.id, {
          budgetedHours: 0,
          costCodeTitle: cc.title,
          categoryTitle: "General",
          costCodeId: cc.id
        });
      }

      // Pull the project's Contract estimate. Without one, the skeleton is
      // returned as-is.
      const estimates: Estimate[] = await exec.select()
        .from(schema.estimates)
        .where(and(
          eq(schema.estimates.projectId, projectId),
          eq(schema.estimates.status, "contract"),
        ));

      // Sum quantity from contract-estimate items grouped by cost code,
      // restricted to items whose cost code is flagged isLabour=true. The
      // legacy `type='labour'` filter is dropped — the flag on the cost code
      // is now the single source of truth.
      const estimateItems: EstimateItem[] = estimates.length > 0 ? await exec.select()
        .from(schema.estimateItems)
        .where(eq(schema.estimateItems.estimateId, estimates[0].id)) : [];

      for (const item of estimateItems) {
        const costCodeId = item.costCode || null;
        if (!costCodeId || !labourCostCodeIds.has(costCodeId)) continue;
        const existing = costCodeMap.get(costCodeId)!; // seeded above
        existing.budgetedHours += item.quantity || 0;
      }

      // Get timesheets for this project
      const timesheets: Timesheet[] = await exec.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.projectId, projectId));

      // Get timesheet cost code splits
      const timesheetIds = timesheets.map((t) => t.id);
      const timesheetCostCodes: TimesheetCostCode[] = timesheetIds.length > 0 ? await exec.select()
        .from(schema.timesheetCostCodes)
        .where(inArray(schema.timesheetCostCodes.timesheetId, timesheetIds)) : [];

      // Track which timesheets are covered by the join table
      const timesheetsWithSplits = new Set(timesheetCostCodes.map((tcc) => tcc.timesheetId));

      // Fallback: when a timesheet has no costCodeId but is linked to an
      // estimate work item, derive the cost code from that estimate item.
      // Without this, mobile/clock-in entries that only reference a work
      // item are dropped from the labour-hours actuals.
      const workItemIds = Array.from(new Set(timesheets
        .filter((t) => !t.costCodeId && t.workItemId)
        .map((t) => t.workItemId as string)));
      const workItemCostCode = new Map<string, string>();
      if (workItemIds.length > 0) {
        const items = await exec.select({
          id: schema.estimateItems.id,
          costCode: schema.estimateItems.costCode,
        })
          .from(schema.estimateItems)
          .where(inArray(schema.estimateItems.id, workItemIds));
        for (const it of items) {
          if (it.costCode) workItemCostCode.set(it.id, it.costCode);
        }
      }

      // Map pending and approved hours by cost code ID
      const pendingHoursMap = new Map<string, number>();
      const approvedHoursMap = new Map<string, number>();

      // Helper to add hours to the correct map. Only labour-flagged cost
      // codes (already seeded into costCodeMap) accumulate hours — timesheet
      // entries against non-labour or uncategorized cost codes are ignored
      // so the budget never spawns rows outside the labour set.
      const addHours = (mapKey: string, duration: number, status: string) => {
        if (!costCodeMap.has(mapKey)) return;
        if (status === "submitted") {
          pendingHoursMap.set(mapKey, (pendingHoursMap.get(mapKey) || 0) + duration);
        } else if (status === "approved") {
          approvedHoursMap.set(mapKey, (approvedHoursMap.get(mapKey) || 0) + duration);
        }
      };

      // Process hours from join table splits
      for (const split of timesheetCostCodes) {
        const timesheet = timesheets.find((t) => t.id === split.timesheetId);
        if (!timesheet) continue;

        const duration = parseFloat(split.duration);
        const mapKey = split.costCodeId || "uncategorized";
        addHours(mapKey, duration, timesheet.status);
      }

      // Process timesheets NOT in the join table (cost code stored directly
      // on timesheet, or derived from the linked work item).
      for (const ts of timesheets) {
        if (timesheetsWithSplits.has(ts.id)) continue;
        const duration = parseFloat(ts.duration || "0");
        if (duration <= 0) continue;

        const mapKey = ts.costCodeId
          || (ts.workItemId ? workItemCostCode.get(ts.workItemId) : undefined)
          || "uncategorized";
        addHours(mapKey, duration, ts.status);
      }

      // Delete existing labour hours budget for this project
      await exec.delete(schema.labourHoursBudget)
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

      const labourHoursBudget = await exec.insert(schema.labourHoursBudget)
        .values(valuesToInsert)
        .returning();

      return labourHoursBudget;
    } catch (error) {
      console.error("Database error in recalculateLabourHoursBudget:", error);
      throw error;
    }
  }

  async getProjectLabourCostBreakdown(projectId: string): Promise<{
    byCostCode: Array<{ costCodeId: string | null; costCodeTitle: string; categoryTitle: string; labourCents: number }>;
    total: number;
    entries: Array<{
      costCodeId: string | null;
      timesheetId: string;
      workerName: string;
      date: Date;
      hours: number;
      rateCents: number;
      costCents: number;
      status: string;
    }>;
  }> {
    try {
      // APPROVED timesheets only — draft/submitted/rejected are excluded from
      // actual cost. Mirrors the actual-costs labour total so the Budget table's
      // Labour column reconciles with the gross-margin bar. ($0 approved
      // subcontractor timesheets are fine — their cost arrives via bills.)
      const allTimesheets = await db.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.projectId, projectId));
      const timesheets = allTimesheets.filter((t) => t.status === "approved");
      if (timesheets.length === 0) return { byCostCode: [], total: 0, entries: [] };

      const timesheetIds = timesheets.map((t) => t.id);
      const splits = await db.select()
        .from(schema.timesheetCostCodes)
        .where(inArray(schema.timesheetCostCodes.timesheetId, timesheetIds));
      const splitsByTs = new Map<string, TimesheetCostCode[]>();
      for (const s of splits) {
        const arr = splitsByTs.get(s.timesheetId) || [];
        arr.push(s);
        splitsByTs.set(s.timesheetId, arr);
      }

      // Cost code + category titles (load all so deleted/inactive codes still label).
      const costCodes = await db.select().from(schema.costCodes);
      const categories = await db.select().from(schema.costCategories);
      const categoryTitleById = new Map<string, string>(
        categories.map((c) => [c.id, `${c.code} - ${c.title}`]),
      );
      const codeInfo = new Map<string, { title: string; categoryTitle: string }>();
      for (const cc of costCodes) {
        codeInfo.set(cc.id, {
          title: `${cc.code} - ${cc.title}`,
          categoryTitle: cc.categoryId ? (categoryTitleById.get(cc.categoryId) || "") : "",
        });
      }

      // Fallback: direct timesheets with no cost code but linked to an estimate
      // work item derive their cost code from that item (mirrors labour hours).
      const workItemIds = Array.from(new Set(timesheets
        .filter((t) => !t.costCodeId && t.workItemId)
        .map((t) => t.workItemId as string)));
      const workItemCostCode = new Map<string, string>();
      if (workItemIds.length > 0) {
        const items = await db.select({
          id: schema.estimateItems.id,
          costCode: schema.estimateItems.costCode,
        })
          .from(schema.estimateItems)
          .where(inArray(schema.estimateItems.id, workItemIds));
        for (const it of items) {
          if (it.costCode) workItemCostCode.set(it.id, it.costCode);
        }
      }

      // Worker display names.
      const userIds = Array.from(new Set(timesheets.map((t) => t.userId)));
      const workers = userIds.length > 0 ? await db.select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
      }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
      const workerName = new Map<string, string>();
      for (const u of workers) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Unknown";
        workerName.set(u.id, name);
      }

      // Bucket cents per cost code key ("uncategorized" for null) and collect
      // per-timesheet detail for the drill-down.
      const buckets = new Map<string, number>();
      const entries: Array<{
        costCodeId: string | null; timesheetId: string; workerName: string;
        date: Date; hours: number; rateCents: number; costCents: number; status: string;
      }> = [];
      const addBucket = (key: string, cents: number) => buckets.set(key, (buckets.get(key) || 0) + cents);
      const nameFor = (userId: string) => workerName.get(userId) || "Unknown";

      for (const ts of timesheets) {
        // The timesheet header total is the source of truth for cost so the
        // per-code sum always equals the actual-costs labour total.
        const tsCents = Math.round((Number(ts.total) || 0) * 100);
        if (tsCents === 0) continue;

        const tsSplits = splitsByTs.get(ts.id) || [];
        if (tsSplits.length > 0) {
          // Distribute the header total across splits proportional to each
          // split's dollar total (fallback to hours, then even). The remainder
          // goes to the last split so the allocation sums exactly to tsCents.
          let weights = tsSplits.map((s) => Number(s.total) || 0);
          let weightSum = weights.reduce((a, b) => a + b, 0);
          if (weightSum <= 0) {
            weights = tsSplits.map((s) => Number(s.duration) || 0);
            weightSum = weights.reduce((a, b) => a + b, 0);
          }
          if (weightSum <= 0) {
            weights = tsSplits.map(() => 1);
            weightSum = tsSplits.length;
          }
          let allocated = 0;
          tsSplits.forEach((s, idx) => {
            const cents = idx === tsSplits.length - 1
              ? tsCents - allocated
              : Math.floor((tsCents * weights[idx]) / weightSum);
            allocated += cents;
            addBucket(s.costCodeId, cents);
            entries.push({
              costCodeId: s.costCodeId,
              timesheetId: ts.id,
              workerName: nameFor(ts.userId),
              date: ts.date,
              hours: Number(s.duration) || 0,
              rateCents: Math.round((Number(s.hourlyRate) || 0) * 100),
              costCents: cents,
              status: ts.status,
            });
          });
        } else {
          const codeKey = ts.costCodeId
            || (ts.workItemId ? workItemCostCode.get(ts.workItemId) : undefined)
            || "uncategorized";
          addBucket(codeKey, tsCents);
          entries.push({
            costCodeId: codeKey === "uncategorized" ? null : codeKey,
            timesheetId: ts.id,
            workerName: nameFor(ts.userId),
            date: ts.date,
            hours: Number(ts.duration) || 0,
            rateCents: Math.round((Number(ts.hourlyRate) || 0) * 100),
            costCents: tsCents,
            status: ts.status,
          });
        }
      }

      const byCostCode = Array.from(buckets.entries()).map(([key, cents]) => {
        if (key === "uncategorized") {
          return { costCodeId: null, costCodeTitle: "Uncategorized", categoryTitle: "", labourCents: cents };
        }
        const info = codeInfo.get(key);
        return {
          costCodeId: key,
          costCodeTitle: info?.title || key,
          categoryTitle: info?.categoryTitle || "",
          labourCents: cents,
        };
      });
      const total = byCostCode.reduce((s, b) => s + b.labourCents, 0);
      return { byCostCode, total, entries };
    } catch (error) {
      console.error("Database error in getProjectLabourCostBreakdown:", error);
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

  async clockIn(projectId: string | null, userId: string, costCodeId?: string): Promise<Timesheet> {
    try {
      // First, clock out any existing active timesheet
      const activeTimesheet = await this.getActiveTimesheet(userId);
      if (activeTimesheet) {
        await this.clockOut(activeTimesheet.id, userId);
      }

      // Create new active timesheet — record HH:mm and date in the company timezone
      const now = new Date();
      const cfg = await this.getSystemConfiguration();
      const tz = cfg?.timezone || "Australia/Sydney";
      const startTime = formatHHmmInTz(now, tz);
      const dateInTz = calendarDateMidnightUtcInTz(now, tz);

      const newTimesheet = await db.insert(schema.timesheets)
        .values({
          projectId,
          userId,
          date: dateInTz,
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

  async clockOut(timesheetId: string, userId: string, breakDurationMinutes: number = 0): Promise<Timesheet | undefined> {
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
      const cfg = await this.getSystemConfiguration();
      const tz = cfg?.timezone || "Australia/Sydney";
      const endTime = formatHHmmInTz(now, tz);

      // Calculate duration in hours, subtract break
      let duration = 0;
      if (timesheet.clockInTime) {
        const diffMs = now.getTime() - new Date(timesheet.clockInTime).getTime();
        duration = diffMs / (1000 * 60 * 60); // Convert to hours
      }
      const breakHours = breakDurationMinutes / 60;
      const netDuration = Math.max(0, duration - breakHours);

      const result = await db.update(schema.timesheets)
        .set({
          endTime,
          actualEndTime: endTime,
          duration: netDuration.toFixed(2),
          breakDuration: breakHours.toFixed(2),
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
  async getSchedule(projectId: string, category: string = "construction"): Promise<Schedule | undefined> {
    try {
      const result = await db.select()
        .from(schema.schedules)
        .where(and(eq(schema.schedules.projectId, projectId), eq(schema.schedules.scheduleCategory, category)))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getSchedule:", error);
      throw error;
    }
  }

  async getSchedulesByProject(projectId: string): Promise<Schedule[]> {
    try {
      const result = await db.select()
        .from(schema.schedules)
        .where(eq(schema.schedules.projectId, projectId));
      return result;
    } catch (error) {
      console.error("Database error in getSchedulesByProject:", error);
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

  async updateScheduleOnline(id: string, isOnline: boolean): Promise<Schedule | undefined> {
    try {
      const result = await db.update(schema.schedules)
        .set({ isOnline, updatedAt: new Date() })
        .where(eq(schema.schedules.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateScheduleOnline:", error);
      throw error;
    }
  }

  // Schedule Items CRUD
  async getScheduleItems(scheduleId: string): Promise<ScheduleItem[]> {
    try {
      return await db.select()
        .from(schema.scheduleItems)
        .where(eq(schema.scheduleItems.scheduleId, scheduleId))
        .orderBy(asc(schema.scheduleItems.sortOrder));
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
        .orderBy(asc(schema.scheduleItems.sortOrder), asc(schema.scheduleItems.startDate));
      
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
      return items.map(row => ({
        ...row.schedule_items,
        projectId: row.schedules.projectId,
        projectName: row.projects.name,
        projectColor: (row.projects as any).color ?? null,
      })) as any as ScheduleItem[];
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
  async getSelectionTemplates(companyId: string, category?: string): Promise<any[]> {
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
      
      const templates = await db.select()
        .from(schema.selectionTemplates)
        .where(and(...conditions));

      if (templates.length === 0) return [];

      const templateIds = templates.map(t => t.id);
      const memberships = await db.select({
        templateId: schema.selectionTemplateGroupMemberships.templateId,
        groupId: schema.selectionTemplateGroupMemberships.groupId,
        groupName: schema.selectionTemplateGroups.name,
      })
        .from(schema.selectionTemplateGroupMemberships)
        .innerJoin(schema.selectionTemplateGroups, eq(schema.selectionTemplateGroupMemberships.groupId, schema.selectionTemplateGroups.id))
        .where(inArray(schema.selectionTemplateGroupMemberships.templateId, templateIds));

      const groupMap = new Map<string, { id: string; name: string }[]>();
      for (const m of memberships) {
        if (!groupMap.has(m.templateId)) groupMap.set(m.templateId, []);
        groupMap.get(m.templateId)!.push({ id: m.groupId, name: m.groupName });
      }

      return templates.map(t => ({
        ...t,
        groups: groupMap.get(t.id) || [],
        groupIds: (groupMap.get(t.id) || []).map(g => g.id),
      }));
    } catch (error) {
      console.error("Database error in getSelectionTemplates:", error);
      throw error;
    }
  }

  async getSelectionTemplate(id: string, companyId: string): Promise<any | undefined> {
    try {
      const result = await db.select()
        .from(schema.selectionTemplates)
        .where(eq(schema.selectionTemplates.id, id))
        .limit(1);
      
      const template = result[0];
      if (!template || !(template.companyId === companyId || template.isPublic)) {
        return undefined;
      }

      const memberships = await db.select({
        groupId: schema.selectionTemplateGroupMemberships.groupId,
        groupName: schema.selectionTemplateGroups.name,
      })
        .from(schema.selectionTemplateGroupMemberships)
        .innerJoin(schema.selectionTemplateGroups, eq(schema.selectionTemplateGroupMemberships.groupId, schema.selectionTemplateGroups.id))
        .where(eq(schema.selectionTemplateGroupMemberships.templateId, id));

      return {
        ...template,
        groups: memberships.map(m => ({ id: m.groupId, name: m.groupName })),
        groupIds: memberships.map(m => m.groupId),
      };
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

  async replaceTemplateGroups(templateId: string, groupIds: string[], companyId: string): Promise<void> {
    try {
      // Verify template belongs to company before mutating memberships
      const [template] = await db.select({ id: schema.selectionTemplates.id })
        .from(schema.selectionTemplates)
        .where(and(eq(schema.selectionTemplates.id, templateId), eq(schema.selectionTemplates.companyId, companyId)));
      if (!template) throw new Error("Template not found or access denied");
      await db.delete(schema.selectionTemplateGroupMemberships)
        .where(eq(schema.selectionTemplateGroupMemberships.templateId, templateId));
      if (groupIds.length > 0) {
        await db.insert(schema.selectionTemplateGroupMemberships)
          .values(groupIds.map(groupId => ({ templateId, groupId })))
          .onConflictDoNothing();
      }
    } catch (error) {
      console.error("Database error in replaceTemplateGroups:", error);
      throw error;
    }
  }

  async addTemplateGroupMembership(templateId: string, groupId: string, companyId: string): Promise<void> {
    try {
      const [template] = await db.select({ id: schema.selectionTemplates.id })
        .from(schema.selectionTemplates)
        .where(and(eq(schema.selectionTemplates.id, templateId), eq(schema.selectionTemplates.companyId, companyId)));
      if (!template) throw new Error("Template not found or access denied");
      const [group] = await db.select({ id: schema.selectionTemplateGroups.id })
        .from(schema.selectionTemplateGroups)
        .where(and(eq(schema.selectionTemplateGroups.id, groupId), eq(schema.selectionTemplateGroups.companyId, companyId)));
      if (!group) throw new Error("Group not found or access denied");
      await db.insert(schema.selectionTemplateGroupMemberships)
        .values({ templateId, groupId })
        .onConflictDoNothing();
    } catch (error) {
      console.error("Database error in addTemplateGroupMembership:", error);
      throw error;
    }
  }

  async removeTemplateGroupMembership(templateId: string, groupId: string, companyId: string): Promise<void> {
    try {
      const [template] = await db.select({ id: schema.selectionTemplates.id })
        .from(schema.selectionTemplates)
        .where(and(eq(schema.selectionTemplates.id, templateId), eq(schema.selectionTemplates.companyId, companyId)));
      if (!template) throw new Error("Template not found or access denied");
      await db.delete(schema.selectionTemplateGroupMemberships)
        .where(and(
          eq(schema.selectionTemplateGroupMemberships.templateId, templateId),
          eq(schema.selectionTemplateGroupMemberships.groupId, groupId)
        ));
    } catch (error) {
      console.error("Database error in removeTemplateGroupMembership:", error);
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

  async getSelectionTemplateGroups(companyId: string): Promise<SelectionTemplateGroup[]> {
    try {
      return await db.select()
        .from(schema.selectionTemplateGroups)
        .where(eq(schema.selectionTemplateGroups.companyId, companyId))
        .orderBy(asc(schema.selectionTemplateGroups.sortOrder), asc(schema.selectionTemplateGroups.name));
    } catch (error) {
      console.error("Database error in getSelectionTemplateGroups:", error);
      throw error;
    }
  }

  async createSelectionTemplateGroup(group: InsertSelectionTemplateGroup & { companyId: string }): Promise<SelectionTemplateGroup> {
    try {
      const result = await db.insert(schema.selectionTemplateGroups).values(group).returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createSelectionTemplateGroup:", error);
      throw error;
    }
  }

  async updateSelectionTemplateGroup(id: string, group: Partial<InsertSelectionTemplateGroup>, companyId: string): Promise<SelectionTemplateGroup | undefined> {
    try {
      const result = await db.update(schema.selectionTemplateGroups)
        .set(group)
        .where(and(eq(schema.selectionTemplateGroups.id, id), eq(schema.selectionTemplateGroups.companyId, companyId)))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateSelectionTemplateGroup:", error);
      throw error;
    }
  }

  async deleteSelectionTemplateGroup(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.selectionTemplateGroups)
        .where(and(eq(schema.selectionTemplateGroups.id, id), eq(schema.selectionTemplateGroups.companyId, companyId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteSelectionTemplateGroup:", error);
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

  // Focus Blocks CRUD
  async getFocusBlocks(userId: string, companyId: string): Promise<schema.FocusBlock[]> {
    try {
      return await db.select().from(schema.focusBlocks)
        .where(and(
          eq(schema.focusBlocks.userId, userId),
          eq(schema.focusBlocks.companyId, companyId)
        ))
        .orderBy(asc(schema.focusBlocks.createdAt));
    } catch (error) {
      console.error("Database error in getFocusBlocks:", error);
      throw error;
    }
  }

  async getFocusBlock(id: string, companyId: string): Promise<schema.FocusBlock | undefined> {
    try {
      const result = await db.select().from(schema.focusBlocks)
        .where(and(
          eq(schema.focusBlocks.id, id),
          eq(schema.focusBlocks.companyId, companyId)
        ))
        .limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error in getFocusBlock:", error);
      throw error;
    }
  }

  async createFocusBlock(block: schema.InsertFocusBlockWithOwner): Promise<schema.FocusBlock> {
    try {
      const [result] = await db.insert(schema.focusBlocks).values(block).returning();
      return result;
    } catch (error) {
      console.error("Database error in createFocusBlock:", error);
      throw error;
    }
  }

  async updateFocusBlock(id: string, block: Partial<schema.InsertFocusBlock>, companyId: string): Promise<schema.FocusBlock | undefined> {
    try {
      const [result] = await db.update(schema.focusBlocks)
        .set({ ...block, updatedAt: new Date() })
        .where(and(
          eq(schema.focusBlocks.id, id),
          eq(schema.focusBlocks.companyId, companyId)
        ))
        .returning();
      return result;
    } catch (error) {
      console.error("Database error in updateFocusBlock:", error);
      throw error;
    }
  }

  async deleteFocusBlock(id: string, companyId: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.focusBlocks)
        .where(and(
          eq(schema.focusBlocks.id, id),
          eq(schema.focusBlocks.companyId, companyId)
        ))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteFocusBlock:", error);
      throw error;
    }
  }

  async getFocusBlockTasks(blockId: string, companyId: string, limit: number = 4, userId?: string): Promise<schema.Task[]> {
    try {
      // Scoped block lookup: companyId guards ownership
      const block = await db.select().from(schema.focusBlocks)
        .where(and(
          eq(schema.focusBlocks.id, blockId),
          eq(schema.focusBlocks.companyId, companyId),
        ))
        .limit(1);
      if (!block[0]) return [];
      
      const fb = block[0];
      // Use the block owner's userId if no userId supplied (e.g. viewing another permitted user's calendar)
      const ownerUserId = userId || fb.userId;
      const pinnedIds = (fb.pinnedTaskIds as string[]) || [];
      
      // Always include pinned tasks first (fetch them explicitly)
      let pinnedTasks: schema.Task[] = [];
      if (pinnedIds.length > 0) {
        const pinnedRows = await db.select().from(schema.notes)
          .where(and(
            eq(schema.notes.companyId, companyId),
            eq(schema.notes.type, 'task'),
            inArray(schema.notes.id, pinnedIds),
          ));
        pinnedTasks = pinnedRows as schema.Task[];
      }

      // Auto-fill: unscheduled, non-completed tasks for the block owner, sorted by priority then soonest due
      const extraNeeded = Math.max(0, limit - pinnedTasks.length);
      let autoFill: schema.Task[] = [];
      if (extraNeeded > 0) {
        const whereConditions = [
          eq(schema.notes.companyId, companyId),
          eq(schema.notes.type, 'task'),
          isNull(schema.notes.startTime),
          isNull(schema.notes.endTime),
          isNull(schema.notes.archivedAt),
          // Scope to block owner's assigned tasks (either single or multi-assignee)
          ...(ownerUserId ? [
            sql`(${schema.notes.assigneeId} = ${ownerUserId} OR ${ownerUserId} = ANY(${schema.notes.assigneeIds}::text[]))`
          ] : []),
          // Exclude completed tasks (all terminal statuses used by this app)
          sql`COALESCE(${schema.notes.status}, '') NOT IN ('done', 'complete', 'completed')`,
        ];

        // Category-based filtering
        if (fb.categoryType === 'project' && fb.categoryId) {
          // Project-linked: only tasks in that project
          whereConditions.push(eq(schema.notes.projectId, fb.categoryId));
        } else if (fb.categoryType === 'business') {
          // Business tasks: tasks with no project
          whereConditions.push(isNull(schema.notes.projectId));
        } else if (fb.categoryType === 'tag' && fb.categoryId) {
          // Label-linked: tasks whose JSON labels array contains the given label option id.
          // Cast JSON → JSONB to use the @> containment operator safely.
          whereConditions.push(
            sql`${schema.notes.labels}::jsonb @> jsonb_build_array(${fb.categoryId}::text)`
          );
        }

        const autoRows = await db.select().from(schema.notes)
          .where(and(...whereConditions))
          .orderBy(
            sql`CASE ${schema.notes.priority} WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
            sql`${schema.notes.dueDate} ASC NULLS LAST`,
          )
          .limit(extraNeeded + pinnedIds.length);

        const pinnedSet = new Set(pinnedIds);
        autoFill = (autoRows as schema.Task[]).filter(t => !pinnedSet.has(t.id)).slice(0, extraNeeded);
      }

      return [...pinnedTasks, ...autoFill];
    } catch (error) {
      console.error("Database error in getFocusBlockTasks:", error);
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
      // Only show unscheduled messages or scheduled messages that have been sent
      const baseConditions = and(
        eq(schema.messages.channelId, channelId),
        eq(schema.messages.isDeleted, false),
        or(isNull(schema.messages.scheduledStatus), eq(schema.messages.scheduledStatus, 'sent'))
      );

      let query = db.select().from(schema.messages).where(baseConditions);
      
      if (before) {
        query = query.where(
          and(
            baseConditions,
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
            eq(schema.messages.isDeleted, false),
            or(isNull(schema.messages.scheduledStatus), eq(schema.messages.scheduledStatus, 'sent'))
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
      const created = result[0] as Message;

      // If this is a reply, increment the parent's threadCount
      if (message.threadParentId) {
        await db.update(schema.messages)
          .set({ threadCount: sql`${schema.messages.threadCount} + 1`, updatedAt: new Date() })
          .where(eq(schema.messages.id, message.threadParentId));
      }

      return created;
    } catch (error) {
      console.error("Database error in createMessage:", error);
      throw error;
    }
  }

  async getMessageReplies(messageId: string): Promise<Message[]> {
    try {
      const result = await db.select().from(schema.messages)
        .where(and(
          eq(schema.messages.threadParentId, messageId),
          eq(schema.messages.isDeleted, false)
        ))
        .orderBy(asc(schema.messages.createdAt));
      return result as Message[];
    } catch (error) {
      console.error("Database error in getMessageReplies:", error);
      throw error;
    }
  }

  async getPinnedMessages(channelId: string): Promise<Message[]> {
    try {
      const result = await db.select().from(schema.messages)
        .where(and(
          eq(schema.messages.channelId, channelId),
          eq(schema.messages.isPinned, true),
          eq(schema.messages.isDeleted, false)
        ))
        .orderBy(desc(schema.messages.pinnedAt));
      return result as Message[];
    } catch (error) {
      console.error("Database error in getPinnedMessages:", error);
      throw error;
    }
  }

  async toggleMessagePin(messageId: string, userId: string, isChannelOwner: boolean): Promise<Message | { error: string } | undefined> {
    try {
      const existing = await db.select().from(schema.messages)
        .where(eq(schema.messages.id, messageId))
        .limit(1);
      if (!existing[0]) return undefined;
      const currentlyPinned = existing[0].isPinned;
      // Unpin authorization: only the pinner or a channel owner/admin may unpin
      if (currentlyPinned) {
        const isPinner = existing[0].pinnedByUserId === userId;
        if (!isPinner && !isChannelOwner) {
          return { error: "Only the user who pinned this message or a channel owner can unpin it" };
        }
      }
      const result = await db.update(schema.messages)
        .set({
          isPinned: !currentlyPinned,
          pinnedAt: currentlyPinned ? null : new Date(),
          pinnedByUserId: currentlyPinned ? null : userId,
          updatedAt: new Date(),
        })
        .where(eq(schema.messages.id, messageId))
        .returning();
      return result[0] as Message | undefined;
    } catch (error) {
      console.error("Database error in toggleMessagePin:", error);
      throw error;
    }
  }

  async getPendingScheduledMessages(): Promise<Message[]> {
    try {
      const now = new Date();
      const result = await db.select().from(schema.messages)
        .where(and(
          eq(schema.messages.scheduledStatus, 'pending'),
          lte(schema.messages.scheduledAt, now)
        ))
        .orderBy(asc(schema.messages.scheduledAt));
      return result as Message[];
    } catch (error) {
      console.error("Database error in getPendingScheduledMessages:", error);
      throw error;
    }
  }

  async getChannelScheduledMessages(channelId: string, userId: string): Promise<Message[]> {
    try {
      const result = await db.select().from(schema.messages)
        .where(and(
          eq(schema.messages.channelId, channelId),
          eq(schema.messages.userId, userId),
          eq(schema.messages.scheduledStatus, 'pending')
        ))
        .orderBy(asc(schema.messages.scheduledAt));
      return result as Message[];
    } catch (error) {
      console.error("Database error in getChannelScheduledMessages:", error);
      throw error;
    }
  }

  async cancelScheduledMessage(messageId: string, userId: string): Promise<Message | undefined> {
    try {
      const result = await db.update(schema.messages)
        .set({ scheduledStatus: 'cancelled', updatedAt: new Date() })
        .where(and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.userId, userId),
          eq(schema.messages.scheduledStatus, 'pending')
        ))
        .returning();
      return result[0] as Message | undefined;
    } catch (error) {
      console.error("Database error in cancelScheduledMessage:", error);
      throw error;
    }
  }

  async updateScheduledMessage(messageId: string, userId: string, updates: { content?: string; scheduledAt?: Date }): Promise<Message | undefined> {
    try {
      const setValues: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.content !== undefined) setValues.content = updates.content;
      if (updates.scheduledAt !== undefined) setValues.scheduledAt = updates.scheduledAt;
      const result = await db.update(schema.messages)
        .set(setValues)
        .where(and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.userId, userId),
          eq(schema.messages.scheduledStatus, 'pending')
        ))
        .returning();
      return result[0] as Message | undefined;
    } catch (error) {
      console.error("Database error in updateScheduledMessage:", error);
      throw error;
    }
  }

  async markScheduledMessagesSent(messageIds: string[], sendTime?: Date): Promise<void> {
    if (messageIds.length === 0) return;
    const now = sendTime ?? new Date();
    try {
      await db.update(schema.messages)
        .set({ scheduledStatus: 'sent', scheduledAt: null, createdAt: now, updatedAt: now })
        .where(inArray(schema.messages.id, messageIds));
    } catch (error) {
      console.error("Database error in markScheduledMessagesSent:", error);
      throw error;
    }
  }

  async getMessageReactions(messageId: string): Promise<schema.MessageReaction[]> {
    try {
      const result = await db.select().from(schema.messageReactions)
        .where(eq(schema.messageReactions.messageId, messageId))
        .orderBy(asc(schema.messageReactions.createdAt));
      return result as schema.MessageReaction[];
    } catch (error) {
      console.error("Database error in getMessageReactions:", error);
      throw error;
    }
  }

  async getChannelReactions(channelId: string): Promise<Record<string, schema.MessageReaction[]>> {
    try {
      // Join reactions with messages to filter by channelId
      const result = await db.select({
        id: schema.messageReactions.id,
        messageId: schema.messageReactions.messageId,
        userId: schema.messageReactions.userId,
        emoji: schema.messageReactions.emoji,
        userFirstName: schema.messageReactions.userFirstName,
        userLastName: schema.messageReactions.userLastName,
        createdAt: schema.messageReactions.createdAt,
      }).from(schema.messageReactions)
        .innerJoin(schema.messages, eq(schema.messageReactions.messageId, schema.messages.id))
        .where(eq(schema.messages.channelId, channelId))
        .orderBy(asc(schema.messageReactions.createdAt));

      const grouped: Record<string, schema.MessageReaction[]> = {};
      for (const r of result) {
        if (!grouped[r.messageId]) grouped[r.messageId] = [];
        grouped[r.messageId].push(r as schema.MessageReaction);
      }
      return grouped;
    } catch (error) {
      console.error("Database error in getChannelReactions:", error);
      throw error;
    }
  }

  async toggleMessageReaction(
    messageId: string,
    userId: string,
    emoji: string,
    userFirstName: string | null,
    userLastName: string | null
  ): Promise<{ reactions: schema.MessageReaction[]; action: 'added' | 'removed'; channelId: string }> {
    try {
      // Get the message to retrieve channelId
      const message = await this.getMessage(messageId);
      if (!message) throw new Error("Message not found");

      // Check if reaction already exists
      const existing = await db.select().from(schema.messageReactions)
        .where(and(
          eq(schema.messageReactions.messageId, messageId),
          eq(schema.messageReactions.userId, userId),
          eq(schema.messageReactions.emoji, emoji)
        ))
        .limit(1);

      let action: 'added' | 'removed';
      if (existing.length > 0) {
        // Remove the reaction
        await db.delete(schema.messageReactions)
          .where(and(
            eq(schema.messageReactions.messageId, messageId),
            eq(schema.messageReactions.userId, userId),
            eq(schema.messageReactions.emoji, emoji)
          ));
        action = 'removed';
      } else {
        // Add the reaction
        await db.insert(schema.messageReactions).values({
          messageId,
          userId,
          emoji,
          userFirstName,
          userLastName,
        });
        action = 'added';
      }

      // Return the updated reactions for this message
      const reactions = await this.getMessageReactions(messageId);
      return { reactions, action, channelId: message.channelId };
    } catch (error) {
      console.error("Database error in toggleMessageReaction:", error);
      throw error;
    }
  }

  async createMessageAttachment(attachment: schema.InsertMessageAttachment): Promise<schema.MessageAttachment> {
    try {
      const result = await db.insert(schema.messageAttachments).values(attachment).returning();
      return result[0] as schema.MessageAttachment;
    } catch (error) {
      console.error("Database error in createMessageAttachment:", error);
      throw error;
    }
  }

  async getMessageAttachments(messageId: string): Promise<schema.MessageAttachment[]> {
    try {
      return await db.select().from(schema.messageAttachments)
        .where(eq(schema.messageAttachments.messageId, messageId))
        .orderBy(asc(schema.messageAttachments.createdAt)) as schema.MessageAttachment[];
    } catch (error) {
      console.error("Database error in getMessageAttachments:", error);
      throw error;
    }
  }

  async getAttachmentsForMessages(messageIds: string[]): Promise<Record<string, schema.MessageAttachment[]>> {
    if (messageIds.length === 0) return {};
    try {
      const rows = await db.select().from(schema.messageAttachments)
        .where(inArray(schema.messageAttachments.messageId, messageIds))
        .orderBy(asc(schema.messageAttachments.createdAt)) as schema.MessageAttachment[];
      const result: Record<string, schema.MessageAttachment[]> = {};
      for (const row of rows) {
        if (!result[row.messageId]) result[row.messageId] = [];
        result[row.messageId].push(row);
      }
      return result;
    } catch (error) {
      console.error("Database error in getAttachmentsForMessages:", error);
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

  async getPurchaseOrders(companyId: string, projectId?: string, status?: string, poType?: string, workerUserId?: string): Promise<PurchaseOrder[]> {
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
      // Non-admin workers: only see main POs or site POs they created
      if (workerUserId) {
        conditions.push(
          or(
            ne(schema.purchaseOrders.poType, 'site' as any),
            eq(schema.purchaseOrders.createdById, workerUserId)
          )!
        );
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
      if (poType === 'site') {
        // Site POs use SP-YYMM-SEQ with monthly reset
        const now = new Date();
        const yy = String(now.getFullYear()).slice(2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const prefix = `SP-${yy}${mm}`;

        const existing = await db
          .select({ poNumber: schema.purchaseOrders.poNumber })
          .from(schema.purchaseOrders)
          .where(and(
            eq(schema.purchaseOrders.companyId, companyId),
            eq(schema.purchaseOrders.poType, 'site'),
            sql`${schema.purchaseOrders.poNumber} LIKE ${prefix + '-%'}`
          ))
          .orderBy(desc(schema.purchaseOrders.poNumber))
          .limit(1);

        const lastSeq = existing[0]
          ? parseInt(existing[0].poNumber.split('-')[2] ?? '0', 10) || 0
          : 0;

        return `${prefix}-${String(lastSeq + 1).padStart(3, '0')}`;
      }

      // Standard POs: PO-YYYY-SEQ (annual reset)
      const year = new Date().getFullYear();
      const prefix = "PO";
      
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

  async getUnreadReminderNotificationCount(userId: string): Promise<number> {
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
      console.error("Database error in getUnreadReminderNotificationCount:", error);
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

  async markReminderNotificationAsRead(id: string, userId: string): Promise<schema.ReminderNotification | null> {
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
      console.error("Database error in markReminderNotificationAsRead:", error);
      throw error;
    }
  }

  async markAllReminderNotificationsAsRead(userId: string): Promise<number> {
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
      console.error("Database error in markAllReminderNotificationsAsRead:", error);
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
        { id: "6", type: "businessFinancials", title: "Financial Summary", size: "md", dimensions: { columns: 4 } },
        { id: "7", type: "businessTimesheets", title: "Timesheets", size: "md", dimensions: { columns: 4 } },
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
  async getNotifications(userId: string, companyId: string, options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Promise<InAppNotification[]> {
    try {
      let query: any = db.select()
        .from(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.companyId, companyId),
          ne(schema.notifications.type, "reminder_due"),
          ...(options?.unreadOnly ? [eq(schema.notifications.isRead, false)] : [])
        ))
        .orderBy(desc(schema.notifications.createdAt));

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.offset(options.offset);
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

      // Fire-and-forget device push delivery. Every server path that creates an
      // in-app notification flows through here, so this is the single hook that
      // turns a notification record into iPhone/Android banners. It must never
      // block or fail notification creation.
      void (async () => {
        try {
          const { sendPushForNotification } = await import("./utils/pushNotifications");
          await sendPushForNotification(created);
        } catch (err) {
          console.error("[Push] Failed to dispatch push for notification:", err);
        }
      })();

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
          eq(schema.notifications.isRead, false),
          ne(schema.notifications.type, "reminder_due")
        ));
      return Number(result?.count || 0);
    } catch (error) {
      console.error("Database error in getUnreadNotificationCount:", error);
      throw error;
    }
  }

  async ensureTenancyColumns(): Promise<void> {
    // Additive, idempotent safety net for the cross-tenant hardening work. The
    // deploy build does NOT run drizzle push, so this guarantees the new
    // columns exist in production the first time the server boots after this
    // ships. Every statement is ADD COLUMN IF NOT EXISTS / a guarded UPDATE,
    // all non-destructive and no-ops once applied.
    try {
      // companies: trial / plan / billing tracking columns.
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS trial_ends_at timestamp`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan_status varchar DEFAULT 'trial'`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS chosen_plan varchar DEFAULT 'builder'`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS plan varchar DEFAULT 'builder'`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS billing_cycle varchar DEFAULT 'monthly'`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_customer_id text`);
      await db.execute(sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS stripe_subscription_id text`);

      // user_roles: billing seat classification. A mobile-only team role does
      // not consume a paid Full User seat.
      await db.execute(sql`ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS is_mobile_only boolean NOT NULL DEFAULT false`);

      // checklist_templates: company scoping column.
      await db.execute(sql`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS company_id varchar`);

      // Backfill company_id from the creating user's company where missing.
      await db.execute(sql`
        UPDATE checklist_templates ct
        SET company_id = u.company_id
        FROM users u
        WHERE ct.company_id IS NULL
          AND ct.created_by = u.id
          AND u.company_id IS NOT NULL
      `);

      // Fallback: if any rows are still unscoped AND there is exactly one
      // company in the system, attribute them to that company. Otherwise leave
      // them NULL (and report) so a human can decide — never guess across
      // multiple tenants.
      const stillNull = await db.execute(sql`
        SELECT count(*)::int AS cnt FROM checklist_templates WHERE company_id IS NULL
      `);
      const nullCount = Number((stillNull.rows?.[0] as any)?.cnt ?? 0);
      if (nullCount > 0) {
        const companies = await db.execute(sql`SELECT id FROM companies LIMIT 2`);
        if ((companies.rows?.length ?? 0) === 1) {
          const onlyCompanyId = (companies.rows[0] as any).id;
          await db.execute(sql`
            UPDATE checklist_templates SET company_id = ${onlyCompanyId} WHERE company_id IS NULL
          `);
          console.log(`[tenancy] Backfilled ${nullCount} unscoped checklist_templates to the single existing company.`);
        } else {
          console.warn(`[tenancy] ${nullCount} checklist_templates still have NULL company_id and could not be auto-attributed (0 or multiple companies). Manual review required.`);
        }
      }
    } catch (error) {
      console.error("Failed to ensure tenancy columns:", error);
    }
  }

  async ensurePushTokensTable(): Promise<void> {
    // Additive, idempotent safety net. The deploy build does NOT run drizzle
    // push, so this guarantees the push_tokens table exists in production the
    // first time the server boots after this feature ships. CREATE ... IF NOT
    // EXISTS is non-destructive and a no-op once the table is present.
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS push_tokens (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token text NOT NULL,
          platform text NOT NULL DEFAULT 'ios',
          device_name text,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON push_tokens (user_id)`);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS push_tokens_token_unique ON push_tokens (token)`);
    } catch (error) {
      console.error("Failed to ensure push_tokens table exists:", error);
    }
  }

  async upsertPushToken(data: { userId: string; token: string; platform?: string; deviceName?: string }): Promise<PushToken> {
    try {
      const [row] = await db.insert(schema.pushTokens)
        .values({
          userId: data.userId,
          token: data.token,
          platform: data.platform || "ios",
          deviceName: data.deviceName,
        })
        .onConflictDoUpdate({
          target: schema.pushTokens.token,
          set: {
            userId: data.userId,
            platform: data.platform || "ios",
            deviceName: data.deviceName,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in upsertPushToken:", error);
      throw error;
    }
  }

  async getPushTokensForUser(userId: string): Promise<PushToken[]> {
    try {
      return await db.select()
        .from(schema.pushTokens)
        .where(eq(schema.pushTokens.userId, userId));
    } catch (error) {
      console.error("Database error in getPushTokensForUser:", error);
      throw error;
    }
  }

  async deletePushToken(token: string, userId?: string): Promise<boolean> {
    try {
      const where = userId
        ? and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, userId))
        : eq(schema.pushTokens.token, token);
      const result = await db.delete(schema.pushTokens).where(where);
      return ((result as any).rowCount || 0) > 0;
    } catch (error) {
      console.error("Database error in deletePushToken:", error);
      throw error;
    }
  }

  async deletePushTokens(tokens: string[]): Promise<number> {
    try {
      if (!tokens.length) return 0;
      const result = await db.delete(schema.pushTokens)
        .where(inArray(schema.pushTokens.token, tokens));
      return (result as any).rowCount || 0;
    } catch (error) {
      console.error("Database error in deletePushTokens:", error);
      throw error;
    }
  }

  async ensureSuggestionsTable(): Promise<void> {
    // Additive, idempotent safety net. The deploy build does NOT run drizzle
    // push, so this guarantees the suggestions table + the users.is_platform_staff
    // column exist in production the first time the server boots after this
    // feature ships. CREATE/ALTER ... IF NOT EXISTS is non-destructive.
    try {
      await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_staff boolean NOT NULL DEFAULT false`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS suggestions (
          id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          section text NOT NULL,
          message text NOT NULL,
          user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          company_id varchar REFERENCES companies(id) ON DELETE SET NULL,
          role_name text,
          source_page text,
          platform text NOT NULL DEFAULT 'web',
          app_version text,
          status text NOT NULL DEFAULT 'new',
          priority text,
          internal_note text,
          created_at timestamp NOT NULL DEFAULT now(),
          updated_at timestamp NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS suggestions_status_idx ON suggestions (status)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS suggestions_section_idx ON suggestions (section)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS suggestions_company_idx ON suggestions (company_id)`);
    } catch (error) {
      console.error("Failed to ensure suggestions table exists:", error);
    }
  }

  async createSuggestion(data: InsertSuggestion & { userId: string; companyId: string | null; roleName: string | null }): Promise<Suggestion> {
    try {
      const [row] = await db.insert(schema.suggestions)
        .values({
          section: data.section,
          message: data.message,
          userId: data.userId,
          companyId: data.companyId,
          roleName: data.roleName,
          sourcePage: data.sourcePage,
          platform: data.platform || "web",
          appVersion: data.appVersion,
        })
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in createSuggestion:", error);
      throw error;
    }
  }

  async getSuggestions(filters?: { section?: string; status?: string }): Promise<SuggestionWithMeta[]> {
    try {
      const conditions = [];
      if (filters?.section) conditions.push(eq(schema.suggestions.section, filters.section));
      if (filters?.status) conditions.push(eq(schema.suggestions.status, filters.status));

      const rows = await db.select({
        suggestion: schema.suggestions,
        userFirst: schema.users.firstName,
        userLast: schema.users.lastName,
        userEmail: schema.users.email,
        companyName: schema.companies.name,
      })
        .from(schema.suggestions)
        .leftJoin(schema.users, eq(schema.suggestions.userId, schema.users.id))
        .leftJoin(schema.companies, eq(schema.suggestions.companyId, schema.companies.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.suggestions.createdAt));

      return rows.map((r) => ({
        ...r.suggestion,
        userName: [r.userFirst, r.userLast].filter(Boolean).join(" ") || null,
        userEmail: r.userEmail ?? null,
        companyName: r.companyName ?? null,
      }));
    } catch (error) {
      console.error("Database error in getSuggestions:", error);
      throw error;
    }
  }

  async updateSuggestion(id: string, updates: { status?: string; priority?: string | null; internalNote?: string | null }): Promise<Suggestion | undefined> {
    try {
      const set: Record<string, any> = { updatedAt: new Date() };
      if (updates.status !== undefined) set.status = updates.status;
      if (updates.priority !== undefined) set.priority = updates.priority;
      if (updates.internalNote !== undefined) set.internalNote = updates.internalNote;

      const [row] = await db.update(schema.suggestions)
        .set(set)
        .where(eq(schema.suggestions.id, id))
        .returning();
      return row;
    } catch (error) {
      console.error("Database error in updateSuggestion:", error);
      throw error;
    }
  }

  async getXeroConnectionByCompanyId(companyId: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    try {
      const [connection] = await db.select()
        .from(schema.xeroConnections)
        .where(and(
          eq(schema.xeroConnections.companyId, companyId),
          eq(schema.xeroConnections.isActive, true)
        ))
        .limit(1);
      return connection;
    } catch (error) {
      console.error("Database error in getXeroConnectionByCompanyId:", error);
      throw error;
    }
  }

  async getXeroConnectionByTenantId(tenantId: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    try {
      const [connection] = await db.select()
        .from(schema.xeroConnections)
        .where(and(
          eq(schema.xeroConnections.tenantId, tenantId),
          eq(schema.xeroConnections.isActive, true)
        ))
        .limit(1);
      return connection;
    } catch (error) {
      console.error("Database error in getXeroConnectionByTenantId:", error);
      throw error;
    }
  }

  async getXeroConnection(id: string): Promise<import("@shared/schema").XeroConnection | undefined> {
    try {
      const [connection] = await db.select()
        .from(schema.xeroConnections)
        .where(eq(schema.xeroConnections.id, id))
        .limit(1);
      return connection;
    } catch (error) {
      console.error("Database error in getXeroConnection:", error);
      throw error;
    }
  }

  async createXeroConnection(data: import("@shared/schema").InsertXeroConnection): Promise<import("@shared/schema").XeroConnection> {
    try {
      const [connection] = await db.insert(schema.xeroConnections)
        .values(data)
        .returning();
      return connection;
    } catch (error) {
      console.error("Database error in createXeroConnection:", error);
      throw error;
    }
  }

  async updateXeroConnection(id: string, data: Partial<import("@shared/schema").XeroConnection>): Promise<import("@shared/schema").XeroConnection | undefined> {
    try {
      const [connection] = await db.update(schema.xeroConnections)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.xeroConnections.id, id))
        .returning();
      return connection;
    } catch (error) {
      console.error("Database error in updateXeroConnection:", error);
      throw error;
    }
  }

  async deleteXeroConnection(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.xeroConnections)
        .where(eq(schema.xeroConnections.id, id));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Database error in deleteXeroConnection:", error);
      throw error;
    }
  }

  // ============================================================
  // TEAMS (T006)
  // ============================================================

  async getTeams(companyId: string): Promise<schema.Team[]> {
    try {
      return await db.select().from(schema.teams)
        .where(eq(schema.teams.companyId, companyId))
        .orderBy(schema.teams.name);
    } catch (error) {
      console.error("Database error in getTeams:", error);
      throw error;
    }
  }

  async getTeam(id: string): Promise<schema.Team | undefined> {
    try {
      const [team] = await db.select().from(schema.teams).where(eq(schema.teams.id, id));
      return team;
    } catch (error) {
      console.error("Database error in getTeam:", error);
      throw error;
    }
  }

  async createTeam(data: schema.InsertTeam): Promise<schema.Team> {
    try {
      const [team] = await db.insert(schema.teams).values(data).returning();
      return team;
    } catch (error) {
      console.error("Database error in createTeam:", error);
      throw error;
    }
  }

  async updateTeam(id: string, data: Partial<schema.InsertTeam>): Promise<schema.Team | undefined> {
    try {
      const [team] = await db.update(schema.teams).set(data).where(eq(schema.teams.id, id)).returning();
      return team;
    } catch (error) {
      console.error("Database error in updateTeam:", error);
      throw error;
    }
  }

  async deleteTeam(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.teams).where(eq(schema.teams.id, id));
      return (result as any).rowCount > 0;
    } catch (error) {
      console.error("Database error in deleteTeam:", error);
      throw error;
    }
  }

  // ============================================================
  // DOCS
  // ============================================================

  async getDocs(companyId: string, folderId?: string | null): Promise<schema.Doc[]> {
    try {
      const conditions = [eq(schema.docs.companyId, companyId)];
      if (folderId !== undefined) {
        conditions.push(folderId === null ? isNull(schema.docs.folderId) : eq(schema.docs.folderId, folderId));
      }
      return await db.select().from(schema.docs).where(and(...conditions)).orderBy(asc(schema.docs.updatedAt));
    } catch (error) {
      console.error("Database error in getDocs:", error);
      throw error;
    }
  }

  async getDoc(id: string): Promise<schema.Doc | undefined> {
    try {
      const [doc] = await db.select().from(schema.docs).where(eq(schema.docs.id, id));
      return doc;
    } catch (error) {
      console.error("Database error in getDoc:", error);
      throw error;
    }
  }

  async createDoc(data: schema.InsertDoc): Promise<schema.Doc> {
    try {
      const [doc] = await db.insert(schema.docs).values(data).returning();
      return doc;
    } catch (error) {
      console.error("Database error in createDoc:", error);
      throw error;
    }
  }

  async updateDoc(id: string, data: Partial<schema.InsertDoc>): Promise<schema.Doc | undefined> {
    try {
      const [doc] = await db.update(schema.docs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(schema.docs.id, id))
        .returning();
      return doc;
    } catch (error) {
      console.error("Database error in updateDoc:", error);
      throw error;
    }
  }

  async deleteDoc(id: string): Promise<void> {
    try {
      await db.delete(schema.docs).where(eq(schema.docs.id, id));
    } catch (error) {
      console.error("Database error in deleteDoc:", error);
      throw error;
    }
  }

  async getDocFolders(companyId: string): Promise<schema.DocFolder[]> {
    try {
      return await db.select().from(schema.docFolders)
        .where(eq(schema.docFolders.companyId, companyId))
        .orderBy(asc(schema.docFolders.sortOrder), asc(schema.docFolders.name));
    } catch (error) {
      console.error("Database error in getDocFolders:", error);
      throw error;
    }
  }

  async createDocFolder(data: schema.InsertDocFolder): Promise<schema.DocFolder> {
    try {
      const [folder] = await db.insert(schema.docFolders).values(data).returning();
      return folder;
    } catch (error) {
      console.error("Database error in createDocFolder:", error);
      throw error;
    }
  }

  async updateDocFolder(id: string, data: Partial<schema.InsertDocFolder>): Promise<schema.DocFolder | undefined> {
    try {
      const [folder] = await db.update(schema.docFolders).set(data).where(eq(schema.docFolders.id, id)).returning();
      return folder;
    } catch (error) {
      console.error("Database error in updateDocFolder:", error);
      throw error;
    }
  }

  async deleteDocFolder(id: string): Promise<void> {
    try {
      await db.delete(schema.docFolders).where(eq(schema.docFolders.id, id));
    } catch (error) {
      console.error("Database error in deleteDocFolder:", error);
      throw error;
    }
  }

  // ===== TAKEOFF =====

  async getTakeoffPlans(projectId: string, companyId: string): Promise<schema.TakeoffPlan[]> {
    return await db.select().from(schema.takeoffPlans)
      .where(and(eq(schema.takeoffPlans.projectId, projectId), eq(schema.takeoffPlans.companyId, companyId)))
      .orderBy(asc(schema.takeoffPlans.order), asc(schema.takeoffPlans.createdAt));
  }

  async getTakeoffPlan(id: string, companyId: string): Promise<schema.TakeoffPlan | undefined> {
    const [row] = await db.select().from(schema.takeoffPlans)
      .where(and(eq(schema.takeoffPlans.id, id), eq(schema.takeoffPlans.companyId, companyId)))
      .limit(1);
    return row;
  }

  async createTakeoffPlan(data: schema.InsertTakeoffPlan): Promise<schema.TakeoffPlan> {
    const [row] = await db.insert(schema.takeoffPlans).values(data).returning();
    const pageCount = Math.max(1, row.pageCount ?? 1);
    const pageRows = Array.from({ length: pageCount }, (_, i) => ({
      planId: row.id,
      companyId: row.companyId,
      pageNumber: i + 1,
    }));
    await db.insert(schema.takeoffPlanPages)
      .values(pageRows)
      .onConflictDoNothing({
        target: [schema.takeoffPlanPages.planId, schema.takeoffPlanPages.pageNumber],
      });
    return row;
  }

  async updateTakeoffPlan(id: string, companyId: string, data: Partial<schema.InsertTakeoffPlan>): Promise<schema.TakeoffPlan | undefined> {
    const [row] = await db.update(schema.takeoffPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.takeoffPlans.id, id), eq(schema.takeoffPlans.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteTakeoffPlan(id: string, companyId: string): Promise<void> {
    await db.delete(schema.takeoffPlans)
      .where(and(eq(schema.takeoffPlans.id, id), eq(schema.takeoffPlans.companyId, companyId)));
  }

  async getTakeoffPlanPages(planId: string): Promise<schema.TakeoffPlanPage[]> {
    return await db.select().from(schema.takeoffPlanPages)
      .where(eq(schema.takeoffPlanPages.planId, planId))
      .orderBy(asc(schema.takeoffPlanPages.pageNumber));
  }

  async getTakeoffPlanPage(planId: string, pageNumber: number): Promise<schema.TakeoffPlanPage | undefined> {
    const [row] = await db.select().from(schema.takeoffPlanPages)
      .where(and(eq(schema.takeoffPlanPages.planId, planId), eq(schema.takeoffPlanPages.pageNumber, pageNumber)))
      .limit(1);
    return row;
  }

  async upsertTakeoffPlanPage(data: schema.InsertTakeoffPlanPage): Promise<schema.TakeoffPlanPage> {
    const { planId, companyId, pageNumber, ...rest } = data as any;
    const [row] = await db.insert(schema.takeoffPlanPages)
      .values(data)
      .onConflictDoUpdate({
        target: [schema.takeoffPlanPages.planId, schema.takeoffPlanPages.pageNumber],
        set: { ...rest, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async getTakeoffPlanPageById(id: string): Promise<schema.TakeoffPlanPage | undefined> {
    const [row] = await db.select().from(schema.takeoffPlanPages)
      .where(eq(schema.takeoffPlanPages.id, id))
      .limit(1);
    return row;
  }

  async getTakeoffMeasurement(id: string, companyId: string): Promise<schema.TakeoffMeasurement | undefined> {
    const [row] = await db.select().from(schema.takeoffMeasurements)
      .where(and(eq(schema.takeoffMeasurements.id, id), eq(schema.takeoffMeasurements.companyId, companyId)))
      .limit(1);
    return row;
  }

  async getTakeoffCategory(id: string, companyId: string): Promise<schema.TakeoffCategory | undefined> {
    const [row] = await db.select().from(schema.takeoffCategories)
      .where(and(eq(schema.takeoffCategories.id, id), eq(schema.takeoffCategories.companyId, companyId)))
      .limit(1);
    return row;
  }

  async getTakeoffCategories(projectId: string, companyId: string): Promise<schema.TakeoffCategory[]> {
    return await db.select().from(schema.takeoffCategories)
      .where(and(eq(schema.takeoffCategories.projectId, projectId), eq(schema.takeoffCategories.companyId, companyId)))
      .orderBy(asc(schema.takeoffCategories.order), asc(schema.takeoffCategories.createdAt));
  }

  async createTakeoffCategory(data: schema.InsertTakeoffCategory): Promise<schema.TakeoffCategory> {
    const [row] = await db.insert(schema.takeoffCategories).values(data).returning();
    return row;
  }

  async updateTakeoffCategory(id: string, companyId: string, data: Partial<schema.InsertTakeoffCategory>): Promise<schema.TakeoffCategory | undefined> {
    const [row] = await db.update(schema.takeoffCategories)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.takeoffCategories.id, id), eq(schema.takeoffCategories.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteTakeoffCategory(id: string, companyId: string): Promise<void> {
    await db.delete(schema.takeoffCategories)
      .where(and(eq(schema.takeoffCategories.id, id), eq(schema.takeoffCategories.companyId, companyId)));
  }

  async getTakeoffMeasurements(projectId: string, companyId: string): Promise<schema.TakeoffMeasurement[]> {
    return await db.select().from(schema.takeoffMeasurements)
      .where(and(eq(schema.takeoffMeasurements.projectId, projectId), eq(schema.takeoffMeasurements.companyId, companyId)))
      .orderBy(asc(schema.takeoffMeasurements.order), asc(schema.takeoffMeasurements.createdAt));
  }

  async getTakeoffMeasurementsByPage(pageId: string): Promise<schema.TakeoffMeasurement[]> {
    return await db.select().from(schema.takeoffMeasurements)
      .where(eq(schema.takeoffMeasurements.pageId, pageId))
      .orderBy(asc(schema.takeoffMeasurements.order), asc(schema.takeoffMeasurements.createdAt));
  }

  async createTakeoffMeasurement(data: schema.InsertTakeoffMeasurement): Promise<schema.TakeoffMeasurement> {
    const [row] = await db.insert(schema.takeoffMeasurements).values(data).returning();
    return row;
  }

  async updateTakeoffMeasurement(id: string, companyId: string, data: Partial<schema.InsertTakeoffMeasurement>): Promise<schema.TakeoffMeasurement | undefined> {
    const [row] = await db.update(schema.takeoffMeasurements)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.takeoffMeasurements.id, id), eq(schema.takeoffMeasurements.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteTakeoffMeasurement(id: string, companyId: string): Promise<void> {
    await db.delete(schema.takeoffMeasurements)
      .where(and(eq(schema.takeoffMeasurements.id, id), eq(schema.takeoffMeasurements.companyId, companyId)));
  }

  async getTakeoffMarkups(planId: string, pageNumber: number | null, companyId: string): Promise<schema.TakeoffMarkup[]> {
    const conds = [
      eq(schema.takeoffMarkups.planId, planId),
      eq(schema.takeoffMarkups.companyId, companyId),
    ];
    if (pageNumber !== null) {
      conds.push(eq(schema.takeoffMarkups.pageNumber, pageNumber));
    }
    return await db.select().from(schema.takeoffMarkups)
      .where(and(...conds))
      .orderBy(asc(schema.takeoffMarkups.createdAt));
  }

  async getTakeoffMarkup(id: string, companyId: string): Promise<schema.TakeoffMarkup | undefined> {
    const [row] = await db.select().from(schema.takeoffMarkups)
      .where(and(eq(schema.takeoffMarkups.id, id), eq(schema.takeoffMarkups.companyId, companyId)));
    return row;
  }

  async createTakeoffMarkup(data: schema.InsertTakeoffMarkup): Promise<schema.TakeoffMarkup> {
    const [row] = await db.insert(schema.takeoffMarkups).values(data).returning();
    return row;
  }

  async updateTakeoffMarkup(id: string, companyId: string, data: Partial<schema.InsertTakeoffMarkup>): Promise<schema.TakeoffMarkup | undefined> {
    const [row] = await db.update(schema.takeoffMarkups)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(schema.takeoffMarkups.id, id), eq(schema.takeoffMarkups.companyId, companyId)))
      .returning();
    return row;
  }

  async deleteTakeoffMarkup(id: string, companyId: string): Promise<void> {
    await db.delete(schema.takeoffMarkups)
      .where(and(eq(schema.takeoffMarkups.id, id), eq(schema.takeoffMarkups.companyId, companyId)));
  }
}

// Create and initialize storage
const dbStorage = new DbStorage();

// Initialize storage and export
export const storage = dbStorage;

// Initialize storage on startup
dbStorage.initialize().catch(console.error);
