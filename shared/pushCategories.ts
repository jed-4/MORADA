/**
 * Notification categories (#43 "reply from the notification"). The phone
 * registers these with expo-notifications and shows their action buttons on
 * the lock screen; the server only has to name the category. Keep the ids in
 * sync with expo-mobile/src/services/notificationActions.ts.
 * Ids use underscores only: expo-notifications says ":" and "-" in a category
 * id can stop the buttons appearing.
 *
 *   timesheet_approval  Approve · Open            (data.entityId = timesheet id)
 *   task                Mark done                 (data.entityId = task id)
 *   message             Reply (text input)        (data.channelId)
 */
export type PushCategoryId = "timesheet_approval" | "task" | "message";

export function pushCategoryFor(type: string | null | undefined, entityType?: string | null): PushCategoryId | undefined {
  if (type === "timesheet_submitted" && entityType === "timesheet") return "timesheet_approval";
  if ((type === "task_assigned" || type === "task_mentioned") && entityType === "task") return "task";
  if ((type === "message_new" || type === "mention") && entityType === "message") return "message";
  return undefined;
}

/** Chat notifications link to /messages?channel=<id>. */
export function channelIdFromLink(link: string): string | null {
  const m = /[?&]channel=([^&#]+)/.exec(link);
  return m ? decodeURIComponent(m[1]) : null;
}
