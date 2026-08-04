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
