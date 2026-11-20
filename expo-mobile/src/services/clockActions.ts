import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, apiRequest, ApiError } from './api';
import { addToQueue, isOnline } from './offlineQueue';

/**
 * Clock in / out from outside TimesheetsScreen (the "Clock in" button on an
 * arrival notification). Same rules as TimesheetsScreen.handleClockIn/Out:
 *  - the time is the tap (`clientTime`), even when it is sent later
 *  - offline, or the request fails to reach the server → offline queue
 *  - the server says no (4xx) → thrown, so the caller can say why
 */
export type ClockResult = 'sent' | 'queued';

const isNetworkFailure = (err: unknown) => !(err instanceof ApiError);

export async function clockInNow(args: { projectId: string | null; costCodeId: string; clientTime?: string }): Promise<ClockResult> {
  const payload = { projectId: args.projectId, costCodeId: args.costCodeId, clientTime: args.clientTime ?? new Date().toISOString() };
  if (args.projectId) rememberCostCode(args.projectId, args.costCodeId).catch(() => {});
  if (!(await isOnline())) {
    await addToQueue({ type: 'clock-in', payload });
    return 'queued';
  }
  try {
    await apiRequest('/api/timesheets/clock-in', 'POST', payload);
    return 'sent';
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    await addToQueue({ type: 'clock-in', payload });
    return 'queued';
  }
}

export async function clockOutNow(args: { timesheetId: string; clientTime?: string }): Promise<ClockResult> {
  const payload = { timesheetId: args.timesheetId, clientTime: args.clientTime ?? new Date().toISOString() };
  if (!(await isOnline())) {
    await addToQueue({ type: 'clock-out', payload });
    return 'queued';
  }
  try {
    await apiRequest('/api/timesheets/clock-out', 'POST', payload);
    return 'sent';
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;
    await addToQueue({ type: 'clock-out', payload });
    return 'queued';
  }
}

// ── Last cost code per job ───────────────────────────────────────────────────

const LAST_COST_CODE_KEY = 'morada_last_cost_code_by_project';

async function readMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_COST_CODE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function rememberCostCode(projectId: string, costCodeId: string): Promise<void> {
  const map = await readMap();
  map[projectId] = costCodeId;
  await AsyncStorage.setItem(LAST_COST_CODE_KEY, JSON.stringify(map));
}

/**
 * The cost code this person last used on this job: remembered on the phone,
 * else their most recent timesheet on the job (the mobile client only ever
 * gets its own timesheets back). null = ask them.
 */
export async function lastCostCodeFor(projectId: string): Promise<string | null> {
  const map = await readMap();
  if (map[projectId]) return map[projectId];
  try {
    const rows = await apiFetch<Array<{ date: string; costCodeId?: string | null; costCodes?: Array<{ costCodeId?: string }> }>>(
      `/api/timesheets?projectId=${encodeURIComponent(projectId)}`,
    );
    const sorted = [...(rows || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const ts of sorted) {
      const id = ts.costCodeId || ts.costCodes?.[0]?.costCodeId;
      if (id) {
        rememberCostCode(projectId, id).catch(() => {});
        return id;
      }
    }
  } catch {
    // offline or failed — ask
  }
  return null;
}
