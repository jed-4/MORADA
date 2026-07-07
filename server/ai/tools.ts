import type { Tool } from "@anthropic-ai/sdk/resources";

export const AI_TOOLS: Tool[] = [
  {
    name: "get_business_overview",
    description:
      "Get a live snapshot of the business: active project count, overdue tasks, unpaid bills, overdue client invoices, and open blocked items. Use this at the start of a conversation or when the user asks about their business.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_projects",
    description:
      "Get active projects with name, status, progress percentage, start/end dates, and contract cost (in cents). Set include_leads=true to also return pipeline/lead projects.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["all", "lead", "pre_construction", "construction", "post_construction"],
          description: "Filter by phase. Default: all non-lead active projects.",
        },
        include_leads: {
          type: "boolean",
          description: "Include pipeline/lead projects.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_tasks",
    description:
      "Get tasks for the company. Use filter='overdue' for overdue tasks, 'due_this_week' for upcoming tasks, or 'all' for both. Optionally pass project_id to scope to one project.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: {
          type: "string",
          enum: ["overdue", "due_this_week", "all"],
          description: "Which tasks to return.",
        },
        project_id: {
          type: "string",
          description: "Optional: filter to a specific project.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_bills",
    description:
      "Get bills for the company. Use status='unpaid' or 'overdue' to find outstanding bills. Bill amounts are stored in cents.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["all", "unpaid", "overdue"],
          description: "Filter by payment status.",
        },
        project_id: {
          type: "string",
          description: "Optional: filter to a specific project.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_client_invoices",
    description:
      "Get client invoices for the company. Use status='overdue' to find invoices that are past due. Amounts in cents.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          enum: ["all", "overdue", "sent", "draft", "paid"],
          description: "Filter by status.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_blocked_items",
    description:
      "Get open (unresolved) blocked items previously logged in AI conversations. These are things that are stuck or need follow-up.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "create_task",
    description:
      "Create a new task. Use this when the user asks to add, create, or log a task or to-do item.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title (required)." },
        project_id: { type: "string", description: "Project ID to attach to. Optional." },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD. Optional." },
        assignee_name: { type: "string", description: "Name of the person to assign to. Optional." },
      },
      required: ["title"],
    },
  },
  {
    name: "log_blocked_item",
    description:
      "Log a blocked item — something stuck, blocked, or needs follow-up. Use when the user mentions a problem, dependency, or thing that isn't moving.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: {
          type: "string",
          description: "Clear description of what is blocked or needs attention.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "create_site_diary_entry",
    description:
      "Create a site diary entry for a project. Use when the user wants to log what happened on site today or record site activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID to log the entry for (required)." },
        content: { type: "string", description: "Content / notes for the site diary entry." },
        date: { type: "string", description: "Date as YYYY-MM-DD. Defaults to today." },
      },
      required: ["project_id", "content"],
    },
  },
];
