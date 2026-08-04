import { z } from "zod";
import { storage } from "../../storage";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import type { MoradaTool } from "../types";
import { PROJECT_NOT_FOUND, projectBelongsToCompany, requiredString } from "./shared";

export const siteTools: MoradaTool[] = [
  {
    name: "get_site_diary_entries",
    description: "Get recent site diary entries. Optionally filter to a specific project.",
    inputSchema: z.object({
      project_id: z.string().describe("Optional: scope to one project.").optional(),
      limit: z.number().describe("Max entries to return (default 10).").optional(),
    }),
    scope: "read:site",
    mutates: false,
    permission: { key: "projects.site_diary", action: "view" },
    async handler(ctx, input) {
      const limit = input.limit || 10;
      let entries: any[];
      if (input.project_id) {
        if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
        entries = await storage.getSiteDiaryEntries(input.project_id);
      } else {
        entries = await storage.getSiteDiaryEntriesByCompany(ctx.companyId);
      }
      return {
        success: true,
        data: entries.slice(0, limit).map((e: any) => ({
          id: e.id,
          date: e.date || e.createdAt,
          projectId: e.projectId,
          content: e.content || e.description || "",
          weather: e.weather,
        })),
      };
    },
  },

  {
    name: "create_site_diary_entry",
    description: "Create a site diary entry for a project.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("Project ID (required)."),
      content: requiredString("content").describe("Site diary content."),
      date: z.string().describe("Date as YYYY-MM-DD. Defaults to today.").optional(),
    }),
    scope: "write:site",
    mutates: true,
    permission: { key: "projects.site_diary", action: "add" },
    async handler(ctx, input) {
      if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
      // Find the default site diary template for the company
      const template = await storage.getDefaultSiteDiaryTemplate(ctx.companyId);
      if (!template) {
        return {
          success: false,
          error:
            "No site diary template is configured for this company. Please set up a site diary template first.",
        };
      }
      const entryDate = input.date ? new Date(input.date) : new Date();
      const entry = await storage.createSiteDiaryEntry({
        templateId: template.id,
        templateName: template.name ?? null,
        projectId: input.project_id,
        title: `Site Diary — ${entryDate.toLocaleDateString("en-AU")}`,
        entryDateTime: entryDate,
        fieldValues: { ai_notes: input.content },
        createdBy: ctx.userId,
        createdByName: null,
        notifyUserIds: [] as string[],
        attachments: [] as string[],
        overallPhotos: [] as string[],
        labels: [] as string[],
        shareWithClient: false,
      } as any);
      return { success: true, data: { id: entry.id, message: "Site diary entry created." } };
    },
  },

  {
    name: "get_channel_messages",
    description:
      "Read recent messages from a project channel or company channel. Use to understand what has been discussed recently.",
    inputSchema: z.object({
      project_id: z.string().describe("Optional: scope to channels for this project.").optional(),
      limit: z.number().describe("Max messages to return (default 15).").optional(),
    }),
    scope: "read:messages",
    mutates: false,
    permission: { key: "projects.messages", action: "view" },
    async handler(ctx, input) {
      const limit = input.limit || 15;
      const filters: any = { type: "project" };
      if (input.project_id) {
        if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
        filters.projectId = input.project_id;
      }
      // getChannels applies the caller's own channel visibility, so this cannot
      // surface a channel the acting user is not a member of.
      const channels = await storage.getChannels(ctx.companyId, ctx.userId, filters);
      if (!channels.length) return { success: true, data: [] };
      const channelId = channels[0].id;
      const msgs = await db
        .select({
          id: schema.messages.id,
          content: schema.messages.content,
          createdAt: schema.messages.createdAt,
          userId: schema.messages.userId,
          channelId: schema.messages.channelId,
        })
        .from(schema.messages)
        .where(eq(schema.messages.channelId, channelId))
        .orderBy(desc(schema.messages.createdAt))
        .limit(limit);
      return { success: true, data: msgs.reverse() };
    },
  },
];
