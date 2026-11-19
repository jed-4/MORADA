// Clock-in Live Activity (#39): Lock Screen + Dynamic Island timer.
//
// Starts when you clock in ON THIS PHONE and ends when you clock out. The
// timer counts itself (system Text timer), so it never needs an update while
// running. Clocking in elsewhere (web, another phone) doesn't start one; the
// widget refresh only ENDS a stale one (see reconcileClockActivity).
//
// Every call is guarded: on Android, Expo Go or a pre-1.4.0 binary these are
// no-ops, and nothing here can throw into a clock-in/out handler.
import { loadWidgetModule } from '../lib/expoWidgets';
import { applyLocalClockIn, applyLocalClockOut, refreshWidgetSnapshot } from './widgetSnapshot';

type ClockActivityProps = { jobName: string; clockInMs: number };

interface ActivityInstance {
  update(props: ClockActivityProps): Promise<void>;
  end(dismissalPolicy?: 'default' | 'immediate'): Promise<void>;
}

interface ActivityFactory {
  start(props: ClockActivityProps, url?: string): ActivityInstance | undefined;
  getInstances(): ActivityInstance[];
}

let factory: ActivityFactory | null | undefined;
function getFactory(): ActivityFactory | null {
  if (factory === undefined) {
    factory = loadWidgetModule<ActivityFactory>(() => require('../widgets/ClockActivity').default);
  }
  return factory;
}

// Last props we started with — so a refresh only updates when something changed.
let current: ClockActivityProps | null = null;

function instances(): ActivityInstance[] {
  const f = getFactory();
  if (!f) return [];
  try {
    const list = f.getInstances?.();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function endAll() {
  for (const i of instances()) {
    try {
      i.end('immediate').catch(() => {});
    } catch {
      // ignore
    }
  }
  current = null;
}

/** Same rule as the server's shortProjectName: job number, else a trimmed name. */
export function shortJobName(project: { name?: string | null; jobNumber?: string | null } | null | undefined): string {
  if (!project) return 'Business';
  const jobNumber = (project.jobNumber || '').trim();
  if (jobNumber) return jobNumber;
  const name = (project.name || '').trim();
  if (name.length <= 18) return name;
  const cut = name.slice(0, 18);
  const space = cut.lastIndexOf(' ');
  return `${(space > 8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Call once from each clock-in success path (online, or queued offline).
 * `clockInTime` is the tap time (ISO) the server also uses.
 */
export function clockedInOnThisPhone(opts: { jobName: string; clockInTime: string; projectId?: string | null }) {
  try {
    const clockInMs = new Date(opts.clockInTime).getTime();
    if (!Number.isFinite(clockInMs)) return;
    applyLocalClockIn({ jobName: opts.jobName, clockInMs, projectId: opts.projectId ?? null });
    const f = getFactory();
    if (f) {
      endAll(); // never two timers
      const props = { jobName: opts.jobName || 'Clocked in', clockInMs };
      f.start(props, 'buildpro://timesheets');
      current = props;
    }
  } catch (e) {
    console.warn('Live Activity start failed:', e);
  }
  refreshWidgetSnapshot();
}

/** Call once from each clock-out success path (online, or queued offline). */
export function clockedOutOnThisPhone() {
  try {
    applyLocalClockOut();
    endAll();
  } catch (e) {
    console.warn('Live Activity end failed:', e);
  }
  refreshWidgetSnapshot();
}

/**
 * Keep a running Live Activity honest against the server: end it if the
 * server says you're no longer clocked in (clocked out on the web, timesheet
 * deleted), and correct the job / start time if they changed. Never starts one.
 */
export function reconcileClockActivity(active: { jobName: string; clockInMs: number } | null) {
  try {
    const list = instances();
    if (list.length === 0) return;
    if (!active) {
      endAll();
      return;
    }
    if (current && current.jobName === active.jobName && current.clockInMs === active.clockInMs) return;
    current = { jobName: active.jobName || 'Clocked in', clockInMs: active.clockInMs };
    for (const i of list) i.update(current).catch(() => {});
  } catch {
    // ignore
  }
}

/** Logout: no timer left on the Lock Screen for the next person. */
export function endClockActivityOnLogout() {
  try {
    endAll();
  } catch {
    // ignore
  }
}
