/**
 * Which conversation is open on screen, if any.
 *
 * Notifications are decided in one place (GlobalMessageNotifier), which is
 * mounted for the whole app and therefore cannot see the messages page's
 * state. It needs one fact from it: do not interrupt someone about a message
 * they are sitting and looking at.
 *
 * A module-level value rather than context, because nothing re-renders on it —
 * it is read once, inside a socket callback, at the moment a message lands.
 */
let activeChannelId: string | null = null;

export function setActiveChannel(id: string | null): void {
  activeChannelId = id;
}

export function getActiveChannel(): string | null {
  return activeChannelId;
}
