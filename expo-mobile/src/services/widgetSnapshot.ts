// Home Screen widgets (#40): fetch GET /api/mobile/widget-snapshot and write
// it to the "Today", "Tasks" and "Diary photo" widgets.
//
// When it runs:
//   - app open + every return to the foreground (startWidgetSync, MainTabs)
//   - after a dashboard refresh (DashboardScreen.fetchData)
//   - after clock-in / clock-out (liveActivity.clockedIn/OutOnThisPhone)
//   - after the offline queue syncs a clock action (offlineQueue)
//   - cleared on logout (AuthContext)
//
// The clock timer is the system's self-counting Text timer, so the widget
// needs no refresh while you're clocked in. updateTimeline pre-schedules the
// "next schedule item" as items finish through the day, and a midnight entry
// so yesterday's tasks and hours don't linger.
//
// Never any money: the endpoint doesn't send any, and nothing here adds it.
// All calls are no-ops on Android, Expo Go and pre-1.4.0 binaries.
import { AppState } from 'react-native';
import { apiFetch } from './api';
import { expoWidgetsAvailable, loadWidgetModule } from '../lib/expoWidgets';
import type { TodayWidgetProps } from '../widgets/TodayWidget';
import type { TasksWidgetProps } from '../widgets/TasksWidget';

export interface WidgetScheduleItem {
  id: string;
  name: string;
  projectId: string | null;
  projectShortName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  isToday: boolean;
}

export interface WidgetSnapshot {
  generatedAt: string;
  date: string;
  activeTimesheet: {
    id: string;
    clockInTime: string;
    projectId: string | null;
    projectName: string;
    projectShortName: string;
  } | null;
  hoursToday: number;
  tasks: Array<{ id: string; title: string; projectId: string | null; projectShortName: string }>;
  nextScheduleItem: WidgetScheduleItem | null;
  upcomingSchedule: WidgetScheduleItem[];
}

interface WidgetHandle<P> {
  updateSnapshot(props: P): void;
  updateTimeline(entries: Array<{ date: Date; props: P }>): void;
}

type Widgets = {
  today: WidgetHandle<TodayWidgetProps>;
  tasks: WidgetHandle<TasksWidgetProps>;
  photo: WidgetHandle<{ signedIn: boolean }>;
};

let widgets: Widgets | null | undefined;
function getWidgets(): Widgets | null {
  if (widgets === undefined) {
    widgets = loadWidgetModule<Widgets>(() => ({
      today: require('../widgets/TodayWidget').default,
      tasks: require('../widgets/TasksWidget').default,
      photo: require('../widgets/DiaryPhotoWidget').default,
    }));
  }
  return widgets;
}

