/**
 * The time a clock-in or clock-out really happened.
 *
 * The phone sends the moment the button was tapped (`clientTime`, ISO). Before
 * this, the server stamped "now" — so a clock-in tapped with no signal on site
 * was recorded when the phone next got signal, sometimes hours later.
 *
 * Rule (Jed, 2026-11-18): clock-in/out time = when the button was pressed.
 * Geofence arrive/leave times are recorded separately and never change it.
 *
 * Guard rails, because the time comes from the device:
 *  - missing / unparseable            → now (old app versions send nothing)
 *  - in the future (clock skew)       → now
 *  - more than MAX_AGE_MS in the past → rejected (a queued action that old is
 *    almost certainly stale; the caller answers 400 and the person fixes the
 *    timesheet by hand)
 *  - before `notBefore` (e.g. clock-out earlier than the clock-in) → notBefore
 */
export const MAX_CLIENT_TIME_AGE_MS = 24 * 60 * 60 * 1000;

export class StaleClientTimeError extends Error {
  constructor() {
    super("That clock time is more than 24 hours old — please enter the timesheet by hand.");
    this.name = "StaleClientTimeError";
  }
}

export function resolveClockTime(raw: unknown, now: Date = new Date(), notBefore?: Date | null): Date {
  let at = now;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      if (now.getTime() - parsed.getTime() > MAX_CLIENT_TIME_AGE_MS) throw new StaleClientTimeError();
      at = parsed.getTime() > now.getTime() ? now : parsed;
    }
  }
  if (notBefore && at.getTime() < notBefore.getTime()) at = new Date(notBefore.getTime());
  return at;
}
