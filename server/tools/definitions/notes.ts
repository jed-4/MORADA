import { z } from "zod";
import { storage } from "../../storage";
import type { MoradaTool } from "../types";
import { PROJECT_NOT_FOUND, projectBelongsToCompany, requiredString } from "./shared";

export const noteTools: MoradaTool[] = [
  {
    name: "add_project_note",
    description: "Add a note or memo to a project.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("Project ID (required)."),
      title: requiredString("title").describe("Note title."),
      content: z.string().describe("Note body.").optional(),
    }),
    scope: "write:notes",
    mutates: true,
    permission: { key: "projects.notes", action: "add" },
    async handler(ctx, input) {
      if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
      const note = await storage.createNote({
        companyId: ctx.companyId,
        projectId: input.project_id,
        title: input.title,
        content: input.content || "",
        type: "memo",
        author: ctx.userId,
        status: "active",
      } as any);
      return { success: true, data: { id: note.id, message: "Note added to project." } };
    },
  },
];
