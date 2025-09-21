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
  type EstimateItem, type InsertEstimateItem
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private notes: Map<string, Note>;
  private customFieldDefs: Map<string, CustomFieldDef>;
  private customFieldOptions: Map<string, CustomFieldOption>;
  private noteTemplates: Map<string, NoteTemplate>;
  private projects: Map<string, Project>;
  private taskViews: Map<string, TaskView>;
  private estimates: Map<string, Estimate>;
  private estimateItems: Map<string, EstimateItem>;

  constructor() {
    this.users = new Map();
    this.notes = new Map();
    this.customFieldDefs = new Map();
    this.customFieldOptions = new Map();
    this.noteTemplates = new Map();
    this.projects = new Map();
    this.taskViews = new Map();
    this.estimates = new Map();
    this.estimateItems = new Map();
    this.initializeDefaultCustomFields();
    this.initializeDefaultProjects();
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

  // Initialize default projects including business project
  private initializeDefaultProjects() {
    const businessProject: Project = {
      id: "business",
      name: "Business Operations",
      description: "General business administration and office tasks",
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
        isActive: true,
        ownerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.projects.set(project.id, project);
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
    return this.updateTask(id, { status });
  }

  // Projects CRUD operations
  async getProjects(ownerId?: string): Promise<Project[]> {
    const allProjects = Array.from(this.projects.values())
      .filter(project => project.isActive);
    
    if (ownerId) {
      return allProjects.filter(project => 
        project.ownerId === ownerId || project.isBusiness
      ).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return allProjects.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getProject(id: string): Promise<Project | undefined> {
    return this.projects.get(id);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const id = randomUUID();
    const now = new Date();
    const project: Project = {
      ...insertProject,
      id,
      isActive: insertProject.isActive ?? true,
      isBusiness: insertProject.isBusiness ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  async updateProject(id: string, updateData: Partial<InsertProject>): Promise<Project | undefined> {
    const existingProject = this.projects.get(id);
    if (!existingProject) return undefined;

    const updatedProject: Project = {
      ...existingProject,
      ...updateData,
      updatedAt: new Date(),
    };
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
    let estimates = Array.from(this.estimates.values());
    if (projectId) {
      estimates = estimates.filter(estimate => estimate.projectId === projectId);
    }
    return estimates.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getEstimate(id: string): Promise<Estimate | undefined> {
    return this.estimates.get(id);
  }

  async createEstimate(insertEstimate: InsertEstimate): Promise<Estimate> {
    const id = randomUUID();
    const now = new Date();
    const estimate: Estimate = {
      ...insertEstimate,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.estimates.set(id, estimate);
    return estimate;
  }

  async updateEstimate(id: string, updateEstimate: Partial<InsertEstimate>): Promise<Estimate | undefined> {
    const estimate = this.estimates.get(id);
    if (!estimate) {
      return undefined;
    }
    
    const updatedEstimate: Estimate = {
      ...estimate,
      ...updateEstimate,
      updatedAt: new Date(),
    };
    this.estimates.set(id, updatedEstimate);
    return updatedEstimate;
  }

  async deleteEstimate(id: string): Promise<boolean> {
    // Delete all associated estimate items first
    const items = await this.getEstimateItems(id);
    for (const item of items) {
      await this.deleteEstimateItem(item.id);
    }
    
    return this.estimates.delete(id);
  }

  // Estimate Items CRUD operations
  async getEstimateItems(estimateId: string): Promise<EstimateItem[]> {
    const items = Array.from(this.estimateItems.values())
      .filter(item => item.estimateId === estimateId);
    return items.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  async getEstimateItem(id: string): Promise<EstimateItem | undefined> {
    return this.estimateItems.get(id);
  }

  async createEstimateItem(insertItem: InsertEstimateItem): Promise<EstimateItem> {
    const id = randomUUID();
    const now = new Date();
    
    // Calculate tax amount and price inc tax if not provided
    const priceExTax = insertItem.priceExTax || 0;
    const estimate = await this.getEstimate(insertItem.estimateId);
    const taxRate = estimate?.taxRate || 10; // Default 10% GST
    const taxAmount = Math.round(priceExTax * taxRate / 100);
    const priceIncTax = priceExTax + taxAmount;
    
    const estimateItem: EstimateItem = {
      ...insertItem,
      id,
      taxAmount,
      priceIncTax,
      createdAt: now,
      updatedAt: now,
    };
    this.estimateItems.set(id, estimateItem);
    return estimateItem;
  }

  async updateEstimateItem(id: string, updateItem: Partial<InsertEstimateItem>): Promise<EstimateItem | undefined> {
    const item = this.estimateItems.get(id);
    if (!item) {
      return undefined;
    }
    
    const updatedItem: EstimateItem = {
      ...item,
      ...updateItem,
      updatedAt: new Date(),
    };
    
    // Recalculate tax if price changed
    if (updateItem.priceExTax !== undefined) {
      const estimate = await this.getEstimate(item.estimateId);
      const taxRate = estimate?.taxRate || 10;
      updatedItem.taxAmount = Math.round(updatedItem.priceExTax * taxRate / 100);
      updatedItem.priceIncTax = updatedItem.priceExTax + updatedItem.taxAmount;
    }
    
    this.estimateItems.set(id, updatedItem);
    return updatedItem;
  }

  async deleteEstimateItem(id: string): Promise<boolean> {
    return this.estimateItems.delete(id);
  }
}

export const storage = new MemStorage();
