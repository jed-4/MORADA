import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const notes = pgTable("notes", {
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
});

export type InsertNote = z.infer<typeof insertNoteSchema>;
export type Note = typeof notes.$inferSelect;

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