// ── Pure helpers (exported for tests) ──

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date, YYYY-MM-DD. */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateKey(key: string, hhmm?: string | null): Date {
  const [y, m, d] = key.split('-').map(Number);
  const [hh, mm] = (hhmm || '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad(m)}${suffix}` : `${h12}${suffix}`;
}

/** When a schedule item stops being "next": its end time, else the end of its last day. */
export function scheduleItemEndsAt(item: WidgetScheduleItem): Date {
  if (item.endTime) return parseDateKey(item.endDate, item.endTime);
  return addDays(parseDateKey(item.endDate), 1);
}

function scheduleDetail(item: WidgetScheduleItem, at: Date): string {
  const today = localDateKey(at);
  const tomorrow = localDateKey(addDays(at, 1));
  let when: string;
  if (item.startDate <= today && item.endDate >= today) {
    when = item.startDate === today && item.startTime ? `Today ${formatTime(item.startTime)}` : 'Today';
  } else if (item.startDate === tomorrow) {
    when = item.startTime ? `Tomorrow ${formatTime(item.startTime)}` : 'Tomorrow';
  } else {
    when = parseDateKey(item.startDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return [item.projectShortName, when].filter(Boolean).join(' · ');
}

function hoursLabel(hours: number): string {
  if (!hours || hours <= 0) return 'No hours logged today';
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h logged today`;
}

/** Today widget props as they should look at time `at`. */
export function todayPropsAt(snap: WidgetSnapshot, at: Date): TodayWidgetProps {
  const sameDay = localDateKey(at) === snap.date;
  const next = (snap.upcomingSchedule || []).find((s) => scheduleItemEndsAt(s).getTime() > at.getTime()) || null;
  const active = snap.activeTimesheet;
  return {
    signedIn: true,
    clockedIn: !!active,
    jobName: active ? active.projectShortName || 'Clocked in' : '',
    clockInMs: active ? new Date(active.clockInTime).getTime() || 0 : 0,
    hoursLabel: hoursLabel(sameDay ? snap.hoursToday : 0),
    nextTitle: next ? next.name : '',
    nextDetail: next ? scheduleDetail(next, at) : '',
  };
}

/** Timeline: now, each time a schedule item finishes (next 36h), and local midnight. */
export function buildTodayTimeline(snap: WidgetSnapshot, now: Date): Array<{ date: Date; props: TodayWidgetProps }> {
  const horizon = now.getTime() + 36 * 60 * 60 * 1000;
  const times = new Set<number>([now.getTime()]);
  for (const s of snap.upcomingSchedule || []) {
    const t = scheduleItemEndsAt(s).getTime();
    if (t > now.getTime() && t <= horizon) times.add(t);
  }
  const midnight = addDays(parseDateKey(localDateKey(now)), 1).getTime();
  times.add(midnight);
  return [...times]
    .sort((a, b) => a - b)
    .slice(0, 12)
    .map((t) => ({ date: new Date(t), props: todayPropsAt(snap, new Date(t)) }));
}

export function tasksProps(snap: WidgetSnapshot): TasksWidgetProps {
  return {
    signedIn: true,
    tasks: (snap.tasks || []).slice(0, 4).map((t) => ({ id: t.id, title: t.title, job: t.projectShortName })),
  };
}

// ── Writing ──

let lastSnapshot: WidgetSnapshot | null = null;

function write(snap: WidgetSnapshot, now = new Date()) {
  const w = getWidgets();
  if (!w) return;
  try {
    w.today.updateTimeline(buildTodayTimeline(snap, now));
  } catch (e) {
    console.warn('Today widget update failed:', e);
  }
  try {
    const midnight = addDays(parseDateKey(localDateKey(now)), 1);
    w.tasks.updateTimeline([
      { date: now, props: tasksProps(snap) },
      // Yesterday's "due today" list must not survive midnight.
      { date: midnight, props: { signedIn: true, tasks: [] } },
    ]);
  } catch (e) {
    console.warn('Tasks widget update failed:', e);
  }
  try {
    w.photo.updateSnapshot({ signedIn: true });
  } catch {
    // ignore
  }
}

/** True while a clock-in/out is still waiting in the offline queue. */
async function clockActionPending(): Promise<boolean> {
  try {
    // Lazy: offlineQueue imports this module (refresh after a sync).
    const { getQueue } = require('./offlineQueue') as typeof import('./offlineQueue');
    const queue = await getQueue();
    return queue.some((a) => (a.type === 'clock-in' || a.type === 'clock-out') && a.status !== 'failed');
  } catch {
    return false;
  }
}

let inFlight: Promise<void> | null = null;

/** Fetch the snapshot and write the widgets. Never throws. Concurrent calls share one fetch. */
export function refreshWidgetSnapshot(): Promise<void> {
  if (!expoWidgetsAvailable()) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const now = new Date();
      const snap = await apiFetch<WidgetSnapshot>(
        `/api/mobile/widget-snapshot?date=${localDateKey(now)}&tzOffset=${now.getTimezoneOffset()}`,
      );
      if (!snap || typeof snap !== 'object') return;
      // A queued (offline) clock action hasn't reached the server yet: keep
      // what this phone knows for the timer instead of the server's view.
      if (await clockActionPending()) {
        if (lastSnapshot) {
          snap.activeTimesheet = lastSnapshot.activeTimesheet;
          snap.hoursToday = Math.max(snap.hoursToday, lastSnapshot.hoursToday);
        }
      } else {
        const { reconcileClockActivity } = require('./liveActivity') as typeof import('./liveActivity');
        const a = snap.activeTimesheet;
        reconcileClockActivity(a ? { jobName: a.projectShortName, clockInMs: new Date(a.clockInTime).getTime() } : null);
      }
      lastSnapshot = snap;
      write(snap, now);
    } catch {
      // Offline / server error: leave the last snapshot on the widgets.
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Clocked in on this phone: show it straight away, even offline. */
export function applyLocalClockIn(opts: { jobName: string; clockInMs: number; projectId: string | null }) {
  if (!expoWidgetsAvailable()) return;
  const base: WidgetSnapshot = lastSnapshot ?? {
    generatedAt: new Date().toISOString(),
    date: localDateKey(new Date()),
    activeTimesheet: null,
    hoursToday: 0,
    tasks: [],
    nextScheduleItem: null,
    upcomingSchedule: [],
  };
  lastSnapshot = {
    ...base,
    activeTimesheet: {
      id: 'local',
      clockInTime: new Date(opts.clockInMs).toISOString(),
      projectId: opts.projectId,
      projectName: opts.jobName,
      projectShortName: opts.jobName,
    },
  };
  write(lastSnapshot);
}

/** Clocked out on this phone: stop the timer straight away, even offline. */
export function applyLocalClockOut() {
  if (!expoWidgetsAvailable() || !lastSnapshot) return;
  const active = lastSnapshot.activeTimesheet;
  const elapsedHours = active ? Math.max(0, (Date.now() - new Date(active.clockInTime).getTime()) / 3_600_000) : 0;
  lastSnapshot = {
    ...lastSnapshot,
    activeTimesheet: null,
    hoursToday: lastSnapshot.hoursToday + (lastSnapshot.date === localDateKey(new Date()) ? elapsedHours : 0),
  };
  write(lastSnapshot);
}

/** Logout: blank every widget so the next person sees nothing of yours. */
export function clearWidgets() {
  lastSnapshot = null;
  const w = getWidgets();
  if (!w) return;
  try {
    w.today.updateSnapshot({
      signedIn: false,
      clockedIn: false,
      jobName: '',
      clockInMs: 0,
      hoursLabel: '',
      nextTitle: '',
      nextDetail: '',
    });
    w.tasks.updateSnapshot({ signedIn: false, tasks: [] });
    w.photo.updateSnapshot({ signedIn: false });
  } catch (e) {
    console.warn('Clearing widgets failed:', e);
  }
}

/** Refresh now and on every return to the foreground. Returns a cleanup. */
export function startWidgetSync(): () => void {
  if (!expoWidgetsAvailable()) return () => {};
  refreshWidgetSnapshot();
  let last: string | null | undefined = AppState.currentState;
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && last !== 'active') refreshWidgetSnapshot();
    last = next;
  });
  return () => sub.remove();
}
