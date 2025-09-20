import { 
  type User, type InsertUser, 
  type Note, type InsertNote,
  type CustomFieldDef, type InsertCustomFieldDef,
  type CustomFieldOption, type InsertCustomFieldOption,
  type NoteTemplate, type InsertNoteTemplate
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
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private notes: Map<string, Note>;
  private customFieldDefs: Map<string, CustomFieldDef>;
  private customFieldOptions: Map<string, CustomFieldOption>;
  private noteTemplates: Map<string, NoteTemplate>;

  constructor() {
    this.users = new Map();
    this.notes = new Map();
    this.customFieldDefs = new Map();
    this.customFieldOptions = new Map();
    this.noteTemplates = new Map();
    this.initializeDefaultCustomFields();
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
}

export const storage = new MemStorage();
