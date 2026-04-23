import { db } from "../db";
import { contacts } from "@shared/schema";
import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import path from "path";
import fs from "fs";

// Sentinel so the orphan-warn log fires only once across restarts,
// matching the "one-time backend log" requirement. The sentinel just
// records the run timestamp; we always still rewrite healable rows
// (idempotent) but skip re-logging the same orphans on every boot.
const SENTINEL_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  ".local",
  "state",
  "heal-contact-names.json",
);

function readSentinel(): { completedAt?: string } | null {
  try {
    if (!fs.existsSync(SENTINEL_PATH)) return null;
    return JSON.parse(fs.readFileSync(SENTINEL_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeSentinel(): void {
  try {
    fs.mkdirSync(path.dirname(SENTINEL_PATH), { recursive: true });
    fs.writeFileSync(
      SENTINEL_PATH,
      JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
    );
  } catch (error) {
    console.warn("[heal-contact-names] Could not write completion sentinel:", error);
  }
}

/**
 * One-time data heal for trade/supplier contacts whose `name` was previously
 * populated from the key person (firstName + lastName) by the old fallback
 * logic. For any such contact that also has a non-empty `company`, rewrite
 * `name` to `company` so the contact list shows the business identity again.
 *
 * Contacts with no `company` value are left untouched and surfaced via a
 * single log line so the team can review them manually.
 *
 * Safe to run on every startup: the WHERE clause is idempotent (matches
 * fewer rows on each run) and the work is fire-and-forget.
 */
export async function healContactNames(): Promise<void> {
  try {
    // Find trade/supplier contacts whose `name` looks like the key person.
    // We compare against TRIM(firstName || ' ' || lastName) to tolerate
    // historic whitespace differences.
    const candidates = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        company: contacts.company,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        contactType: contacts.contactType,
      })
      .from(contacts)
      .where(
        and(
          inArray(contacts.contactType, ["trade", "supplier"]),
          isNotNull(contacts.name),
          ne(contacts.name, ""),
          sql`TRIM(${contacts.name}) = TRIM(COALESCE(${contacts.firstName}, '') || ' ' || COALESCE(${contacts.lastName}, ''))`,
          sql`TRIM(COALESCE(${contacts.firstName}, '') || ' ' || COALESCE(${contacts.lastName}, '')) <> ''`,
        ),
      );

    if (candidates.length === 0) return;

    const healable = candidates.filter((c) => (c.company || "").trim());
    const orphaned = candidates.filter((c) => !(c.company || "").trim());

    for (const c of healable) {
      const newName = (c.company || "").trim();
      await db
        .update(contacts)
        .set({ name: newName, updatedAt: new Date() })
        .where(eq(contacts.id, c.id));
    }

    if (healable.length > 0) {
      console.log(
        `[heal-contact-names] Rewrote ${healable.length} trade/supplier contact name(s) from key person back to company name.`,
      );
    }

    // Log orphans only on the first heal run so we don't spam every
    // restart with the same warning. The sentinel is written below after
    // the run completes successfully.
    const alreadyRan = readSentinel() !== null;
    if (orphaned.length > 0 && !alreadyRan) {
      const sample = orphaned.slice(0, 10).map((c) => `${c.id}: "${c.name}"`).join(", ");
      console.warn(
        `[heal-contact-names] ${orphaned.length} trade/supplier contact(s) have a person-style name but no company value. ` +
          `Manual review needed. First ${Math.min(10, orphaned.length)}: ${sample}`,
      );
    }

    writeSentinel();
  } catch (error) {
    console.error("[heal-contact-names] Failed to heal contact names:", error);
  }
}
