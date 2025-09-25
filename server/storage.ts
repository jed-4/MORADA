import { 
  type User, type InsertUser, 
  type Note, type InsertNote,
  type Task, type InsertTask,
  type CustomFieldDef, type InsertCustomFieldDef,
  type CustomFieldOption, type InsertCustomFieldOption,
  type NoteTemplate, type InsertNoteTemplate,
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
  type FieldCategory, type InsertFieldCategory,
  type FieldOption, type InsertFieldOption,
  type FieldCategoryWithOptions,
  type Selection, type InsertSelection,
  type SelectionOption, type InsertSelectionOption,
  type OptionAttachment, type InsertOptionAttachment,
  type ClientSelection, type InsertClientSelection,
  type SelectionWithOptions
} from "@shared/schema";
import { randomUUID } from "crypto";
import { PasswordUtils } from "./utils/auth";
import { db } from "./db";
import { eq, or, and } from "drizzle-orm";
import * as schema from "@shared/schema";

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
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  changeUserPassword(id: string, newPassword: string): Promise<User | undefined>;
  getUsers(category?: UserCategory): Promise<User[]>;

  // User Role operations  
  getUserRoles(category?: UserCategory): Promise<UserRole[]>;
  getUserRole(id: string): Promise<UserRole | undefined>;
  createUserRole(role: InsertUserRole): Promise<UserRole>;
  updateUserRole(id: string, role: Partial<InsertUserRole>): Promise<UserRole | undefined>;
  deleteUserRole(id: string): Promise<boolean>;

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
  getNotes(projectId?: string): Promise<Note[]>;
  getNote(id: string): Promise<Note | undefined>;
  createNote(note: InsertNote): Promise<Note>;
  updateNote(id: string, note: Partial<InsertNote>): Promise<Note | undefined>;
  deleteNote(id: string): Promise<boolean>;

  // Tasks CRUD operations (specific to type="task")
  getTasks(projectId?: string, status?: string): Promise<Task[]>;
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
  updateEstimateItem(id: string, item: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined>;
  deleteEstimateItem(id: string): Promise<boolean>;

  // Estimate Groups CRUD
  getEstimateGroups(estimateId: string): Promise<EstimateGroup[]>;
  getEstimateGroup(id: string): Promise<EstimateGroup | undefined>;
  createEstimateGroup(group: InsertEstimateGroup): Promise<EstimateGroup>;
  updateEstimateGroup(id: string, group: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined>;
  deleteEstimateGroup(id: string): Promise<boolean>;

  // Versioning and Locking
  createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate>;
  lockEstimate(estimateId: string): Promise<Estimate | undefined>;
  unlockEstimate(estimateId: string): Promise<Estimate | undefined>;
  
  // Summary calculations
  getEstimateSummary(estimateId: string): Promise<{
    subtotal: number;
    markup: number;
    tax: number;
    total: number;
    itemCount: number;
  }>;

  // Company Settings
  getCompanySettings(): Promise<CompanySettings | undefined>;
  updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined>;

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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private userRoles: Map<string, UserRole>;
  private permissions: Map<string, Permission>;
  private rolePermissions: Map<string, RolePermission>;
  private userProjectAccess: Map<string, UserProjectAccess>;
  private userInvitations: Map<string, UserInvitation>;
  private notes: Map<string, Note>;
  private customFieldDefs: Map<string, CustomFieldDef>;
  private customFieldOptions: Map<string, CustomFieldOption>;
  private noteTemplates: Map<string, NoteTemplate>;
  private projects: Map<string, Project>;
  private taskViews: Map<string, TaskView>;
  private estimates: Map<string, Estimate>;
  private estimateItems: Map<string, EstimateItem>;
  private estimateGroups: Map<string, EstimateGroup>;
  private companySettings: CompanySettings | undefined;
  private fieldCategories: Map<string, FieldCategory>;
  private fieldOptions: Map<string, FieldOption>;
  private selections: Map<string, Selection>;
  private selectionOptions: Map<string, SelectionOption>;
  private optionAttachments: Map<string, OptionAttachment>;
  private clientSelections: Map<string, ClientSelection>;

  constructor() {
    this.users = new Map();
    this.userRoles = new Map();
    this.permissions = new Map();
    this.rolePermissions = new Map();
    this.userProjectAccess = new Map();
    this.userInvitations = new Map();
    this.notes = new Map();
    this.customFieldDefs = new Map();
    this.customFieldOptions = new Map();
    this.noteTemplates = new Map();
    this.projects = new Map();
    this.taskViews = new Map();
    this.estimates = new Map();
    this.estimateItems = new Map();
    this.estimateGroups = new Map();
    this.fieldCategories = new Map();
    this.fieldOptions = new Map();
    this.selections = new Map();
    this.selectionOptions = new Map();
    this.optionAttachments = new Map();
    this.clientSelections = new Map();
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

    // Trade Categories
    const tradeCategoriesCategory: FieldCategory = {
      id: "cat-trade-types",
      key: "task.trade",
      label: "Trade Categories",
      entity: "task", 
      description: "Construction trade categories",
      isBuiltIn: true,
      isActive: true,
      sortOrder: 3,
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
      isActive: true,
      isBusiness: true,
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
        isActive: true,
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
      color: "#2563eb",
      isActive: true,
      isBusiness: false,
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
        priceExTax: 850000, // $8500 in cents
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
        priceExTax: 340000, // $3400 in cents (40 * $85)
        taxAmount: 34000,   // $340 in cents
        priceIncTax: 374000, // $3740 in cents
      }
    ];

    testItems.forEach(itemData => {
      const item: EstimateItem = {
        ...itemData,
        groupId: null,
        costCode: null,
        allowance: "None",
        notes: null,
        attachmentUrl: null,
        requestForQuote: false,
        isSelection: false,
        visibleInProposal: true,
        showAsInProposal: "price",
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

  async getUsers(category?: UserCategory): Promise<User[]> {
    const allUsers = Array.from(this.users.values());
    if (category) {
      return allUsers.filter(user => user.userCategory === category && user.isActive);
    }
    return allUsers.filter(user => user.isActive);
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
  async getUserRoles(category?: UserCategory): Promise<UserRole[]> {
    const allRoles = Array.from(this.userRoles.values());
    if (category) {
      return allRoles.filter(role => role.userCategory === category && role.isActive);
    }
    return allRoles.filter(role => role.isActive);
  }

  async getUserRole(id: string): Promise<UserRole | undefined> {
    return this.userRoles.get(id);
  }

  async createUserRole(insertRole: InsertUserRole): Promise<UserRole> {
    const id = randomUUID();
    const now = new Date();
    const role: UserRole = {
      ...insertRole,
      id,
      description: insertRole.description || null,
      isBuiltIn: insertRole.isBuiltIn ?? false,
      isActive: insertRole.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.userRoles.set(id, role);
    return role;
  }

  async updateUserRole(id: string, updateData: Partial<InsertUserRole>): Promise<UserRole | undefined> {
    const existingRole = this.userRoles.get(id);
    if (!existingRole) return undefined;

    const updatedRole: UserRole = {
      ...existingRole,
      ...updateData,
      updatedAt: new Date(),
    };
    this.userRoles.set(id, updatedRole);
    return updatedRole;
  }

  async deleteUserRole(id: string): Promise<boolean> {
    const role = this.userRoles.get(id);
    if (!role || role.isBuiltIn) return false; // Cannot delete built-in roles

    // Soft delete by setting isActive to false
    const updatedRole: UserRole = {
      ...role,
      isActive: false,
      updatedAt: new Date(),
    };
    this.userRoles.set(id, updatedRole);
    return true;
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
      return await this.updateUserProjectAccess(existingAccess.id, { accessLevel, grantedBy });
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
  async getNotes(projectId?: string): Promise<Note[]> {
    const allNotes = Array.from(this.notes.values());
    if (projectId) {
      return allNotes.filter(note => note.projectId === projectId);
    }
    return allNotes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getNote(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
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
  async getTasks(projectId?: string, status?: string): Promise<Task[]> {
    const allTasks = Array.from(this.notes.values())
      .filter(note => note.type === "task") as Task[];
    
    let filteredTasks = allTasks;
    
    if (projectId) {
      filteredTasks = filteredTasks.filter(task => task.projectId === projectId);
    }
    
    if (status) {
      filteredTasks = filteredTasks.filter(task => task.status === status);
    }
    
    return filteredTasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  // Projects CRUD operations
  async getProjects(ownerId?: string): Promise<Project[]> {
    try {
      let query = db.select().from(schema.projects).where(eq(schema.projects.isActive, true));
      
      if (ownerId) {
        query = query.where(
          or(
            eq(schema.projects.ownerId, ownerId),
            eq(schema.projects.isBusiness, true)
          )
        );
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
          project.ownerId === ownerId || project.isBusiness
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
      color: insertProject.color ?? null,
      ownerId: insertProject.ownerId ?? null,
      isActive: insertProject.isActive ?? true,
      isBusiness: insertProject.isBusiness ?? false,
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
      // Fallback to memory
      const id = randomUUID();
      const now = new Date();
      const memEstimate: Estimate = {
        ...insertEstimate,
        id,
        status: insertEstimate.status || "draft",
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
    const priceExTax = insertItem.priceExTax || 0;
    const taxRate = estimate?.taxRate || 10; // Default 10% GST
    const taxAmount = Math.round(priceExTax * taxRate / 100);
    const priceIncTax = priceExTax + taxAmount;
    
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
        taxAmount,
        priceIncTax,
        createdAt: now,
        updatedAt: now,
      };
      this.estimateItems.set(id, memItem);
      return memItem;
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
    if (updateItem.priceExTax !== undefined) {
      const taxRate = estimate?.taxRate || 10;
      updatedItem.taxAmount = Math.round(updatedItem.priceExTax * taxRate / 100);
      updatedItem.priceIncTax = updatedItem.priceExTax + updatedItem.taxAmount;
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
    taxAmount: number;
    total: number;
    itemCount: number;
  }> {
    const estimate = await this.getEstimate(estimateId);
    const items = await this.getEstimateItems(estimateId);

    const subtotal = items.reduce((sum, item) => sum + (item.priceExTax * item.quantity), 0);
    const markupPercent = estimate?.projectMarkupPercent || 0;
    const markup = Math.round(subtotal * markupPercent / 100);
    const subtotalWithMarkup = subtotal + markup;
    const taxRate = estimate?.taxRate || 10;
    const tax = Math.round(subtotalWithMarkup * taxRate / 100);
    const total = subtotalWithMarkup + tax;

    return {
      subtotal,
      markup: markup,
      tax: tax,
      total,
      itemCount: items.length,
    };
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
}

// Database-backed storage implementation
export class DbStorage implements IStorage {
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

  async getUsers(category?: UserCategory): Promise<User[]> {
    if (category) {
      return await db.select().from(schema.users).where(eq(schema.users.userCategory, category));
    }
    return await db.select().from(schema.users);
  }

  // Tasks CRUD operations
  async getTasks(projectId?: string, status?: string): Promise<Task[]> {
    const conditions = [eq(schema.notes.type, "task")];
    
    if (projectId) {
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

  // Add placeholder implementations for other required interface methods
  // These can be implemented as needed
  async getUserRoles(): Promise<UserRole[]> { return []; }
  async getUserRole(id: string): Promise<UserRole | undefined> { return undefined; }
  async createUserRole(role: InsertUserRole): Promise<UserRole> { throw new Error("Not implemented"); }
  async updateUserRole(id: string, role: Partial<InsertUserRole>): Promise<UserRole | undefined> { return undefined; }
  async deleteUserRole(id: string): Promise<boolean> { return false; }
  async getPermissions(): Promise<Permission[]> { return []; }
  async getPermission(id: string): Promise<Permission | undefined> { return undefined; }
  async createPermission(permission: InsertPermission): Promise<Permission> { throw new Error("Not implemented"); }
  async updatePermission(id: string, permission: Partial<InsertPermission>): Promise<Permission | undefined> { return undefined; }
  async deletePermission(id: string): Promise<boolean> { return false; }
  async getRolePermissions(roleId: string): Promise<RolePermission[]> { return []; }
  async createRolePermission(rolePermission: InsertRolePermission): Promise<RolePermission> { throw new Error("Not implemented"); }
  async updateRolePermission(id: string, rolePermission: Partial<InsertRolePermission>): Promise<RolePermission | undefined> { return undefined; }
  async deleteRolePermission(id: string): Promise<boolean> { return false; }
  async setRolePermissions(roleId: string, permissions: { permissionId: string, allowedActions: PermissionAction[] }[]): Promise<void> {}
  async getUserProjectAccess(userId: string): Promise<UserProjectAccess[]> { return []; }
  async createUserProjectAccess(access: InsertUserProjectAccess): Promise<UserProjectAccess> { throw new Error("Not implemented"); }
  async updateUserProjectAccess(id: string, access: Partial<InsertUserProjectAccess>): Promise<UserProjectAccess | undefined> { return undefined; }
  async deleteUserProjectAccess(id: string): Promise<boolean> { return false; }
  async grantProjectAccess(userId: string, projectId: string, accessLevel: string, grantedBy: string): Promise<UserProjectAccess> { throw new Error("Not implemented"); }
  async getUserInvitations(): Promise<UserInvitation[]> { return []; }
  async getUserInvitation(id: string): Promise<UserInvitation | undefined> { return undefined; }
  async getUserInvitationByToken(token: string): Promise<UserInvitation | undefined> { return undefined; }
  async createUserInvitation(invitation: InsertUserInvitation): Promise<UserInvitation> { throw new Error("Not implemented"); }
  async updateUserInvitation(id: string, invitation: Partial<InsertUserInvitation>): Promise<UserInvitation | undefined> { return undefined; }
  async deleteUserInvitation(id: string): Promise<boolean> { return false; }
  async acceptInvitation(token: string, userData: Partial<InsertUser>): Promise<{ user: User, invitation: UserInvitation } | undefined> { return undefined; }
  async getNotes(): Promise<Note[]> { return []; }
  async getNote(id: string): Promise<Note | undefined> { return undefined; }
  async createNote(note: InsertNote): Promise<Note> { throw new Error("Not implemented"); }
  async updateNote(id: string, note: Partial<InsertNote>): Promise<Note | undefined> { return undefined; }
  async deleteNote(id: string): Promise<boolean> { return false; }
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
  async getNoteTemplates(): Promise<NoteTemplate[]> { return []; }
  async getNoteTemplate(id: string): Promise<NoteTemplate | undefined> { return undefined; }
  async createNoteTemplate(template: InsertNoteTemplate): Promise<NoteTemplate> { throw new Error("Not implemented"); }
  async updateNoteTemplate(id: string, template: Partial<InsertNoteTemplate>): Promise<NoteTemplate | undefined> { return undefined; }
  async deleteNoteTemplate(id: string): Promise<boolean> { return false; }
  async getProjects(ownerId?: string): Promise<Project[]> {
    if (ownerId) {
      // Filter by owner or business projects
      return await db.select().from(schema.projects)
        .where(
          and(
            eq(schema.projects.isActive, true),
            or(
              eq(schema.projects.ownerId, ownerId),
              eq(schema.projects.isBusiness, true)
            )
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
  async getProject(id: string): Promise<Project | undefined> { return undefined; }
  async createProject(project: InsertProject): Promise<Project> { throw new Error("Not implemented"); }
  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> { return undefined; }
  async deleteProject(id: string): Promise<boolean> { return false; }
  async getTaskViews(): Promise<TaskView[]> { return []; }
  async getTaskView(id: string): Promise<TaskView | undefined> { return undefined; }
  async createTaskView(view: InsertTaskView): Promise<TaskView> { throw new Error("Not implemented"); }
  async updateTaskView(id: string, view: Partial<InsertTaskView>): Promise<TaskView | undefined> { return undefined; }
  async deleteTaskView(id: string): Promise<boolean> { return false; }
  async getSubtasks(parentTaskId: string): Promise<Task[]> { return []; }
  async createSubtask(parentTaskId: string, subtask: InsertTask): Promise<Task> { throw new Error("Not implemented"); }
  async getEstimates(): Promise<Estimate[]> { return []; }
  async getEstimate(id: string): Promise<Estimate | undefined> { return undefined; }
  async createEstimate(estimate: InsertEstimate): Promise<Estimate> { throw new Error("Not implemented"); }
  async updateEstimate(id: string, estimate: Partial<InsertEstimate>): Promise<Estimate | undefined> { return undefined; }
  async deleteEstimate(id: string): Promise<boolean> { return false; }
  async getEstimateItems(estimateId: string): Promise<EstimateItem[]> { return []; }
  async getEstimateItem(id: string): Promise<EstimateItem | undefined> { return undefined; }
  async createEstimateItem(item: InsertEstimateItem): Promise<EstimateItem> { throw new Error("Not implemented"); }
  async updateEstimateItem(id: string, item: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined> { return undefined; }
  async deleteEstimateItem(id: string): Promise<boolean> { return false; }
  async getEstimateGroups(estimateId: string): Promise<EstimateGroup[]> { return []; }
  async getEstimateGroup(id: string): Promise<EstimateGroup | undefined> { return undefined; }
  async createEstimateGroup(group: InsertEstimateGroup): Promise<EstimateGroup> { throw new Error("Not implemented"); }
  async updateEstimateGroup(id: string, group: Partial<InsertEstimateGroup>): Promise<EstimateGroup | undefined> { return undefined; }
  async deleteEstimateGroup(id: string): Promise<boolean> { return false; }
  async createEstimateVersion(estimateId: string, newVersionData?: Partial<InsertEstimate>): Promise<Estimate> { throw new Error("Not implemented"); }
  async lockEstimate(estimateId: string): Promise<Estimate | undefined> { return undefined; }
  async unlockEstimate(estimateId: string): Promise<Estimate | undefined> { return undefined; }
  async getEstimateSummary(estimateId: string): Promise<{ subtotal: number; markup: number; tax: number; total: number; itemCount: number; }> { 
    return { subtotal: 0, markup: 0, tax: 0, total: 0, itemCount: 0 }; 
  }
  async getCompanySettings(): Promise<CompanySettings | undefined> { return undefined; }
  async updateCompanySettings(settings: Partial<InsertCompanySettings>): Promise<CompanySettings | undefined> { return undefined; }
  async getFieldCategories(): Promise<FieldCategory[]> { return []; }
  async getFieldCategory(id: string): Promise<FieldCategory | undefined> { return undefined; }
  async getFieldCategoryByKey(key: string): Promise<FieldCategory | undefined> { return undefined; }
  async getFieldCategoryWithOptions(key: string): Promise<FieldCategoryWithOptions | undefined> { return undefined; }
  async createFieldCategory(category: InsertFieldCategory): Promise<FieldCategory> { throw new Error("Not implemented"); }
  async updateFieldCategory(id: string, category: Partial<InsertFieldCategory>): Promise<FieldCategory | undefined> { return undefined; }
  async deleteFieldCategory(id: string): Promise<boolean> { return false; }
  async getFieldOptions(categoryId: string): Promise<FieldOption[]> { return []; }
  async getFieldOption(id: string): Promise<FieldOption | undefined> { return undefined; }
  async createFieldOption(option: InsertFieldOption): Promise<FieldOption> { throw new Error("Not implemented"); }
  async updateFieldOption(id: string, option: Partial<InsertFieldOption>): Promise<FieldOption | undefined> { return undefined; }
  async deleteFieldOption(id: string): Promise<boolean> { return false; }
  async setCategoryOptions(categoryId: string, options: Array<Partial<FieldOption> & { key: string; name: string }>): Promise<FieldOption[]> { return []; }
  async getOptionAttachments(optionId: string): Promise<OptionAttachment[]> { return []; }
  async createOptionAttachment(attachment: InsertOptionAttachment): Promise<OptionAttachment> { throw new Error("Not implemented"); }
  async deleteOptionAttachment(id: string): Promise<boolean> { return false; }
  async getClientSelections(projectId: string): Promise<ClientSelection[]> { return []; }
  async createClientSelection(selection: InsertClientSelection): Promise<ClientSelection> { throw new Error("Not implemented"); }
  async deleteClientSelection(id: string): Promise<boolean> { return false; }
}

export const storage = new DbStorage();
