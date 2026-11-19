/**
 * Notification action buttons (#43 "reply from the notification", #46 site prompts).
 *
 * Categories are registered once at startup. Category ids use underscores only
 * (expo-notifications: ":" or "-" in an id can stop the buttons appearing).
 * The SERVER names the category on its pushes (server/utils/pushNotifications.ts,
 * shared/pushCategories.ts) — keep the ids in sync.
 *
 * Every action opens the app (opensAppToForeground: true). That is slower than
 * acting in the background but it is reliable: the JS runtime is guaranteed to
 * be up with a session, and the person sees the result or the error.
 */
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiFetch, apiRequest, ApiError } from './api';
import { clockInNow, clockOutNow, lastCostCodeFor } from './clockActions';
import { refreshSiteFences } from './siteGeofence';
import { doneStatusKey, type TaskStatusOption } from '../lib/taskStatus';
import { haptic } from '../lib/haptics';

export const CATEGORY = {
  siteArrival: 'site_arrival',
  siteLeave: 'site_leave',
  siteSwitch: 'site_switch',
  timesheetApproval: 'timesheet_approval',
  task: 'task',
  message: 'message',
} as const;

const ACTION = {
  clockIn: 'clock_in',
  openDiary: 'open_diary',
  clockOut: 'clock_out',
  switchJob: 'switch_job',
  approve: 'approve',
  open: 'open',
  markDone: 'mark_done',
  reply: 'reply',
} as const;

const fg = { opensAppToForeground: true };

let registered = false;
export async function registerNotificationCategories(): Promise<void> {
  if (registered) return;
  registered = true;
  const set = (id: string, actions: Notifications.NotificationAction[]) =>
    Notifications.setNotificationCategoryAsync(id, actions).catch(err => console.warn('[Notify] category', id, err));
  await Promise.all([
    set(CATEGORY.siteArrival, [
      { identifier: ACTION.clockIn, buttonTitle: 'Clock in', options: fg },
      { identifier: ACTION.openDiary, buttonTitle: 'Open diary', options: fg },
    ]),
    set(CATEGORY.siteLeave, [{ identifier: ACTION.clockOut, buttonTitle: 'Clock out', options: fg }]),
    set(CATEGORY.siteSwitch, [{ identifier: ACTION.switchJob, buttonTitle: 'Switch', options: fg }]),
    set(CATEGORY.timesheetApproval, [
      { identifier: ACTION.approve, buttonTitle: 'Approve', options: fg },
      { identifier: ACTION.open, buttonTitle: 'Open', options: fg },
    ]),
    set(CATEGORY.task, [{ identifier: ACTION.markDone, buttonTitle: 'Mark done', options: fg }]),
    set(CATEGORY.message, [
      {
        identifier: ACTION.reply,
        buttonTitle: 'Reply',
        textInput: { submitButtonTitle: 'Send', placeholder: 'Reply…' },
        options: fg,
      },
    ]),
  ]);
}

type Navigate = (name: string, params?: any) => void;

const done = (title: string, message?: string) => {
  haptic.success();
  Alert.alert(title, message);
};
const failed = (title: string, err: unknown) =>
  Alert.alert(title, err instanceof Error ? err.message : 'Please try again.');

const openTimesheets = (navigate: Navigate) => navigate('Main', { screen: 'More', params: { screen: 'Timesheets' } });

async function clockInTo(projectId: string, projectName: string | undefined, navigate: Navigate, clientTime: string) {
  const costCodeId = await lastCostCodeFor(projectId);
  if (!costCodeId) {
    // No cost code on record for this job — ask on the Timesheets screen.
    openTimesheets(navigate);
    Alert.alert('Choose a cost code', `Pick the job and cost code to clock in to ${projectName || 'this job'}.`);
    return;
  }
  const result = await clockInNow({ projectId, costCodeId, clientTime });
  refreshSiteFences().catch(() => {});
  done(
    result === 'queued' ? 'Clock-in saved offline' : 'Clocked in',
    result === 'queued' ? 'It will send when you have signal, at the time you tapped.' : projectName,
  );
}

/**
 * Handle a tapped action. Returns true when handled here (the caller then
 * skips its normal "open the screen" routing).
 */
export async function handleNotificationAction(
  response: Notifications.NotificationResponse,
  navigate: Navigate,
): Promise<boolean> {
  const action = response.actionIdentifier;
  const data = (response.notification?.request?.content?.data || {}) as Record<string, any>;
  const category = response.notification?.request?.content?.categoryIdentifier || '';
  // The tap time — the clock time rule (#438): when the button was pressed.
  const tappedAt = new Date().toISOString();
  const isDefault = action === Notifications.DEFAULT_ACTION_IDENTIFIER;
  const siteKind = typeof data.kind === 'string' && data.kind.startsWith('site_') ? data.kind : null;

  try {
    // ── Site prompts (local notifications) ──
    if (siteKind) {
      if (isDefault) {
        openTimesheets(navigate);
        return true;
      }
      if (action === ACTION.clockIn) {
        await clockInTo(data.projectId, data.projectName, navigate, tappedAt);
        return true;
      }
      if (action === ACTION.openDiary) {
        navigate('Main', {
          screen: 'Projects',
          params: { screen: 'SiteDiary', params: { projectId: data.projectId, projectName: data.projectName }, initial: false },
        });
        return true;
      }
      if (action === ACTION.clockOut && data.timesheetId) {
        const result = await clockOutNow({ timesheetId: data.timesheetId, clientTime: tappedAt });
        refreshSiteFences().catch(() => {});
        done(result === 'queued' ? 'Clock-out saved offline' : 'Clocked out', data.projectName);
        return true;
      }
      if (action === ACTION.switchJob) {
        // Clock-in closes the open timesheet first (server-side), so one call
        // switches jobs — the old job ends and the new one starts at the tap.
        await clockInTo(data.projectId, data.projectName, navigate, tappedAt);
        return true;
      }
      return false;
    }

    if (isDefault) return false; // ordinary tap on a server push → normal routing

    // ── Server pushes ──
    if (category === CATEGORY.timesheetApproval || data.entityType === 'timesheet') {
      if (action === ACTION.approve && data.entityId) {
        await apiRequest(`/api/timesheets/${data.entityId}/approve`, 'POST');
        done('Timesheet approved');
        return true;
      }
      if (action === ACTION.open) {
        openTimesheets(navigate);
        return true;
      }
    }

    if (action === ACTION.markDone && data.entityId) {
      const { options } = await apiFetch<{ options: TaskStatusOption[] }>('/api/field-categories/by-key/task.status')
        .catch(() => ({ options: [] as TaskStatusOption[] }));
      await apiRequest(`/api/tasks/${data.entityId}`, 'PATCH', { status: doneStatusKey(options || []) });
      done('Task marked done');
      return true;
    }

    if (action === ACTION.reply) {
      const text = (response.userText || '').trim();
      const channelId = data.channelId || /[?&]channel=([^&#]+)/.exec(data.link || '')?.[1];
      if (!channelId) return false;
      if (!text) {
        navigate('Main', { screen: 'Messages', params: { screen: 'MessageThread', params: { channelId }, initial: false } });
        return true;
      }
      await apiRequest(`/api/channels/${decodeURIComponent(channelId)}/messages`, 'POST', { content: text, mentions: [] });
      done('Reply sent');
      return true;
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      Alert.alert("You can't do that here", err.message);
    } else {
      failed("Couldn't do that", err);
    }
    return true;
  }
  return false;
}
