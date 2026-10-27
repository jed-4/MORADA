/**
 * Reading a meeting's attendees.
 *
 * `minutes.attendees` is a mixed json array — a typed string, a team member by
 * userId, a CRM contact by contactId — and the readers that assumed `string[]`
 * are what these pin. The minutes list searched them with
 * `(attendees as string[]).some(a => a.toLowerCase()...)`, which throws on the
 * first object attendee and takes the whole list with it. It never fired only
 * because the picker that was supposed to produce objects was broken, so every
 * attendee on record is still a string.
 *
 * Run: npx tsx server/__tests__/minute-attendees.test.ts
 */
import assert from "node:assert/strict";
import {
  attendeeName,
  attendeeNames,
  attendeeKey,
  attendeeUserId,
  attendeeContactId,
  sameAttendee,
  minuteAttendeeSchema,
} from "@shared/minuteAttendees";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

// --- reading a name out of any shape ----------------------------------------

check("a typed string is its own name", () => {
  assert.equal(attendeeName("Dave the plasterer"), "Dave the plasterer");
});

check("a team member reads as their name", () => {
  assert.equal(attendeeName({ name: "Jed Smith", userId: "u1" }), "Jed Smith");
});

check("a contact reads as their name", () => {
  assert.equal(attendeeName({ name: "AJ", contactId: "c1" }), "AJ");
});

check("nothing readable gives an empty name, never a crash", () => {
  // This is the whole point: the old readers called .toLowerCase() straight
  // onto whatever the json column held.
  for (const junk of [null, undefined, 42, {}, { name: 7 }, [], true]) {
    assert.equal(attendeeName(junk as any), "");
  }
});

check("a mixed list yields every name in order", () => {
  const mixed = [
    "Site foreman",
    { name: "Jed Smith", userId: "u1" },
    { name: "AJ", contactId: "c1" },
  ];
  assert.deepEqual(attendeeNames(mixed), ["Site foreman", "Jed Smith", "AJ"]);
});

check("blank and unreadable entries are dropped, not rendered empty", () => {
  assert.deepEqual(attendeeNames(["", "   ", null, { name: "Kye", userId: "u2" }]), ["Kye"]);
});

check("a non-array column reads as no attendees", () => {
  // The column defaults to [] but is json: it can hold anything.
  for (const junk of [null, undefined, "Dave", {}, 3]) {
    assert.deepEqual(attendeeNames(junk as any), []);
  }
});

check("searching a mixed list does not throw", () => {
  // Exactly what the minutes list does, which is where this blew up.
  const mixed = ["Site foreman", { name: "Jed Smith", userId: "u1" }];
  assert.equal(attendeeNames(mixed).some((a) => a.toLowerCase().includes("jed")), true);
  assert.equal(attendeeNames(mixed).some((a) => a.toLowerCase().includes("zz")), false);
});

// --- ids --------------------------------------------------------------------

check("a userId is read only off a team member", () => {
  assert.equal(attendeeUserId({ name: "Jed", userId: "u1" }), "u1");
  assert.equal(attendeeUserId({ name: "AJ", contactId: "c1" }), null);
  assert.equal(attendeeUserId("Jed"), null);
});

check("a contactId is read only off a contact", () => {
  assert.equal(attendeeContactId({ name: "AJ", contactId: "c1" }), "c1");
  assert.equal(attendeeContactId({ name: "Jed", userId: "u1" }), null);
  assert.equal(attendeeContactId("AJ"), null);
});

check("an empty id counts as no id", () => {
  assert.equal(attendeeUserId({ name: "Jed", userId: "" }), null);
  assert.equal(attendeeContactId({ name: "AJ", contactId: "" }), null);
});

// --- identity and deduplication ---------------------------------------------

check("the same person picked twice is one attendee", () => {
  const a = { name: "Jed Smith", userId: "u1" };
  assert.equal(sameAttendee(a, { name: "Jed Smith", userId: "u1" }), true);
  assert.equal(attendeeKey(a), attendeeKey({ name: "J. Smith", userId: "u1" }),
    "the id decides, not the cached name");
});

check("a renamed person is still the same person", () => {
  // Ailin made a client login and renamed it AJ: the id is the identity, the
  // name is a cache of it.
  assert.equal(sameAttendee({ name: "Ailin", contactId: "c1" }, { name: "AJ", contactId: "c1" }), true);
});

check("a typed name and the same person picked are not added twice", () => {
  assert.equal(sameAttendee("jed smith", { name: "Jed Smith", userId: "u1" }), true);
});

check("two different people who share no name are not merged", () => {
  assert.equal(sameAttendee({ name: "Jed", userId: "u1" }, { name: "Kye", userId: "u2" }), false);
  assert.equal(sameAttendee("Dave", "Kye"), false);
});

check("two different contacts who happen to share a name stay two keys", () => {
  // Deliberate: they are different records, so the list can hold both.
  assert.notEqual(
    attendeeKey({ name: "D. Nguyen", contactId: "c1" }),
    attendeeKey({ name: "D. Nguyen", contactId: "c2" }),
  );
});

check("a user and a contact are never the same key", () => {
  assert.notEqual(attendeeKey({ name: "X", userId: "same" }), attendeeKey({ name: "X", contactId: "same" }));
});

check("typed names fold on case and surrounding space", () => {
  assert.equal(attendeeKey("  Dave  "), attendeeKey("dave"));
});

// --- what the API accepts ----------------------------------------------------

check("all three shapes validate", () => {
  for (const ok of ["Dave", { name: "Jed", userId: "u1" }, { name: "AJ", contactId: "c1" }]) {
    assert.equal(minuteAttendeeSchema.safeParse(ok).success, true, JSON.stringify(ok));
  }
});

check("a team member is accepted — the shape that was missing", () => {
  // Before userId was in the union, a picked staff member failed validation,
  // so the only way to record the people actually in the room was free text.
  const parsed = minuteAttendeeSchema.safeParse({ name: "Jed Smith", userId: "u1" });
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data, { name: "Jed Smith", userId: "u1" });
});

check("a name-only object is accepted — minutes already hold them", () => {
  // `{ name: "Steve Irwin (Client)" }` with no id is what the existing minutes
  // contain. A union that required an id rejected the lot, so saving one of
  // those minutes 400ed and the edit was lost. Writes must accept what is
  // already in the column.
  const parsed = minuteAttendeeSchema.safeParse({ name: "Steve Irwin (Client)" });
  assert.equal(parsed.success, true);
  assert.equal(attendeeKey({ name: "Steve Irwin (Client)" }), "name:steve irwin (client)",
    "with no id it is identified by its name, like a typed one");
});

check("an object with no name is refused", () => {
  for (const bad of [{}, { userId: "u1" }, { contactId: "c1" }, { name: 5 }, null, 7]) {
    assert.equal(minuteAttendeeSchema.safeParse(bad).success, false, JSON.stringify(bad));
  }
});

console.log(`minute attendees: ${passed} passed, 0 failed`);
