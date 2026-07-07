import type { Tool } from "@anthropic-ai/sdk/resources";

export const AI_TOOLS: Tool[] = [
  // ── READ TOOLS ──────────────────────────────────────────────────────────────

  {
    name: "get_business_overview",
    description:
      "Get a live snapshot of the business: active project count, overdue tasks, unpaid bills, overdue client invoices, and open blocked items. Use this to orient before answering broad questions.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  {
    name: "get_projects",
    description:
      "List active projects with name, status, progress percentage, start/end dates, and contract cost in cents. Pass include_leads=true to also return pipeline/lead projects.",
    input_schema: {
      type: "object" as const,
      properties: {
        include_leads: { type: "boolean", description: "Include pipeline/lead projects." },
      },
      required: [],
    },
  },

  {
    name: "get_project_detail",
    description:
      "Get detailed information about a specific project including financials, progress, contacts, and schedule summary.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project ID to look up." },
      },
      required: ["project_id"],
    },
  },

  {
    name: "get_tasks",
    description:
      "Get tasks for the company. Use filter='overdue' for past-due tasks, 'due_this_week' for upcoming, 'all' for both. Optionally filter to a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        filter: { type: "string", enum: ["overdue", "due_this_week", "all"] },
        project_id: { type: "string", description: "Optional: scope to one project." },
        limit: { type: "number", description: "Max number to return (default 20)." },
      },
      required: [],
    },
  },

  {
    name: "get_bills",
    description:
      "Get bills for the company. Use status='unpaid' or 'overdue' to find outstanding amounts. Bill amounts are in cents.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["all", "unpaid", "overdue"] },
        project_id: { type: "string", description: "Optional: scope to one project." },
        limit: { type: "number" },
      },
      required: [],
    },
  },

  {
    name: "get_client_invoices",
    description:
      "Get client invoices. Use status='overdue' for past-due, 'draft' for unsent, 'sent' for outstanding. Amounts in cents.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", enum: ["all", "overdue", "sent", "draft", "paid"] },
        project_id: { type: "string", description: "Optional: scope to one project." },
      },
      required: [],
    },
  },

  {
    name: "get_estimates",
    description:
      "Get estimates (quotes) for a specific project. Returns estimate name, status, and total value in cents.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID (required)." },
      },
      required: ["project_id"],
    },
  },

  {
    name: "get_team",
    description:
      "Get team members of this company and their roles.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  {
    name: "get_schedule_items",
    description:
      "Get schedule items (milestones, tasks) for a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID (required)." },
        limit: { type: "number", description: "Max items to return (default 20)." },
      },
      required: ["project_id"],
    },
  },

  {
    name: "get_site_diary_entries",
    description:
      "Get recent site diary entries. Optionally filter to a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Optional: scope to one project." },
        limit: { type: "number", description: "Max entries to return (default 10)." },
      },
      required: [],
    },
  },

  {
    name: "get_channel_messages",
    description:
      "Read recent messages from a project channel or company channel. Use to understand what has been discussed recently.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Optional: scope to channels for this project." },
        limit: { type: "number", description: "Max messages to return (default 15)." },
      },
      required: [],
    },
  },

  {
    name: "get_blocked_items",
    description: "Get open (unresolved) blocked items previously logged in AI conversations.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },

  // ── WRITE TOOLS ─────────────────────────────────────────────────────────────

  {
    name: "create_task",
    description:
      "Create a new task. Use when the user asks to add or create a task, action item, or to-do.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title (required)." },
        project_id: { type: "string", description: "Project to attach to." },
        due_date: { type: "string", description: "Due date as YYYY-MM-DD." },
        assignee_name: { type: "string", description: "Name of person to assign to." },
      },
      required: ["title"],
    },
  },

  {
    name: "update_task",
    description:
      "Update an existing task's status, due date, or assignee.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to update (required)." },
        status: { type: "string", enum: ["todo", "in-progress", "done"] },
        due_date: { type: "string", description: "New due date as YYYY-MM-DD." },
        assignee_name: { type: "string", description: "New assignee name." },
      },
      required: ["task_id"],
    },
  },

  {
    name: "create_schedule_item",
    description:
      "Add a schedule item (task, milestone, or inspection) to a project schedule.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID (required)." },
        name: { type: "string", description: "Schedule item name (required)." },
        type: {
          type: "string",
          enum: ["task", "milestone", "inspection", "delivery", "meeting"],
          description: "Item type (default: task).",
        },
        start_date: { type: "string", description: "Start date as YYYY-MM-DD (required)." },
        end_date: { type: "string", description: "End date as YYYY-MM-DD (required)." },
      },
      required: ["project_id", "name", "start_date", "end_date"],
    },
  },

  {
    name: "log_blocked_item",
    description:
      "Log a blocked item — something stuck, blocked, or needing follow-up.",
    input_schema: {
      type: "object" as const,
      properties: {
        description: { type: "string", description: "Description of what is blocked." },
      },
      required: ["description"],
    },
  },

  {
    name: "resolve_blocked_item",
    description: "Mark a previously logged blocked item as resolved.",
    input_schema: {
      type: "object" as const,
      properties: {
        blocked_item_id: { type: "string", description: "ID of the blocked item to resolve." },
      },
      required: ["blocked_item_id"],
    },
  },

  {
    name: "add_project_note",
    description:
      "Add a note or memo to a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID (required)." },
        title: { type: "string", description: "Note title." },
        content: { type: "string", description: "Note body." },
      },
      required: ["project_id", "title"],
    },
  },

  {
    name: "create_site_diary_entry",
    description:
      "Create a site diary entry for a project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project ID (required)." },
        content: { type: "string", description: "Site diary content." },
        date: { type: "string", description: "Date as YYYY-MM-DD. Defaults to today." },
      },
      required: ["project_id", "content"],
    },
  },
];
