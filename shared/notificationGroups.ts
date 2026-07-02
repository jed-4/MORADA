// Canonical grouping of in-app notification "type" strings into a few broad
// buckets that a user can individually mute for mobile push. The server uses
// this mapping to decide whether to dispatch a push (see
// server/utils/pushNotifications.ts); the mobile Settings screen mirrors the
// group keys/labels to render the on/off toggles. Keep the group KEYS in sync
// with expo-mobile/src/screens/SettingsScreen.tsx.

export type PushNotificationGroupKey =
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
