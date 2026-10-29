import { z } from "zod";

/**
 * Who was at a meeting.
 *
 * `minutes.attendees` is a json column holding a mixed array: a plain string
 * for someone typed in by hand, or an object pointing at a person this company
 * already has a record of — a `userId` for someone with a login, a `contactId`
 * for a CRM contact (a client, a trade, a supplier). The reference is the point:
 * "D. Nguyen" in a string tells you nothing you can act on, while a userId is
 * the same person the tasks out of that meeting get assigned to.
 *
 * Strings stay valid for ever. Every minute recorded before this file existed
 * holds them, and "the plasterer's offsider" is a real attendee with no record
 * anywhere — refusing to write it down would just move it into the notes.
 *
 * ## The trap this file exists to close
 *
 * Several readers had `minute.attendees as string[]` and then called a string
 * method on each entry. The minutes list did exactly that to search them:
 *
 *     ((minute.attendees as string[]) || []).some((a) => a.toLowerCase()...)
 *
 * One object attendee and that throws, taking the whole list with it. It never
 * fired only because the picker that was meant to produce objects asked for
 * `/api/contacts/[object Object]` (an object in the query key, joined into the
 * URL) and so never returned a contact to pick. Read an attendee through
 * `attendeeName` and the shape cannot bite.
 */

export const minuteAttendeeSchema = z.union([
  /** Typed in by hand: someone with no record here, or none worth making. */
  z.string(),
  /**
   * Someone on file: `userId` for a team member with a login (the same id
   * tasks are assigned to), `contactId` for a CRM contact — a client, a trade,
   * a supplier. Both optional, because minutes already hold `{ name }` objects
   * with neither, and a union that insisted on an id rejected them.
   *
   * That rejection is not hypothetical and it is not new: this is the shape the
   * seeded minutes use, and requiring `contactId` meant saving ANY such minute
   * failed validation — the PATCH 400ed and the edit vanished with no
   * explanation beyond a red toast. A write schema has to accept what the
   * column already contains.
   */
  z.object({
    name: z.string(),
    userId: z.string().optional(),
    contactId: z.string().optional(),
  }),
]);

export type MinuteAttendee = z.infer<typeof minuteAttendeeSchema>;

/** The name to show. The only safe way to read an attendee. */
export function attendeeName(attendee: unknown): string {
  if (typeof attendee === "string") return attendee;
  if (attendee && typeof attendee === "object") {
    const name = (attendee as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

/** Every attendee's name, blanks dropped. For search, prompts and summaries. */
export function attendeeNames(attendees: unknown): string[] {
  if (!Array.isArray(attendees)) return [];
  return attendees.map(attendeeName).filter((n) => n.trim().length > 0);
}

/** The user id, when this attendee is a team member with a login. */
export function attendeeUserId(attendee: unknown): string | null {
  if (attendee && typeof attendee === "object") {
    const id = (attendee as { userId?: unknown }).userId;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/** The contact id, when this attendee is a CRM contact. */
export function attendeeContactId(attendee: unknown): string | null {
  if (attendee && typeof attendee === "object") {
    const id = (attendee as { contactId?: unknown }).contactId;
    if (typeof id === "string" && id) return id;
  }
  return null;
}

/**
 * One value per person, for deduplication.
 *
 * An id when there is one, otherwise the folded name — so adding Dave from the
 * list after someone typed "dave" does not produce two Daves, and two different
 * contacts who happen to share a name are still two people.
 */
export function attendeeKey(attendee: unknown): string {
  const userId = attendeeUserId(attendee);
  if (userId) return `user:${userId}`;
  const contactId = attendeeContactId(attendee);
  if (contactId) return `contact:${contactId}`;
  return `name:${attendeeName(attendee).trim().toLowerCase()}`;
}

/** The same person, by id where there is one and by name where there is not. */
export function sameAttendee(a: unknown, b: unknown): boolean {
  const ka = attendeeKey(a);
  const kb = attendeeKey(b);
  if (ka === kb) return true;
  // A typed name and a picked person are the same attendee when the names
  // match: this is what stops a list picking up both.
  const na = attendeeName(a).trim().toLowerCase();
  const nb = attendeeName(b).trim().toLowerCase();
  return !!na && na === nb;
}
