import { z } from "zod";
import { storage } from "../../storage";
import type { MoradaTool } from "../types";
import { PROJECT_NOT_FOUND, projectBelongsToCompany, requiredString } from "./shared";

export const scheduleTools: MoradaTool[] = [
  {
    name: "get_schedule_items",
    description: "Get schedule items (milestones, tasks) for a specific project.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("Project ID (required)."),
      limit: z.number().describe("Max items to return (default 20).").optional(),
    }),
    scope: "read:schedule",
    mutates: false,
    permission: { key: "projects.schedule", action: "view" },
    async handler(ctx, input) {
      if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
      const limit = input.limit || 20;
      const items = await storage.getScheduleItemsByProject(input.project_id, { limit });
      return {
        success: true,
        data: (items as any[]).map((item: any) => ({
          id: item.id,
          name: item.name,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          type: item.type,
        })),
      };
    },
  },

  {
    name: "create_schedule_item",
    description: "Add a schedule item (task, milestone, or inspection) to a project schedule.",
    inputSchema: z.object({
      project_id: requiredString("project_id").describe("Project ID (required)."),
      name: requiredString("name").describe("Schedule item name (required)."),
      type: z
        .enum(["task", "milestone", "inspection", "delivery", "meeting"])
        .describe("Item type (default: task).")
        .optional(),
      start_date: requiredString("start_date").describe("Start date as YYYY-MM-DD (required)."),
      end_date: requiredString("end_date").describe("End date as YYYY-MM-DD (required)."),
    }),
    scope: "write:schedule",
    mutates: true,
    permission: { key: "projects.schedule", action: "add" },
    async handler(ctx, input) {
      if (!(await projectBelongsToCompany(ctx, input.project_id))) return PROJECT_NOT_FOUND;
      // Get or create the default schedule.
      //
      // The pre-refactor code passed `category: "construction"` here. No such
      // column exists — it is `scheduleCategory` — so the property was silently
      // discarded and the row fell back to the column defaults. The values
      // below ARE those defaults ("construction" / "offline"), so the rows this
      // writes are identical to the ones it has always written; stating them
      // explicitly is what satisfies createSchedule's parameter type.
      const schedules = await storage.getSchedulesByProject(input.project_id);
      let scheduleId: string;
      if (schedules.length) {
        scheduleId = schedules[0].id;
      } else {
        const newSchedule = await storage.createSchedule({
          projectId: input.project_id,
          name: "Main Schedule",
          scheduleCategory: "construction",
          status: "offline",
        });
        scheduleId = newSchedule.id;
      }
      const startDate = new Date(input.start_date);
      const endDate = new Date(input.end_date);
      const durationDays = Math.max(
        1,
        Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
      );
      const item = await storage.createScheduleItem({
        scheduleId,
        name: input.name,
        type: input.type || "task",
        status: "not_started",
        startDate,
        endDate,
        duration: durationDays,
      } as any);
      return {
        success: true,
        data: { id: item.id, name: item.name, message: `Schedule item "${input.name}" created.` },
      };
    },
  },
];
