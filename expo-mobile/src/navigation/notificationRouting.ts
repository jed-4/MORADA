// Single source of truth for turning a notification (whether it arrives as a
// system push payload or is tapped in the in-app list) into a navigation
// target. Both navigationRef.navigateFromPush and NotificationsScreen use this
// so a tap lands in the exact same place either way.

export interface NotificationTargetData {
  type?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
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
