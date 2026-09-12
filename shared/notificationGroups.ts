// Canonical grouping of in-app notification "type" strings into a few broad
// buckets that a user can individually mute for mobile push. The server uses
// this mapping to decide whether to dispatch a push (see
// server/utils/pushNotifications.ts); the mobile Settings screen mirrors the
// group keys/labels to render the on/off toggles. Keep the group KEYS in sync
// with expo-mobile/src/screens/SettingsScreen.tsx.

export type PushNotificationGroupKey =
  | "clientDecisions"
  | "tasks"
  | "messages"
  | "notes"
  | "schedule"
  | "timesheets"
  | "payments"
  | "projects"
  | "reminders";

export interface PushNotificationGroup {
  key: PushNotificationGroupKey;
  label: string;
  description: string;
  types: string[];
}

export const PUSH_NOTIFICATION_GROUPS: PushNotificationGroup[] = [
  {
    key: "clientDecisions",
    label: "Client decisions",
    description: "When a client approves, rejects or responds to something you sent them.",
    types: [
      "variation_client_approved",
      "variation_client_rejected",
      // Already fired but never grouped, so it could not be muted and never
      // qualified for email.
      "selection_client_choice",
      "selection_client_comment",
    ],
  },
  {
    key: "tasks",
    label: "Tasks & checklists",
    description: "When a task or checklist is assigned to you, completed, or mentions you.",
    types: [
      "task_assigned",
      "task_completed",
      "task_mentioned",
      "checklist_assigned",
      "checklist_item_assigned",
    ],
  },
  {
    key: "messages",
    label: "Messages & mentions",
    description: "New chat messages and when someone mentions you.",
    types: ["mention", "message_new"],
  },
  {
    key: "notes",
    label: "Notes & site diary",
    description: "When you're assigned to or mentioned in a note or site diary entry.",
    types: ["note_assigned", "note_mention"],
  },
  {
    key: "schedule",
    label: "Schedule",
    description: "When a schedule item is assigned to you or changes.",
    types: ["schedule_assigned", "schedule_changed"],
  },
  {
    key: "timesheets",
    label: "Timesheets",
    description: "Timesheet approvals, rejections, and overtime reminders.",
    types: [
      "timesheet_submitted",
      "timesheet_approved",
      "timesheet_rejected",
      "timesheet_overtime",
    ],
  },
  {
    key: "payments",
    label: "Payments & reimbursements",
    description: "Updates on your expense reimbursements.",
    types: [
      "reimbursement_approved",
      "reimbursement_paid",
      "reimbursement_rejected",
    ],
  },
  {
    key: "projects",
    label: "Projects",
    description: "When you're added to a project.",
    types: ["project_assigned"],
  },
  {
    key: "reminders",
    label: "Reminders",
    description: "Your scheduled reminders.",
    types: ["reminder", "reminder_due"],
  },
];

const TYPE_TO_GROUP: Record<string, PushNotificationGroupKey> = (() => {
  const map: Record<string, PushNotificationGroupKey> = {};
  for (const group of PUSH_NOTIFICATION_GROUPS) {
    for (const type of group.types) map[type] = group.key;
  }
  return map;
})();

/**
 * Returns the push group key for a notification type, or null when the type
 * isn't mapped to any group. Unmapped types have no group and are always sent
 * (they can't be muted), so new notification types keep working until they're
 * explicitly added to a group here.
 */
export function getPushGroupForType(
  type: string | null | undefined,
): PushNotificationGroupKey | null {
  if (!type) return null;
  return TYPE_TO_GROUP[type] ?? null;
}

// viewKey used in the shared user_view_preferences store to persist a user's
// muted push groups: { mutedGroups: PushNotificationGroupKey[] }.
export const PUSH_PREFS_VIEW_KEY = "push-notification-prefs";

export interface PushPreferences {
  mutedGroups: PushNotificationGroupKey[];
}

/* ── Email ────────────────────────────────────────────────────────────────── */

/**
 * Email is OPT-IN per group, stored alongside the push mutes in the same
 * user_view_preferences row.
 *
 * Opt-in rather than opt-out because an in-app notification you miss costs you
 * nothing, and an email you did not ask for costs you attention every time.
 * The exception is below.
 */
export interface EmailNotificationPreferences {
  emailGroups: PushNotificationGroupKey[];
}

/**
 * Groups that email by default.
 *
 * Only client decisions. Everything else in this list happens while you are
 * working and the bell is enough; a client signing a variation happens on their
 * schedule, often out of hours, and is the one event you are actually waiting
 * on. A builder who disagrees turns it off in one click.
 */
export const DEFAULT_EMAIL_GROUPS: PushNotificationGroupKey[] = ["clientDecisions"];

/** Whether `type` should email this user, given their saved opt-ins. */
export function shouldEmailForType(
  type: string | null | undefined,
  emailGroups: string[] | null | undefined,
): boolean {
  const group = getPushGroupForType(type);
  // An ungrouped type has no toggle in the notification centre, so emailing
  // for it would be an email nobody can turn off.
  if (!group) return false;
  const chosen = Array.isArray(emailGroups) ? emailGroups : DEFAULT_EMAIL_GROUPS;
  return chosen.includes(group);
}
