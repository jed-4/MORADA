import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Compare two names the way someone reading a numbered list expects:
 * "2. Slab" before "10. Frame", and "ITP3" before "ITP20".
 *
 * A plain localeCompare is lexicographic — it reads "10" as "1" then "0" and
 * puts it ahead of "2" — which scrambles every numbered checklist, template
 * and group name. Use this anywhere a user-authored name is sorted.
 */
export function compareNames(a: string | null | undefined, b: string | null | undefined): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true });
}

/**
 * The sequence number a user typed at the front of a name: "3. Slab" -> 3,
 * "ITP013 - Dilapidation" -> 13, "10) Frame" -> 10. Returns null when the name
 * carries no such number.
 *
 * Deliberately strict about what counts. The digits must either be followed by
 * a separator ("1. ", "2) ", "10 - "), or glued to a short alpha prefix with
 * no space between them ("ITP013", "QA-07"). A bare number elsewhere in the
 * name doesn't count, so "Fix 3 taps" and "3 Bedroom Fitout" read as
 * unnumbered rather than as item 3.
 */
export function leadingSequenceNumber(name: string | null | undefined): number | null {
  const text = (name || '').trim();
  if (!text) return null;
  // "1." / "2)" / "10 -" / "07:" — digits then a numbering separator.
  const separated = text.match(/^(\d+)(?:\s*[.)\-:\u2013\u2014]\s*\S|$)/);
  if (separated) return parseInt(separated[1], 10);
  // "ITP013" / "QA-07" — a short code glued to its number.
  const prefixed = text.match(/^[A-Za-z]{1,6}[-_]?(\d+)(?![\w])/);
  if (prefixed) return parseInt(prefixed[1], 10);
  return null;
}

/**
 * Tie-break two names by the sequence number their author put at the front.
 *
 * Returns 0 unless *both* names are numbered, so a list that isn't numbered —
 * or one where only some rows are — keeps the sequence it was stored in
 * instead of being alphabetised out of it. That's the whole difference from
 * compareNames: this one never reorders anything the user didn't number.
 *
 * Use it as the second key behind an `order` column, where legacy rows all
 * share the same order and would otherwise come back in an arbitrary sequence.
 */
export function compareNumberedNames(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const an = leadingSequenceNumber(a);
  const bn = leadingSequenceNumber(b);
  if (an === null || bn === null) return 0;
  return an - bn;
}

/**
 * Oldest first, i.e. the order the rows were created in.
 *
 * Use this for lists the user builds up by hand but which have no `order`
 * column to drag against — the checklists on a project, for one. Sorting those
 * by name reshuffles them away from the sequence they were entered in, which
 * is the sequence the work actually happens in.
 */
export function compareCreatedAt(
  a: { createdAt?: Date | string | null } | null | undefined,
  b: { createdAt?: Date | string | null } | null | undefined,
): number {
  const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
  return at - bt;
}

/**
 * Format currency for Australian dollars
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

/**
 * Format date for Australian locale
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-AU').format(d);
}

/**
 * Format datetime for Australian locale
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

/**
 * Get display name for a user - shows "First Last" if available, otherwise email, otherwise "Unknown User"
 */
export function getUserDisplayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null; username?: string | null } | null | undefined): string {
  if (!user) return 'Unknown User';
  
  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  if (firstName) {
    return firstName;
  }
  if (lastName) {
    return lastName;
  }
  if (user.email) {
    return user.email;
  }
  if (user.username) {
    return user.username;
  }
  return 'Unknown User';
}

/**
 * Get initials for a user - uses first letter of first and last name, or first letter of email
 */
export function getUserInitials(user: { firstName?: string | null; lastName?: string | null; email?: string | null } | null | undefined): string {
  if (!user) return '?';
  
  const firstName = user.firstName?.trim();
  const lastName = user.lastName?.trim();
  
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (firstName) {
    return firstName[0].toUpperCase();
  }
  if (lastName) {
    return lastName[0].toUpperCase();
  }
  if (user.email) {
    return user.email[0].toUpperCase();
  }
  return '?';
}
