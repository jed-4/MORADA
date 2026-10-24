/**
 * How people are listed in pickers, everywhere:
 *
 *   you first, then everyone else A–Z by name
 *
 * Client portal logins are never offered (they aren't staff), and archived team
 * members sit in their own collapsed section at the bottom — kept, so old work
 * still has a name and can be filtered by, but out of the way.
 */
export interface PersonLike {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  displayName?: string | null;
  userCategory?: string | null;
}

export function personName(p: PersonLike | null | undefined): string {
  if (!p) return "";
  if (p.displayName) return p.displayName;
  const name = [p.firstName, p.lastName].filter(Boolean).join(" ").trim();
  return name || p.email || "Unnamed";
}

/** Staff only: drops client portal logins. */
export function staffOnly<T extends PersonLike>(people: T[]): T[] {
  return (people ?? []).filter((p) => p.userCategory !== "client");
}

/** You first, then A–Z. Does not mutate. */
export function sortPeople<T extends PersonLike>(people: T[], meId?: string | null): T[] {
  return [...(people ?? [])].sort((a, b) => {
    if (meId) {
      if (a.id === meId && b.id !== meId) return -1;
      if (b.id === meId && a.id !== meId) return 1;
    }
    return personName(a).localeCompare(personName(b), undefined, { sensitivity: "base" });
  });
}

/** The label for a person in a picker: "Jed Smith (you)" for the signed-in user. */
export function pickerLabel(p: PersonLike, meId?: string | null): string {
  return p.id === meId ? `${personName(p)} (you)` : personName(p);
}
