// Single source of truth for turning a notification (whether it arrives as a
// system push payload or is tapped in the in-app list) into a navigation
// target. Both navigationRef.navigateFromPush and NotificationsScreen use this
// so a tap lands in the exact same place either way.

export interface NotificationTargetData {
  type?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Defect pushes carry these directly: type 'defect', { projectId, defectId }. */
  projectId?: string | null;
  defectId?: string | null;
}

// Pull project and defect ids out of a web link like
// `/projects/<id>/defects/<defectId>` or `/projects/<id>/defects?defect=<id>`.
function parseDefectLink(link?: string | null): { projectId: string; defectId: string | null } | null {
  if (!link) return null;
  const m = link.match(/\/projects\/([^/?#]+)\/defects(?:\/([^/?#]+))?/);
  if (!m) return null;
  const q = link.match(/[?&]defect(?:Id)?=([^&#]+)/);
  return { projectId: m[1], defectId: m[2] || (q ? decodeURIComponent(q[1]) : null) };
}

export type NotificationTab =
  | 'Workspace'
  | 'Projects'
  | 'Messages'
  | 'Calendar'
  | 'More';

export interface NotificationTarget {
  tab: NotificationTab;
  screen?: string;
  params?: Record<string, any>;
}

// Pull the project id out of a web link like `/projects/<id>` or
// `/projects/<id>/bills/<billId>`.
function parseProjectId(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/\/projects\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Pull project and selection ids out of a web link like
// `/projects/<id>/selections/<selectionId>`.
function parseSelectionLink(link?: string | null): { projectId: string; selectionId: string } | null {
  if (!link) return null;
  const m = link.match(/\/projects\/([^/?#]+)\/selections\/([^/?#]+)/);
  return m ? { projectId: m[1], selectionId: m[2] } : null;
}

// Pull the channel id out of a web link like `/messages?channel=<id>`.
function parseChannelId(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/[?&]channel=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function resolveNotificationTarget(
  data: NotificationTargetData | null | undefined,
): NotificationTarget {
  const type = typeof data?.type === 'string' ? data.type : '';
  const entityType = typeof data?.entityType === 'string' ? data.entityType : '';
  const entityId = data?.entityId ?? null;
  const link = data?.link ?? null;

  // Messages / mentions -> open the exact chat thread (loads by channelId; the
  // header tolerates a missing channelName).
  if (
    entityType === 'message' ||
    type === 'mention' ||
    (link && link.startsWith('/messages'))
  ) {
    const channelId = parseChannelId(link) || entityId;
    if (channelId) {
      return { tab: 'Messages', screen: 'MessageThread', params: { channelId } };
    }
    return { tab: 'Messages', screen: 'MessagesList' };
  }

  // Timesheets
  if (
    entityType === 'timesheet' ||
    type.startsWith('timesheet_') ||
    (link && link.startsWith('/timesheets'))
  ) {
    return { tab: 'More', screen: 'Timesheets' };
  }

  // Reminders -> calendar
  if (type === 'reminder' || type === 'reminder_due') {
    return { tab: 'Calendar' };
  }

  // Tasks & checklists -> tasks list (no per-task detail screen on mobile yet)
  if (
    entityType === 'task' ||
    entityType === 'checklist_item' ||
    entityType === 'checklist_group' ||
    type.startsWith('task_') ||
    type.startsWith('checklist')
  ) {
    return { tab: 'More', screen: 'Tasks' };
  }

  // Defects (transition, comment, @mention) -> that defect. Push payloads carry
  // { projectId, defectId }; in-app rows may only have entityId and a link.
  const defectLink = parseDefectLink(link);
  if (type === 'defect' || type.startsWith('defect_') || entityType === 'defect' || defectLink) {
    const defectId =
      (typeof data?.defectId === 'string' && data.defectId) ||
      (entityType === 'defect' ? entityId : null) ||
      defectLink?.defectId ||
      null;
    const projectId =
      (typeof data?.projectId === 'string' && data.projectId) || defectLink?.projectId || parseProjectId(link);
    if (defectId) {
      return {
        tab: 'Projects',
        screen: 'DefectDetail',
        params: { defectId, ...(projectId ? { projectId } : {}) },
      };
    }
    if (projectId) return { tab: 'Projects', screen: 'DefectsList', params: { projectId } };
  }

  // Selections (a client's choice or comment, a builder comment) -> that
  // selection, not just its project. The screen loads by id; the project id
  // seeds its offline cache.
  const selectionLink = parseSelectionLink(link);
  if (selectionLink) {
    return {
      tab: 'Projects',
      screen: 'SelectionDetail',
      params: { selectionId: selectionLink.selectionId, projectId: selectionLink.projectId },
    };
  }

  // Anything that points at a project (project assignment, a bill on a project,
  // etc.) -> that project's detail screen.
  const projectId =
    parseProjectId(link) || (entityType === 'project' ? entityId : null);
  if (projectId) {
    return { tab: 'Projects', screen: 'ProjectDetail', params: { projectId } };
  }

  // Fallback: the in-app notifications list.
  return { tab: 'Workspace', screen: 'Notifications' };
}
