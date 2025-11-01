import { 
  type User, type InsertUser, 
  type Note, type InsertNote,
  type Task, type InsertTask,
  type CustomFieldDef, type InsertCustomFieldDef,
  type CustomFieldOption, type InsertCustomFieldOption,
  type NoteTemplate, type InsertNoteTemplate,
  type Client, type InsertClient,
  type Project, type InsertProject,
  type TaskView, type InsertTaskView,
  type Estimate, type InsertEstimate,
  type EstimateItem, type InsertEstimateItem,
  type EstimateGroup, type InsertEstimateGroup,
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
  type Budget, type InsertBudget,
  type BudgetLineItem, type InsertBudgetLineItem,
  type LabourHoursBudget, type InsertLabourHoursBudget,
  type Schedule, type InsertSchedule,
  type ScheduleItem, type InsertScheduleItem,
  type ScheduleTemplate, type InsertScheduleTemplate,
  type CalendarView, type InsertCalendarView,
  type Proposal, type InsertProposal,
  type ProposalSection, type InsertProposalSection,
  type ProposalItem, type InsertProposalItem,
  type ProposalAcceptance, type InsertProposalAcceptance,
  type Minute, type InsertMinute,
  type SystemFolder, type InsertSystemFolder,
  type SystemDocument, type InsertSystemDocument,
  type TaskTemplate, type InsertTaskTemplate,
  type WorkflowTemplate, type InsertWorkflowTemplate,
  type ProjectWorkflow, type InsertProjectWorkflow,
  type Channel, type InsertChannel,
  type ChannelMember, type InsertChannelMember,
  type Message, type InsertMessage
} from "@shared/schema";
import { randomUUID } from "crypto";
import { PasswordUtils } from "./utils/auth";
import { db } from "./db";
import { eq, or, and, desc, asc, gte, lte, sql, inArray, isNull } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Timesheet, InsertTimesheet, TimesheetCostCode, InsertTimesheetCostCode } from "@shared/schema";
import type { Defect, InsertDefect } from "@shared/schema";
import type { UserColumnPreferences, InsertUserColumnPreferences } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  validateUserCredentials(username: string, plainPassword: string): Promise<User | undefined>;
  getUserWithRole(id: string): Promise<UserWithRole | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: import("@shared/schema").UpsertUser): Promise<User>; // Required for Replit Auth
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  changeUserPassword(id: string, newPassword: string): Promise<User | undefined>;
  getUsers(category?: UserCategory): Promise<UserWithRole[]>;

  // User column preferences
  getUserColumnPreferences(userId: string, pageKey: string): Promise<UserColumnPreferences | undefined>;
  saveUserColumnPreferences(preferences: InsertUserColumnPreferences): Promise<UserColumnPreferences>;

  // User Role operations  
  getUserRoles(category?: UserCategory, companyId?: string): Promise<UserRole[]>;
  getUserRole(id: string, companyId?: string): Promise<UserRole | undefined>;
  createUserRole(role: InsertUserRole): Promise<UserRole>;
  updateUserRole(id: string, role: Partial<InsertUserRole>, companyId?: string): Promise<UserRole | undefined>;
  deleteUserRole(id: string, companyId?: string): Promise<boolean>;
  updateUserRolesOrder(updates: Array<{id: string, displayOrder: number}>, companyId?: string): Promise<void>;

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
  setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[] }[]): Promise<void>;

  // User Project Access operations
  getUserProjectAccess(userId: string): Promise<UserProjectAccess[]>;
  createUserProjectAccess(access: InsertUserProjectAccess): Promise<UserProjectAccess>;
  updateUserProjectAccess(id: string, access: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined>;
  deleteUserProjectAccess(id: string): Promise<boolean>;
  grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess>;

  // User Invitation operations
  getUserInvitations(status?: string): Promise<UserInvitation[]>;
  getUserInvitation(id: string): Promise<UserInvitation | undefined>;
  getUserInvitationByToken(token: string): Promise<UserInvitation | undefined>;
  createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation>;
  updateUserInvitation(id: string, invitation: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined>;
  deleteUserInvitation(id: string): Promise<boolean>;
  acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined>;
  
  // Notes CRUD operations
  getNotes(projectId?: string, companyId?: string): Promise<Note[]>;
  getNote(id: string, companyId?: string): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, note: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: string): Promise<boolean>;

  // Tasks CRUD operations (specific to type="task")
  getTasks(projectId?: string, status?: string, businessTasks?: boolean): Promise<Task[]>;
  getTasksByUser(userId: string, companyId: string): Promise<Task[]>;
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
  getNoteTemplates(ownerId?: string): Promise<NoteTemplate[]>;
  getNoteTemplate(id: string): Promise<NoteTemplate | undefined>;
  createNoteTemplate(template: InsertNoteTemplate): Promise<NoteTemplate>;
  updateNoteTemplate(id: string, template: Partial<InsertNoteTemplate>): Promise<NoteTemplate | undefined>;
  deleteNoteTemplate(id: string): Promise<boolean>;

  // Clients CRUD
  getClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Projects CRUD
  getProjects(ownerId?: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<boolean>;

  // Task Views CRUD
  getTaskViews(ownerId?: string): Promise<TaskView[]>;
  getTaskView(id: string): Promise<TaskView | undefined>;
  createTaskView(view: InsertTaskView): Promise<TaskView>;
  updateTaskView(id: string, view: Partial<InsertTaskView>): Promise<TaskView | undefined>;
  deleteTaskView(id: string): Promise<boolean>;

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

  // Estimate Groups CRUD
  getEstimateGroups(estimateId: string): Promise<EstimateGroup[]>;
  getEstimateGroup(id: string): Promise<EstimateGroup | undefined>;
  createEstimateGroup(group: InsertEstimateGroup): Promise<EstimateGroup>;
  updateEstimateGroup(id: string, group: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined>;
  deleteEstimateGroup(id: string): Promise<boolean>;
  duplicateEstimateGroup(id: string): Promise<EstimateGroup>;
  copyGroupToEstimate(groupId: string, targetEstimateId: string): Promise<EstimateGroup>;
  
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

  // Cost Codes CRUD (company-specific)
  getCostCodes(companyId: string): Promise<CostCode[]>;
  getCostCode(id: string, companyId: string): Promise<CostCode | undefined>;
  createCostCode(costCode: InsertCostCode): Promise<CostCode>;
  updateCostCode(id: string, costCode: Partial<InsertCostCode>, companyId: string): Promise<CostCode | undefined>;
  deleteCostCode(id: string, companyId: string): Promise<boolean>;
  archiveCostCode(id: string, companyId: string): Promise<CostCode | undefined>;
  mergeCostCodes(sourceId: string, targetId: string, companyId: string): Promise<boolean>;

  // Versioning and Locking
  createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate>;
  lockEstimate(estimateId: string): Promise<Estimate | undefined>;
  unlockEstimate(estimateId: string): Promise<Estimate | undefined>;
  
  // Summary calculations
  getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    markupAmount: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }>;

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
  getSuppliers(projectId?: string): Promise<Supplier[]>;
  getSupplierById(id: string): Promise<Supplier | null>;
  createSupplier(supplier: InsertSupplier): Promise<Supplier>;
  updateSupplier(id: string, supplier: Partial<InsertSupplier>): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  // Contacts CRUD
  getContacts(contactType?: "team" | "supplier" | "client"): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined>;
  archiveContact(id: string): Promise<Contact | undefined>;
  restoreContact(id: string): Promise<Contact | undefined>;

  // Bills CRUD
  getBills(projectId?: string, status?: string): Promise<Bill[]>;
  getBillById(id: string): Promise<Bill | null>;
  createBill(bill: InsertBill): Promise<Bill>;
  updateBill(id: string, bill: Partial<InsertBill>): Promise<Bill>;
  deleteBill(id: string): Promise<void>;
  
  // Bill Line Items CRUD
  getBillLineItems(billId: string): Promise<BillLineItem[]>;
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
  getActivities(projectId: string, limit?: number): Promise<schema.Activity[]>;
  createActivity(activity: schema.InsertActivity): Promise<schema.Activity>;

  // Site Diary Templates CRUD (company-wide)
  getSiteDiaryTemplates(): Promise<schema.SiteDiaryTemplate[]>;
  getSiteDiaryTemplate(id: string): Promise<schema.SiteDiaryTemplate | undefined>;
  createSiteDiaryTemplate(template: schema.InsertSiteDiaryTemplate): Promise<schema.SiteDiaryTemplate>;
  updateSiteDiaryTemplate(id: string, template: Partial<schema.InsertSiteDiaryTemplate>): Promise<schema.SiteDiaryTemplate | undefined>;
  deleteSiteDiaryTemplate(id: string): Promise<boolean>;

  // Site Diary Entries CRUD (project-specific)
  getSiteDiaryEntries(projectId: string): Promise<schema.SiteDiaryEntry[]>;
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
  submitTimesheet(id: string): Promise<Timesheet | undefined>; // Changes status from draft to submitted
  approveTimesheet(id: string): Promise<Timesheet | undefined>; // Changes status from submitted to approved
  rejectTimesheet(id: string): Promise<Timesheet | undefined>; // Changes status from submitted to rejected

  // Timesheet Cost Codes (for split timesheets)
  getTimesheetCostCodes(timesheetId: string): Promise<TimesheetCostCode[]>;
  createTimesheetCostCode(costCode: InsertTimesheetCostCode): Promise<TimesheetCostCode>;
  updateTimesheetCostCode(id: string, costCode: Partial<InsertTimesheetCostCode>): Promise<TimesheetCostCode | undefined>;
  deleteTimesheetCostCode(id: string): Promise<boolean>;

  // Schedule CRUD
  getSchedule(projectId: string): Promise<Schedule | undefined>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  updateSchedule(id: string, schedule: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;
  updateScheduleStatus(id: string, status: "offline" | "online" | "locked", userId?: string): Promise<Schedule | undefined>;

  // Schedule Items CRUD
  getScheduleItems(scheduleId: string): Promise<ScheduleItem[]>;
  getAllScheduleItems(companyId: string): Promise<ScheduleItem[]>;
  getScheduleItem(id: string): Promise<ScheduleItem | undefined>;
  createScheduleItem(item: InsertScheduleItem): Promise<ScheduleItem>;
  updateScheduleItem(id: string, item: Partial<InsertScheduleItem>): Promise<ScheduleItem | undefined>;
  deleteScheduleItem(id: string): Promise<boolean>;
  bulkUpdateScheduleItems(items: { id: string; updates: Partial<InsertScheduleItem> }[]): Promise<ScheduleItem[]>;

  // Schedule Templates CRUD
  getScheduleTemplates(category?: string): Promise<ScheduleTemplate[]>;
  getScheduleTemplate(id: string): Promise<ScheduleTemplate | undefined>;
  createScheduleTemplate(template: InsertScheduleTemplate): Promise<ScheduleTemplate>;
  updateScheduleTemplate(id: string, template: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined>;
  deleteScheduleTemplate(id: string): Promise<boolean>;

  // Calendar Views CRUD
  getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]>;
  getCalendarView(id: string, companyId: string): Promise<CalendarView | undefined>;
  createCalendarView(view: InsertCalendarView): Promise<CalendarView>;
  updateCalendarView(id: string, view: Partial<InsertCalendarView>, companyId: string): Promise<CalendarView | undefined>;
  deleteCalendarView(id: string, companyId: string): Promise<boolean>;

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
  getChannels(companyId: string, userId?: string): Promise<Channel[]>;
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

  // Messaging - Messages
  getMessages(channelId: string, limit?: number, before?: string): Promise<Message[]>;
  getMessage(id: string): Promise<Message | undefined>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, message: Partial<InsertMessage>): Promise<Message | undefined>;
  deleteMessage(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userRoles: Map<string, UserRole>;
  private permissions: Map<string, Permission>;
  private rolePermissions: Map<string, RolePermission>;
  private userProjectAccess: Map<string, UserProjectAccess>;
  private userInvitations: Map<string, UserInvitation>;
  private userColumnPreferences: Map<string, UserColumnPreferences>;
  private notes: Map<string, Note>;
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

  constructor() {
    this.users = new Map();
    this.userRoles = new Map();
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.userProjectAccess = new Map();
    this.userInvitations = new Map();
    this.userColumnPreferences = new Map();
    this.notes = new Map();
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
      { key: "files.view", name: "Files", description: "View files", category: "files", actions: ["view"], isBuiltIn: true },
      
      // Admin category
      { key: "admin.users", name: "User (team)", description: "Manage team users", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.suppliers", name: "Sub/Vendor", description: "Manage suppliers/vendors", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.roles", name: "Role", description: "Manage user roles", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.cost_codes", name: "Cost code/category", description: "Manage cost codes", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.terms", name: "Terms and Conditions", description: "Manage terms", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.payment_templates", name: "Payment schedule templates", description: "Manage payment templates", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      { key: "admin.company", name: "Company settings", description: "Manage company settings", category: "admin", actions: ["view", "add", "edit", "delete"], isBuiltIn: true },
      
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

    // Initialize built-in user roles
    const builtInRoles: Array<Omit<UserRole, 'id' | 'createdAt' | 'updatedAt'>> = [
      // Team roles
      { name: "General admin", description: "Full system administration access", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Project manager", description: "Manage projects and teams", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Field worker", description: "Site-based team member", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Office manager", description: "Office operations management", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Sales manager", description: "Sales and client management", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Bookkeeper", description: "Financial operations", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Architect", description: "Design and technical oversight", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Engineer", description: "Engineering and technical work", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Purchasing coordinator", description: "Materials and purchasing", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Apprentice", description: "Learning team member", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Carpenter", description: "Carpentry specialist", userCategory: "team", isBuiltIn: true, isActive: true },
      { name: "Designer", description: "Design specialist", userCategory: "team", isBuiltIn: true, isActive: true },
      
      // Supplier roles
      { name: "Sub/Vendor", description: "Subcontractor or vendor access", userCategory: "supplier", isBuiltIn: true, isActive: true },
      
      // Client roles
      { name: "Client", description: "Project client access", userCategory: "client", isBuiltIn: true, isActive: true },
    ];

    const now = new Date();
    builtInRoles.forEach(roleData => {
      const role: UserRole = {
        ...roleData,
        id: `role-${roleData.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        createdAt: now,
        updatedAt: now,
      };
      this.userRoles.set(role.id, role);
    });

    // Set default permissions for General admin (full access to everything)
    const adminRole = Array.from(this.userRoles.values()).find(r => r.name === "General admin");
    if (adminRole) {
      Array.from(this.permissions.values()).forEach(permission => {
        const rolePermission: RolePermission = {
          id: randomUUID(),
          roleId: adminRole.id,
          permissionId: permission.id,
          allowedActions: permission.actions as PermissionAction[],
          createdAt: now,
        };
        this.rolePermissions.set(rolePermission.id, rolePermission);
      });
    }
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

  async setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[] }[]): Promise<void> {
    // Remove existing role permissions
    const existingRolePermissions = Array.from(this.rolePermissions.values())
      .filter(rp => rp.roleId === roleId);
    
    for (const rp of existingRolePermissions) {
      this.rolePermissions.delete(rp.id);
    }

    // Add new role permissions
    for (const perm of permissions) {
      const rolePermission: RolePermission = {
        id: randomUUID(),
        roleId,
        permissionId: perm.permissionId,
        allowedActions: perm.allowedActions,
        createdAt: new Date(),
      };
      this.rolePermissions.set(rolePermission.id, rolePermission);
    }
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

    // Create the user account with secure password handling
    const newUser = await this.createUser({
      username: userData.username || invitation.email,
      password: userData.password, // Will be hashed in createUser method
      email: invitation.email,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      phone: invitation.phone,
      company: invitation.company,
      userCategory: invitation.userCategory as UserCategory,
      roleId: invitation.roleId,
      isInvitePending: false,
      invitedBy: invitation.invitedBy,
      invitedAt: invitation.createdAt,
      ...userData,
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

  // Notes CRUD operations
  async getNotes(projectId?: string, companyId?: string): Promise<Note[]> {
    const allNotes = Array.from(this.notes.values());
    
    // Filter by company if specified
    let filtered = allNotes;
    if (companyId) {
      filtered = allNotes.filter(note => {
        if (!note.projectId) return false;
        const project = this.projects.get(note.projectId);
        return project?.companyId === companyId;
      });
    }
    
    // Further filter by specific project if specified
    if (projectId) {
      filtered = filtered.filter(note => note.projectId === projectId);
    }
    
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

  async createNote(insertNote: InsertNote): Promise<Note> {
    const id = randomUUID();
    const now = new Date();
    const note: Note = { 
      ...insertNote,
      id, 
      category: insertNote.category || "General",
      priority: insertNote.priority || "medium",
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
  async getNoteTemplates(ownerId?: string): Promise<NoteTemplate[]> {
    const allTemplates = Array.from(this.noteTemplates.values());
    if (ownerId) {
      return allTemplates.filter(template => 
        template.ownerId === ownerId || template.isPublic
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return allTemplates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNoteTemplate(id: string): Promise<NoteTemplate | undefined> {
    return this.noteTemplates.get(id);
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
      defaultCustomFields: insertTemplate.defaultCustomFields ?? {},
      createdAt: now,
      updatedAt: now,
    };
    this.noteTemplates.set(id, template);
    return template;
  }

  async updateNoteTemplate(id: string, updateData: Partial<InsertNoteTemplate>): Promise<NoteTemplate | undefined> {
    const existingTemplate = this.noteTemplates.get(id);
    if (!existingTemplate) return undefined;

    const updatedTemplate: NoteTemplate = {
      ...existingTemplate,
      ...updateData,
      updatedAt: new Date(),
    };
    this.noteTemplates.set(id, updatedTemplate);
    return updatedTemplate;
  }

  async deleteNoteTemplate(id: string): Promise<boolean> {
    return this.noteTemplates.delete(id);
  }

  // Tasks CRUD operations
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    
    let filteredTasks = allTasks;
    
    if (businessTasks) {
      filteredTasks = filteredTasks.filter(task => !task.projectId);
    } else if (projectId) {
      filteredTasks = filteredTasks.filter(task => task.projectId === projectId);
    }
    
    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    
    return filteredTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTasksByUser(userId: string, companyId: string): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    
    const userTasks = allTasks.filter(task => {
      if (!task.assignedTo || !task.assignedTo.includes(userId)) return false;
      if (!task.projectId) return false;
      const project = this.projects.get(task.projectId);
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
    const task: Task = { 
      ...insertTask,
      id,
      type: "task",
      category: insertTask.category || "General",
      priority: insertTask.priority || "medium",
      status: insertTask.status || "todo",
      projectId: insertTask.projectId || null,
      tags: insertTask.tags || [],
      customFields: insertTask.customFields || {},
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

  // Clients CRUD operations
  async getClients(): Promise<Client[]> {
    try {
      const clients = await db.select().from(schema.clients)
        .where(eq(schema.clients.isActive, true))
        .orderBy(schema.clients.name);
      return clients;
    } catch (error) {
      console.error("Database error in getClients:", error);
      return [];
    }
  }

  async getClient(id: string): Promise<Client | undefined> {
    try {
      const [client] = await db.select().from(schema.clients)
        .where(eq(schema.clients.id, id));
      return client;
    } catch (error) {
      console.error("Database error in getClient:", error);
      return undefined;
    }
  }

  async createClient(client: InsertClient): Promise<Client> {
    try {
      const [newClient] = await db.insert(schema.clients)
        .values(client)
        .returning();
      return newClient;
    } catch (error) {
      console.error("Database error in createClient:", error);
      throw error;
    }
  }

  async updateClient(id: string, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    try {
      const [updated] = await db.update(schema.clients)
        .set({ ...clientData, updatedAt: new Date() })
        .where(eq(schema.clients.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateClient:", error);
      return undefined;
    }
  }

  async deleteClient(id: string): Promise<boolean> {
    try {
      await db.delete(schema.clients)
        .where(eq(schema.clients.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteClient:", error);
      return false;
    }
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
  async getTaskViews(ownerId?: string): Promise<TaskView[]> {
    const allViews = Array.from(this.taskViews.values());
    
    if (ownerId) {
      return allViews.filter(view => view.ownerId === ownerId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return allViews.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getTaskView(id: string): Promise<TaskView | undefined> {
    return this.taskViews.get(id);
  }

  async createTaskView(insertTaskView: InsertTaskView): Promise<TaskView> {
    const id = randomUUID();
    const now = new Date();
    const taskView: TaskView = {
      ...insertTaskView,
      id,
      ownerId: insertTaskView.ownerId ?? null,
      viewType: insertTaskView.viewType || "kanban",
      filters: insertTaskView.filters || {},
      columnConfig: insertTaskView.columnConfig || {},
      isDefault: insertTaskView.isDefault ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.taskViews.set(id, taskView);
    return taskView;
  }

  async updateTaskView(id: string, updateData: Partial<InsertTaskView>): Promise<TaskView | undefined> {
    const existingView = this.taskViews.get(id);
    if (!existingView) return undefined;

    const updatedView: TaskView = {
      ...existingView,
      ...updateData,
      updatedAt: new Date(),
    };
    this.taskViews.set(id, updatedView);
    return updatedView;
  }

  async deleteTaskView(id: string): Promise<boolean> {
    return this.taskViews.delete(id);
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
      priority: insertTask.priority || "medium",
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
    markupAmount: number;
    subtotalWithMarkup: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }> {
    const estimate = await this.getEstimate(estimateId);
    const items = await this.getEstimateItems(estimateId);

    let builderCostTotal = 0;
    let taxTotal = 0;
    let clientPriceTotal = 0;

    // Calculate totals, handling both new and legacy items
    items.forEach(item => {
      const builderCost = Math.round((item.unitCostExTax * item.quantity) / 100);
      builderCostTotal += builderCost;

      // If item has calculated tax/price (new format), use it
      if (item.taxAmount != null && item.priceIncTax != null) {
        taxTotal += item.taxAmount;
        clientPriceTotal += item.priceIncTax;
      } else {
        // Legacy item: calculate using defaults (0% markup if not specified)
        const markupPercent = item.markupPercent ?? estimate?.projectMarkupPercent ?? 0;
        const markupAmount = Math.round((builderCost * markupPercent) / 100);
        const clientPriceExTax = builderCost + markupAmount;
        const taxRate = estimate?.taxRate ?? 10;
        const tax = Math.round((clientPriceExTax * taxRate) / 100);
        const clientPrice = clientPriceExTax + tax;

        taxTotal += tax;
        clientPriceTotal += clientPrice;
      }
    });
    
    // Markup = (client price - tax) - builder cost
    const markupTotal = (clientPriceTotal - taxTotal) - builderCostTotal;
    const subtotalWithMarkup = builderCostTotal + markupTotal;

    return {
      subtotal: builderCostTotal,
      markupAmount: markupTotal,
      subtotalWithMarkup: subtotalWithMarkup,
      taxAmount: taxTotal,
      total: clientPriceTotal,
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
    
    // Update user's companyId
    const user = await this.getUser(ownerId);
    if (user) {
      await this.updateUser(ownerId, { companyId: newCompany.id });
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
  async getActivities(projectId: string, limit?: number): Promise<schema.Activity[]> {
    return [];
  }

  async createActivity(activity: schema.InsertActivity): Promise<schema.Activity> {
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
      .map(e => structuredClone(e)); // Return clones to prevent mutation
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

  async getAllScheduleItems(companyId: string): Promise<ScheduleItem[]> {
    const allItems: ScheduleItem[] = [];
    
    for (const schedule of this.schedules.values()) {
      const project = this.projects.get(schedule.projectId);
      if (project?.companyId === companyId) {
        const scheduleItems = await this.getScheduleItems(schedule.id);
        allItems.push(...scheduleItems);
      }
    }
    
    return allItems.sort((a, b) => 
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
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
    // Always ensure all required categories exist (idempotent)
    await this.ensureRequiredCategoriesExist();
    
    // Always ensure all required field options exist (idempotent)
    await this.ensureAllRequiredOptionsExist();

    // Always ensure required custom fields exist (idempotent)
    await this.ensureRequiredCustomFieldsExist();
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
          { id: 'opt-status-todo', categoryId, key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, sortOrder: 0 },
          { id: 'opt-status-progress', categoryId, key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, sortOrder: 1 },
          { id: 'opt-status-done', categoryId, key: 'done', name: 'Complete', color: '#10B981', isDefault: false, sortOrder: 2 },
          { id: 'opt-status-hold', categoryId, key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, sortOrder: 3 },
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
          { id: 'opt-status-todo', categoryId: category.id, key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, sortOrder: 0 },
          { id: 'opt-status-progress', categoryId: category.id, key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, sortOrder: 1 },
          { id: 'opt-status-done', categoryId: category.id, key: 'done', name: 'Complete', color: '#10B981', isDefault: false, sortOrder: 2 },
          { id: 'opt-status-hold', categoryId: category.id, key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, sortOrder: 3 },
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
    ];

    await db.insert(schema.fieldCategories).values(defaultCategories);
    
    // Now seed the field options for each category
    await this.seedDefaultFieldOptions(now);
  }

  private async seedDefaultFieldOptions(now: Date): Promise<void> {
    const fieldOptions = [
      // Task Status Options
      { id: 'opt-status-todo', categoryId: 'cat-task-status', key: 'todo', name: 'Not Started', color: '#6B7280', isDefault: true, sortOrder: 0 },
      { id: 'opt-status-progress', categoryId: 'cat-task-status', key: 'in-progress', name: 'In Progress', color: '#F59E0B', isDefault: false, sortOrder: 1 },
      { id: 'opt-status-done', categoryId: 'cat-task-status', key: 'done', name: 'Complete', color: '#10B981', isDefault: false, sortOrder: 2 },
      { id: 'opt-status-hold', categoryId: 'cat-task-status', key: 'on-hold', name: 'On Hold', color: '#EF4444', isDefault: false, sortOrder: 3 },
      
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
    ];

    const fieldOptionsWithTimestamps = fieldOptions.map(option => ({
      ...option,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }));

    await db.insert(schema.fieldOptions).values(fieldOptionsWithTimestamps);
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
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  // Required for Replit Auth - upsert user based on Replit ID
  async upsertUser(userData: import("@shared/schema").UpsertUser): Promise<User> {
    const [user] = await db
      .insert(schema.users)
      .values(userData)
      .onConflictDoUpdate({
        target: schema.users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
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

  // Tasks CRUD operations
  async getTasks(projectId?: string, status?: string, businessTasks?: boolean): Promise<Task[]> {
    const conditions = [eq(schema.notes.type, "task")];
    
    if (businessTasks) {
      conditions.push(isNull(schema.notes.projectId));
    } else if (projectId) {
      conditions.push(eq(schema.notes.projectId, projectId));
    }
    if (status) {
      conditions.push(eq(schema.notes.status, status));
    }
    
    const tasks = await db.select().from(schema.notes).where(
      conditions.length === 1 ? conditions[0] : and(...conditions)
    );
    return tasks as Task[];
  }

  async getTasksByUser(userId: string, companyId: string): Promise<Task[]> {
    const tasks = await db.select()
      .from(schema.notes)
      .innerJoin(schema.projects, eq(schema.notes.projectId, schema.projects.id))
      .where(
        and(
          eq(schema.notes.type, "task"),
          eq(schema.projects.companyId, companyId),
          eq(schema.notes.assigneeId, userId)
        )
      )
      .orderBy(desc(schema.notes.createdAt));
    return tasks.map((row: any) => row.notes) as Task[];
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(schema.notes)
      .where(and(eq(schema.notes.id, id), eq(schema.notes.type, "task")))
      .limit(1);
    return task as Task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(schema.notes).values({
      ...insertTask,
      type: "task"
    }).returning();
    return task as Task;
  }

  async updateTask(id: string, taskData: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db.update(schema.notes).set({
      ...taskData,
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

  async setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[] }[]): Promise<void> {
    try {
      // Delete existing permissions for this role
      await db.delete(schema.rolePermissions)
        .where(eq(schema.rolePermissions.roleId, roleId));

      // Insert new permissions
      if (permissions.length > 0) {
        await db.insert(schema.rolePermissions)
          .values(permissions.map(p => ({
            roleId,
            permissionId: p.permissionId,
            allowedActions: p.allowedActions,
          })));
      }
    } catch (error) {
      console.error("Database error in setRolePermissions:", error);
      throw error;
    }
  }
  async getUserProjectAccess(userId: string): Promise<UserProjectAccess[]> { return []; }
  async createUserProjectAccess(access: InsertUserProjectAccess): Promise<UserProjectAccess> { throw new Error("Not implemented"); }
  async updateUserProjectAccess(id: string, access: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined> { return undefined; }
  async deleteUserProjectAccess(id: string): Promise<boolean> { return false; }
  async grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess> { throw new Error("Not implemented"); }
  async getUserInvitations(status?: string): Promise<UserInvitation[]> { return []; }
  async getUserInvitation(id: string): Promise<UserInvitation | undefined> { return undefined; }
  async getUserInvitationByToken(token: string): Promise<UserInvitation | undefined> { return undefined; }
  async createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation> { throw new Error("Not implemented"); }
  async updateUserInvitation(id: string, invitation: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined> { return undefined; }
  async deleteUserInvitation(id: string): Promise<boolean> { return false; }
  async acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined> { return undefined; }
  async getNotes(projectId?: string, companyId?: string): Promise<Note[]> {
    // Build query to join with projects table for company filtering
    let query = db
      .select({
        id: schema.notes.id,
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
        type: schema.notes.type,
        status: schema.notes.status,
        assigneeId: schema.notes.assigneeId,
        assigneeName: schema.notes.assigneeName,
        dueDate: schema.notes.dueDate,
        completedAt: schema.notes.completedAt,
        tags: schema.notes.tags,
        labels: schema.notes.labels,
        parentTaskId: schema.notes.parentTaskId,
        subtaskOrder: schema.notes.subtaskOrder,
        recurringSettings: schema.notes.recurringSettings,
        recurringParentId: schema.notes.recurringParentId,
        templateId: schema.notes.templateId,
        createdAt: schema.notes.createdAt,
        updatedAt: schema.notes.updatedAt,
      })
      .from(schema.notes)
      .leftJoin(schema.projects, eq(schema.notes.projectId, schema.projects.id));

    const conditions = [eq(schema.notes.type, "note")];
    
    // Filter by specific project if provided
    if (projectId) {
      conditions.push(eq(schema.notes.projectId, projectId));
    }
    
    // Filter by company - notes must belong to projects in the user's company
    if (companyId) {
      conditions.push(eq(schema.projects.companyId, companyId));
    }
    
    const notes = await query
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .orderBy(desc(schema.notes.createdAt));
    
    return notes as Note[];
  }
  async getNote(id: string, companyId?: string): Promise<Note | undefined> {
    if (!companyId) {
      // If no companyId provided, just return the note (backwards compatibility)
      const result = await db.select().from(schema.notes).where(eq(schema.notes.id, id));
      return result[0] as Note | undefined;
    }
    
    // Join with projects to verify company ownership
    const result = await db
      .select({
        id: schema.notes.id,
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
        type: schema.notes.type,
        status: schema.notes.status,
        assigneeId: schema.notes.assigneeId,
        assigneeName: schema.notes.assigneeName,
        dueDate: schema.notes.dueDate,
        completedAt: schema.notes.completedAt,
        tags: schema.notes.tags,
        labels: schema.notes.labels,
        parentTaskId: schema.notes.parentTaskId,
        subtaskOrder: schema.notes.subtaskOrder,
        recurringSettings: schema.notes.recurringSettings,
        recurringParentId: schema.notes.recurringParentId,
        templateId: schema.notes.templateId,
        createdAt: schema.notes.createdAt,
        updatedAt: schema.notes.updatedAt,
      })
      .from(schema.notes)
      .leftJoin(schema.projects, eq(schema.notes.projectId, schema.projects.id))
      .where(and(
        eq(schema.notes.id, id),
        eq(schema.projects.companyId, companyId)
      ));
    
    return result[0] as Note | undefined;
  }
  async createNote(insertNote: InsertNote): Promise<Note> {
    const now = new Date();
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
  async getNoteTemplates(ownerId?: string): Promise<NoteTemplate[]> { return []; }
  async getNoteTemplate(id: string): Promise<NoteTemplate | undefined> { return undefined; }
  async createNoteTemplate(template: InsertNoteTemplate): Promise<NoteTemplate> { throw new Error("Not implemented"); }
  async updateNoteTemplate(id: string, template: Partial<InsertNoteTemplate>): Promise<NoteTemplate | undefined> { return undefined; }
  async deleteNoteTemplate(id: string): Promise<boolean> { return false; }
  
  // Clients CRUD operations
  async getClients(): Promise<Client[]> {
    try {
      const clients = await db.select().from(schema.clients)
        .where(eq(schema.clients.isActive, true))
        .orderBy(schema.clients.name);
      return clients;
    } catch (error) {
      console.error("Database error in getClients:", error);
      return [];
    }
  }

  async getClient(id: string): Promise<Client | undefined> {
    try {
      const [client] = await db.select().from(schema.clients)
        .where(eq(schema.clients.id, id));
      return client;
    } catch (error) {
      console.error("Database error in getClient:", error);
      return undefined;
    }
  }

  async createClient(client: InsertClient): Promise<Client> {
    try {
      const [newClient] = await db.insert(schema.clients)
        .values(client)
        .returning();
      return newClient;
    } catch (error) {
      console.error("Database error in createClient:", error);
      throw error;
    }
  }

  async updateClient(id: string, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    try {
      const [updated] = await db.update(schema.clients)
        .set({ ...clientData, updatedAt: new Date() })
        .where(eq(schema.clients.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Database error in updateClient:", error);
      return undefined;
    }
  }

  async deleteClient(id: string): Promise<boolean> {
    try {
      await db.delete(schema.clients)
        .where(eq(schema.clients.id, id));
      return true;
    } catch (error) {
      console.error("Database error in deleteClient:", error);
      return false;
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
  async getTaskViews(ownerId?: string): Promise<TaskView[]> { return []; }
  async getTaskView(id: string): Promise<TaskView | undefined> { return undefined; }
  async createTaskView(view: InsertTaskView): Promise<TaskView> { throw new Error("Not implemented"); }
  async updateTaskView(id: string, view: Partial<InsertTaskView>): Promise<TaskView | undefined> { return undefined; }
  async deleteTaskView(id: string): Promise<boolean> { return false; }
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
    markupAmount: number;
    subtotalWithMarkup: number;
    taxAmount: number;
    total: number;
    itemCount: number;
  }> {
    try {
      const estimate = await this.getEstimate(estimateId);
      const items = await this.getEstimateItems(estimateId);

      let itemAmountsExTaxTotal = 0; // Sum of all line item amounts (ex tax, with their individual markups)

      // Calculate totals from line items (each line item has its own markup applied)
      items.forEach(item => {
        const builderCost = Math.round((item.unitCostExTax * item.quantity) / 100);

        // If item has calculated price (new format), use it
        if (item.taxAmount != null && item.priceIncTax != null) {
          const itemAmountExTax = item.priceIncTax - item.taxAmount;
          itemAmountsExTaxTotal += itemAmountExTax;
        } else {
          // Legacy item: use item's own markup (default to 0% if not set)
          // Note: We don't use the global markup here - that's applied separately to the subtotal
          const markupPercent = item.markupPercent ?? 0;
          const markupAmount = Math.round((builderCost * markupPercent) / 100);
          const itemAmountExTax = builderCost + markupAmount;
          itemAmountsExTaxTotal += itemAmountExTax;
        }
      });
      
      // Now apply global markup to the sum of all item amounts (two-layer markup)
      const globalMarkupPercent = estimate?.projectMarkupPercent ?? 0;
      const globalMarkupAmount = Math.round((itemAmountsExTaxTotal * globalMarkupPercent) / 100);
      const totalAmountExTax = itemAmountsExTaxTotal + globalMarkupAmount;
      
      // Calculate tax on the total amount (ex tax)
      const taxRate = estimate?.taxRate ?? 10;
      const totalTax = Math.round((totalAmountExTax * taxRate) / 100);
      const totalAmountIncTax = totalAmountExTax + totalTax;

      return {
        subtotal: itemAmountsExTaxTotal, // Sum of all line item amounts (ex tax, includes item markups)
        markupAmount: globalMarkupAmount, // Global markup applied to subtotal
        subtotalWithMarkup: totalAmountExTax, // Subtotal + global markup
        taxAmount: totalTax, // Tax on the total amount
        total: totalAmountIncTax, // Final total inc tax
        itemCount: items.length,
      };
    } catch (error) {
      console.error("Database error in getEstimateSummary:", error);
      return { subtotal: 0, markupAmount: 0, subtotalWithMarkup: 0, taxAmount: 0, total: 0, itemCount: 0 };
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
    
    // Update user's companyId
    await db.update(schema.users)
      .set({ companyId: newCompany.id, updatedAt: new Date() })
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
  async getFieldOption(id: string): Promise<FieldOption | undefined> { return undefined; }
  async createFieldOption(option: InsertFieldOption): Promise<FieldOption> { throw new Error("Not implemented"); }
  async updateFieldOption(id: string, option: Partial<InsertFieldOption>): Promise<FieldOption | undefined> { return undefined; }
  async deleteFieldOption(id: string): Promise<boolean> { return false; }
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

  async getSuppliers(projectId?: string): Promise<Supplier[]> {
    try {
      if (projectId) {
        return await db.select()
          .from(schema.suppliers)
          .where(eq(schema.suppliers.projectId, projectId));
      }
      return await db.select().from(schema.suppliers);
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

  async createSupplier(supplier: InsertSupplier): Promise<Supplier> {
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

  async getContacts(contactType?: "team" | "supplier" | "client"): Promise<Contact[]> {
    try {
      if (contactType) {
        return await db.select()
          .from(schema.contacts)
          .where(eq(schema.contacts.contactType, contactType));
      }
      return await db.select().from(schema.contacts);
    } catch (error) {
      console.error("Database error in getContacts:", error);
      throw error;
    }
  }

  async getContact(id: string): Promise<Contact | undefined> {
    try {
      const contacts = await db.select()
        .from(schema.contacts)
        .where(eq(schema.contacts.id, id));
      return contacts[0];
    } catch (error) {
      console.error("Database error in getContact:", error);
      throw error;
    }
  }

  async createContact(contact: InsertContact): Promise<Contact> {
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

  async updateContact(id: string, contact: Partial<InsertContact>): Promise<Contact | undefined> {
    try {
      // Auto-generate name from firstName and lastName if either is being updated with a non-empty value
      let updateData = { ...contact, updatedAt: new Date() };
      
      if (contact.firstName !== undefined || contact.lastName !== undefined) {
        // Get existing contact to merge firstName/lastName
        const existing = await this.getContact(id);
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
        .where(eq(schema.contacts.id, id))
        .returning();
      return updatedContacts[0];
    } catch (error) {
      console.error("Database error in updateContact:", error);
      throw error;
    }
  }

  async archiveContact(id: string): Promise<Contact | undefined> {
    try {
      const archivedContacts = await db.update(schema.contacts)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(eq(schema.contacts.id, id))
        .returning();
      return archivedContacts[0];
    } catch (error) {
      console.error("Database error in archiveContact:", error);
      throw error;
    }
  }

  async restoreContact(id: string): Promise<Contact | undefined> {
    try {
      const restoredContacts = await db.update(schema.contacts)
        .set({ isArchived: false, updatedAt: new Date() })
        .where(eq(schema.contacts.id, id))
        .returning();
      return restoredContacts[0];
    } catch (error) {
      console.error("Database error in restoreContact:", error);
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
  async getActivities(projectId: string, limit: number = 50): Promise<schema.Activity[]> {
    try {
      return await db.select()
        .from(schema.activities)
        .where(eq(schema.activities.projectId, projectId))
        .orderBy(desc(schema.activities.createdAt))
        .limit(limit);
    } catch (error) {
      console.error("Database error in getActivities:", error);
      throw error;
    }
  }

  async createActivity(activity: schema.InsertActivity): Promise<schema.Activity> {
    try {
      const result = await db.insert(schema.activities)
        .values(activity)
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in createActivity:", error);
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
      
      const actualAmount = bills.reduce((sum, bill) => sum + (bill.total || 0), 0);

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
      // Get all cost codes
      const costCodes = await db.select()
        .from(schema.costCodes)
        .where(eq(schema.costCodes.isActive, true));

      // Get estimates for this project
      const estimates = await db.select()
        .from(schema.estimates)
        .where(eq(schema.estimates.projectId, projectId));

      // Get estimate items that are flagged for labour hours tracking
      const estimateItems = estimates.length > 0 ? await db.select()
        .from(schema.estimateItems)
        .where(
          and(
            eq(schema.estimateItems.estimateId, estimates[0].id),
            eq(schema.estimateItems.type, "Labour"),
            eq(schema.estimateItems.trackLabourHours, true)
          )
        ) : [];

      // Group hours by cost code
      const costCodeMap = new Map<string, {
        budgetedHours: number;
        costCodeTitle: string;
        categoryTitle: string;
        costCodeId: string | null;
      }>();

      // Calculate budgeted hours from flagged estimate items (rounded to 0.25)
      for (const item of estimateItems) {
        const costCodeKey = item.costCode || "uncategorized";
        const costCode = costCodes.find(cc => cc.code === costCodeKey);
        
        const existing = costCodeMap.get(costCodeKey) || { 
          budgetedHours: 0,
          costCodeTitle: costCode?.title || item.costCode || "Uncategorized",
          categoryTitle: "General",
          costCodeId: costCode?.id || null
        };
        
        // Round hours to nearest 0.25
        const hours = item.quantity || 0;
        const roundedHours = Math.round(hours * 4) / 4;
        existing.budgetedHours += roundedHours;
        
        costCodeMap.set(costCodeKey, existing);
      }

      // Get timesheets for this project
      const timesheets = await db.select()
        .from(schema.timesheets)
        .where(eq(schema.timesheets.projectId, projectId));

      // Get timesheet cost code splits
      const timesheetIds = timesheets.map(t => t.id);
      const timesheetCostCodes = timesheetIds.length > 0 ? await db.select()
        .from(schema.timesheetCostCodes)
        .where(sql`${schema.timesheetCostCodes.timesheetId} = ANY(${timesheetIds})`) : [];

      // Map pending and approved hours by cost code
      const pendingHoursMap = new Map<string, number>();
      const approvedHoursMap = new Map<string, number>();

      for (const split of timesheetCostCodes) {
        const timesheet = timesheets.find(t => t.id === split.timesheetId);
        if (!timesheet) continue;

        const duration = parseFloat(split.duration);
        const costCode = costCodes.find(cc => cc.id === split.costCodeId);
        const costCodeKey = costCode?.code || "uncategorized";

        if (timesheet.status === "submitted") {
          pendingHoursMap.set(costCodeKey, (pendingHoursMap.get(costCodeKey) || 0) + duration);
        } else if (timesheet.status === "approved") {
          approvedHoursMap.set(costCodeKey, (approvedHoursMap.get(costCodeKey) || 0) + duration);
        }
      }

      // Delete existing labour hours budget for this project
      await db.delete(schema.labourHoursBudget)
        .where(eq(schema.labourHoursBudget.projectId, projectId));

      // Create new labour hours budget entries
      const labourHoursBudget: LabourHoursBudget[] = [];
      let sortOrder = 0;

      for (const [costCodeKey, data] of costCodeMap.entries()) {
        const pendingHours = pendingHoursMap.get(costCodeKey) || 0;
        const approvedHours = approvedHoursMap.get(costCodeKey) || 0;

        const result = await db.insert(schema.labourHoursBudget)
          .values({
            projectId,
            costCodeId: data.costCodeId,
            costCodeTitle: data.costCodeTitle,
            categoryTitle: data.categoryTitle,
            budgetedHours: data.budgetedHours.toString(),
            pendingHours: pendingHours.toString(),
            approvedHours: approvedHours.toString(),
            sortOrder: sortOrder++
          })
          .returning();
        
        labourHoursBudget.push(result[0]);
      }

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
      const result = await db.update(schema.timesheets)
        .set({ ...timesheet, updatedAt: new Date() })
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

  async submitTimesheet(id: string): Promise<Timesheet | undefined> {
    try {
      const result = await db.update(schema.timesheets)
        .set({ status: "submitted", updatedAt: new Date() })
        .where(eq(schema.timesheets.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in submitTimesheet:", error);
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
          isActive: true,
          clockInTime: now,
          costCodeId: costCodeId || null,
          status: "draft",
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
        .orderBy(schema.scheduleItems.sortOrder, schema.scheduleItems.startDate);
    } catch (error) {
      console.error("Database error in getScheduleItems:", error);
      throw error;
    }
  }

  async getAllScheduleItems(companyId: string): Promise<ScheduleItem[]> {
    try {
      const items = await db.select({
        id: schema.scheduleItems.id,
        scheduleId: schema.scheduleItems.scheduleId,
        title: schema.scheduleItems.title,
        description: schema.scheduleItems.description,
        startDate: schema.scheduleItems.startDate,
        endDate: schema.scheduleItems.endDate,
        color: schema.scheduleItems.color,
        sortOrder: schema.scheduleItems.sortOrder,
        createdAt: schema.scheduleItems.createdAt,
        updatedAt: schema.scheduleItems.updatedAt,
      })
        .from(schema.scheduleItems)
        .innerJoin(schema.schedules, eq(schema.scheduleItems.scheduleId, schema.schedules.id))
        .innerJoin(schema.projects, eq(schema.schedules.projectId, schema.projects.id))
        .where(eq(schema.projects.companyId, companyId))
        .orderBy(schema.scheduleItems.startDate);
      return items;
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
  async getScheduleTemplates(category?: string): Promise<ScheduleTemplate[]> {
    try {
      const query = db.select()
        .from(schema.scheduleTemplates)
        .where(eq(schema.scheduleTemplates.isArchived, false));
      
      if (category) {
        return await query.where(eq(schema.scheduleTemplates.category, category));
      }
      return await query;
    } catch (error) {
      console.error("Database error in getScheduleTemplates:", error);
      throw error;
    }
  }

  async getScheduleTemplate(id: string): Promise<ScheduleTemplate | undefined> {
    try {
      const result = await db.select()
        .from(schema.scheduleTemplates)
        .where(eq(schema.scheduleTemplates.id, id))
        .limit(1);
      return result[0];
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

  async updateScheduleTemplate(id: string, template: Partial<InsertScheduleTemplate>): Promise<ScheduleTemplate | undefined> {
    try {
      const result = await db.update(schema.scheduleTemplates)
        .set({ ...template, updatedAt: new Date() })
        .where(eq(schema.scheduleTemplates.id, id))
        .returning();
      return result[0];
    } catch (error) {
      console.error("Database error in updateScheduleTemplate:", error);
      throw error;
    }
  }

  async deleteScheduleTemplate(id: string): Promise<boolean> {
    try {
      const result = await db.delete(schema.scheduleTemplates)
        .where(eq(schema.scheduleTemplates.id, id))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Database error in deleteScheduleTemplate:", error);
      throw error;
    }
  }

  // Calendar Views CRUD
  async getCalendarViews(userId: string, calendarType: "personal" | "business", companyId: string): Promise<CalendarView[]> {
    try {
      return await db.select()
        .from(schema.calendarViews)
        .where(and(
          eq(schema.calendarViews.userId, userId),
          eq(schema.calendarViews.calendarType, calendarType),
          eq(schema.calendarViews.companyId, companyId),
          eq(schema.calendarViews.isArchived, false)
        ))
        .orderBy(asc(schema.calendarViews.sortOrder));
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
      const result = await db.insert(schema.taskTemplates)
        .values(template)
        .returning();
      return result[0] as TaskTemplate;
    } catch (error) {
      console.error("Database error in createTaskTemplate:", error);
      throw error;
    }
  }

  async updateTaskTemplate(id: string, template: Partial<InsertTaskTemplate>, companyId: string): Promise<TaskTemplate | undefined> {
    try {
      const result = await db.update(schema.taskTemplates)
        .set({ ...template, updatedAt: new Date() })
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
  async getChannels(companyId: string, userId?: string): Promise<Channel[]> {
    try {
      const query = db.select().from(schema.channels)
        .where(
          and(
            eq(schema.channels.companyId, companyId),
            eq(schema.channels.isArchived, false)
          )
        )
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
}

// Create and initialize storage
const dbStorage = new DbStorage();

// Initialize storage and export
export const storage = dbStorage;

// Initialize storage on startup
dbStorage.initialize().catch(console.error);
