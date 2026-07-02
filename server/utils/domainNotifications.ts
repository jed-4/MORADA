import { storage } from "../storage";
import { emitNotification } from "../socketManager";
import { parseMentionUserIds, buildContentPreview } from "./mentions";

// Domain-specific notification fan-out helpers. Each helper is defensive: it
// wraps its own work in try/catch and never throws, so a notification failure
// can't break the underlying request. Every notification row created here also
// triggers a mobile push via storage.createNotification's hook.

function uniqueDefined(ids: (string | null | undefined)[]): string[] {
  return Array.from(new Set(ids.filter((v): v is string => !!v)));
}

async function safeCreate(notification: {
  userId: string;
  companyId: string;
  type: string;
  title: string;
  message?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  createdByUserId?: string | null;
}): Promise<void> {
  try {
    const created = await storage.createNotification({
      isRead: false,
      ...notification,
    } as any);
    emitNotification(notification.userId, created);
  } catch (err) {
    console.error(`[Notify] Failed to create ${notification.type} notification:`, err);
  }
}

// ---------------------------------------------------------------------------
// Tasks (tasks are notes with type="task")
// ---------------------------------------------------------------------------

export async function notifyTaskCompleted(params: {
  task: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { task, actorUserId, companyId, actorName } = params;
  try {
    if (!task || !companyId) return;
    // Notify the person who created/assigned the task (owner). Skip if the
    // owner is the one who completed it.
    const ownerId = task.ownerId as string | null;
    if (!ownerId || ownerId === actorUserId) return;

    const link = task.projectId
      ? `/projects/${task.projectId}/tasks`
      : `/workspace/tasks`;
    await safeCreate({
      userId: ownerId,
      companyId,
      type: "task_completed",
      title: "Task Completed",
      message: `${actorName} completed the task "${task.title}"`,
      link,
      entityType: "task",
      entityId: task.id,
      createdByUserId: actorUserId,
    });
  } catch (err) {
    console.error("[Notify] notifyTaskCompleted failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Timesheets
// ---------------------------------------------------------------------------

export async function notifyTimesheetSubmitted(params: {
  timesheet: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { timesheet, actorUserId, companyId, actorName } = params;
  try {
    if (!timesheet || !companyId) return;
    const users = await storage.getUsersByCompany(companyId);
    const link = timesheet.projectId
      ? `/projects/${timesheet.projectId}/timesheets`
      : `/business/timesheets`;

    for (const u of users) {
      if (u.id === actorUserId) continue; // never notify the submitter
      const canApprove = await storage.canUserApproveTimesheets(u.id);
      if (!canApprove) continue;
      await safeCreate({
        userId: u.id,
        companyId,
        type: "timesheet_submitted",
        title: "Timesheet Submitted",
        message: `${actorName} submitted a timesheet for approval`,
        link,
        entityType: "timesheet",
        entityId: timesheet.id,
        createdByUserId: actorUserId,
      });
    }
  } catch (err) {
    console.error("[Notify] notifyTimesheetSubmitted failed:", err);
  }
}

export async function notifyTimesheetApproved(params: {
  timesheet: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { timesheet, actorUserId, companyId, actorName } = params;
  try {
    if (!timesheet?.userId || !companyId) return;
    if (timesheet.userId === actorUserId) return; // approver approving own sheet
    const link = timesheet.projectId
      ? `/projects/${timesheet.projectId}/timesheets`
      : `/business/timesheets`;
    await safeCreate({
      userId: timesheet.userId,
      companyId,
      type: "timesheet_approved",
      title: "Timesheet Approved",
      message: `${actorName} approved your timesheet`,
      link,
      entityType: "timesheet",
      entityId: timesheet.id,
      createdByUserId: actorUserId,
    });
  } catch (err) {
    console.error("[Notify] notifyTimesheetApproved failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Notes (workspace notes / site-diary style rich text)
// ---------------------------------------------------------------------------

function collectNoteAssignees(note: any): string[] {
  if (!note) return [];
  const ids: (string | null | undefined)[] = [];
  if (Array.isArray(note.assigneeIds)) ids.push(...note.assigneeIds);
  if (note.assigneeId) ids.push(note.assigneeId);
  return uniqueDefined(ids);
}

function collectNoteMentions(note: any): string[] {
  if (!note) return [];
  return uniqueDefined([
    ...parseMentionUserIds(note.contentHtml),
    ...parseMentionUserIds(note.content),
  ]);
}

/**
 * Notify users newly assigned to, or newly @mentioned in, a note. On create,
 * `previous` is undefined so everyone counts as new; on update, only the delta
 * against the previous assignees/mentions is notified. The acting user is never
 * notified, and a user assigned + mentioned in the same save only gets the
 * assignment notification.
 */
export async function notifyNoteAssignmentAndMentions(params: {
  note: any;
  previous?: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { note, previous, actorUserId, companyId, actorName } = params;
  try {
    if (!note || !companyId) return;

    const prevAssignees = new Set(previous ? collectNoteAssignees(previous) : []);
    const prevMentions = new Set(previous ? collectNoteMentions(previous) : []);

    const newAssignees = collectNoteAssignees(note).filter((id) => !prevAssignees.has(id));
    const newMentions = collectNoteMentions(note).filter((id) => !prevMentions.has(id));

    const link = note.projectId
      ? `/projects/${note.projectId}/notes`
      : `/workspace/notes`;
    const notified = new Set<string>([actorUserId]);

    for (const uid of newAssignees) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      await safeCreate({
        userId: uid,
        companyId,
        type: "note_assigned",
        title: "Assigned to a note",
        message: `${actorName} assigned you to "${note.title}"`,
        link,
        entityType: "note",
        entityId: note.id,
        createdByUserId: actorUserId,
      });
    }

    for (const uid of newMentions) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      await safeCreate({
        userId: uid,
        companyId,
        type: "note_mention",
        title: "Mentioned in a note",
        message: `${actorName} mentioned you in "${note.title}"`,
        link,
        entityType: "note",
        entityId: note.id,
        createdByUserId: actorUserId,
      });
    }
  } catch (err) {
    console.error("[Notify] notifyNoteAssignmentAndMentions failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Site diary entries
// ---------------------------------------------------------------------------

function collectSiteDiaryNotifyIds(entry: any): string[] {
  if (!entry) return [];
  const raw = entry.notifyUserIds;
  const arr = Array.isArray(raw) ? raw : [];
  return uniqueDefined(arr.map((v: any) => (typeof v === "string" ? v : null)));
}

function collectSiteDiaryMentions(entry: any): string[] {
  if (!entry) return [];
  // Field values hold the rich-text body; scan the serialized JSON for mention
  // markup rather than trying to know each template field's shape.
  let serialized = "";
  try {
    serialized = JSON.stringify(entry.fieldValues ?? {});
  } catch {
    serialized = "";
  }
  return uniqueDefined([
    ...parseMentionUserIds(serialized),
    ...parseMentionUserIds(entry.title),
  ]);
}

export async function notifySiteDiaryAssignmentAndMentions(params: {
  entry: any;
  previous?: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { entry, previous, actorUserId, companyId, actorName } = params;
  try {
    if (!entry || !companyId) return;

    const prevNotify = new Set(previous ? collectSiteDiaryNotifyIds(previous) : []);
    const prevMentions = new Set(previous ? collectSiteDiaryMentions(previous) : []);

    const newNotify = collectSiteDiaryNotifyIds(entry).filter((id) => !prevNotify.has(id));
    const newMentions = collectSiteDiaryMentions(entry).filter((id) => !prevMentions.has(id));

    const link = entry.projectId ? `/projects/${entry.projectId}/site-diary` : null;
    const notified = new Set<string>([actorUserId]);

    for (const uid of newNotify) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      await safeCreate({
        userId: uid,
        companyId,
        type: "note_assigned",
        title: "Site diary entry",
        message: `${actorName} added you to the site diary "${entry.title}"`,
        link,
        entityType: "site_diary",
        entityId: entry.id,
        createdByUserId: actorUserId,
      });
    }

    for (const uid of newMentions) {
      if (notified.has(uid)) continue;
      notified.add(uid);
      await safeCreate({
        userId: uid,
        companyId,
        type: "note_mention",
        title: "Mentioned in a site diary",
        message: `${actorName} mentioned you in "${entry.title}"`,
        link,
        entityType: "site_diary",
        entityId: entry.id,
        createdByUserId: actorUserId,
      });
    }
  } catch (err) {
    console.error("[Notify] notifySiteDiaryAssignmentAndMentions failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Schedule items
// ---------------------------------------------------------------------------

/**
 * Schedule items store their assignee as a contacts.id (assignedToId), not a
 * user id. Resolve the contact to a linked application user by matching the
 * contact's email to a user in the same company. Returns null when the contact
 * has no email or no matching user account.
 */
async function resolveContactUserId(
  contactId: string | null | undefined,
  companyId: string,
): Promise<string | null> {
  try {
    if (!contactId || contactId.startsWith("company:")) return null;
    const contact = await storage.getContact(contactId, companyId);
    if (!contact?.email) return null;
    const user = await storage.getUserByEmail(contact.email);
    if (!user || user.companyId !== companyId) return null;
    return user.id;
  } catch {
    return null;
  }
}

/**
 * Notify the user linked to a schedule item's assignee when they are newly
 * assigned, or when a key field (date/status) changes on an item they're
 * already assigned to. Skips the actor and no-ops when the assignee can't be
 * resolved to a user account.
 */
export async function notifyScheduleItemChange(params: {
  item: any;
  previous: any;
  actorUserId: string;
  companyId: string;
  actorName: string;
}): Promise<void> {
  const { item, previous, actorUserId, companyId, actorName } = params;
  try {
    if (!item || !companyId) return;

    const prevAssignee = previous?.assignedToId ?? null;
    const newAssignee = item.assignedToId ?? null;
    const assigneeAdded = !!newAssignee && newAssignee !== prevAssignee;

    const dateChanged =
      String(previous?.startDate ?? "") !== String(item.startDate ?? "") ||
      String(previous?.endDate ?? "") !== String(item.endDate ?? "");
    const statusChanged = (previous?.status ?? null) !== (item.status ?? null);
    const keyFieldsChanged = dateChanged || statusChanged;

    if (!assigneeAdded && !keyFieldsChanged) return;
    // If there's no current assignee, there's nobody to notify.
    if (!newAssignee) return;

    const targetUserId = await resolveContactUserId(newAssignee, companyId);
    if (!targetUserId || targetUserId === actorUserId) return;

    // Resolve the project for a valid deep link.
    let projectId: string | null = null;
    try {
      if (item.scheduleId) {
        const schedule = await storage.getScheduleById(item.scheduleId);
        projectId = (schedule as any)?.projectId ?? null;
      }
    } catch {
      projectId = null;
    }
    const link = projectId ? `/projects/${projectId}/schedule` : null;

    if (assigneeAdded) {
      await safeCreate({
        userId: targetUserId,
        companyId,
        type: "schedule_assigned",
        title: "Assigned to a schedule item",
        message: `${actorName} assigned you to "${item.name || item.title || "a schedule item"}"`,
        link,
        entityType: "schedule_item",
        entityId: item.id,
        createdByUserId: actorUserId,
      });
    } else {
      await safeCreate({
        userId: targetUserId,
        companyId,
        type: "schedule_changed",
        title: "Schedule item updated",
        message: `${actorName} updated "${item.name || item.title || "a schedule item"}"`,
        link,
        entityType: "schedule_item",
        entityId: item.id,
        createdByUserId: actorUserId,
      });
    }
  } catch (err) {
    console.error("[Notify] notifyScheduleItemChange failed:", err);
  }
}
