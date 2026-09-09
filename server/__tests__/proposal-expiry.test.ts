/**
 * Proposal expiry — pure functions over shared/proposalExpiry.ts.
 *
 * Auto-expiry is the one piece of this feature that can COST a signed job: it
 * makes the accept and reject endpoints refuse the client. So the tests lean
 * on the two ways it could wrongly refuse someone.
 *
 *   1. The day boundary. "Valid until 31 March" means through the end of the
 *      31st. A date picker hands back midnight, so a naive `now > expiryDate`
 *      retires the proposal a full day early — the client opens it on the very
 *      day you told them it was good until, and is turned away.
 *   2. Over-reach. A null expiry must never read as "expired now", or the
 *      first sweep retires every proposal in the database. Nor may anything
 *      already decided, archived, or still in draft be touched.
 */
import assert from "node:assert";
import {
  endOfDay,
  isLapsed,
  statusOnReinstate,
  expiryFromDays,
  daysUntilExpiry,
} from "@shared/proposalExpiry";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

// --- the day boundary ------------------------------------------------------

check("endOfDay pushes a picker's midnight to the last instant of that day", () => {
  const picked = new Date(2026, 2, 31, 0, 0, 0, 0); // 31 Mar 2026, local midnight
  const end = endOfDay(picked);
  assert.strictEqual(end.getDate(), 31);
  assert.strictEqual(end.getHours(), 23);
  assert.strictEqual(end.getMinutes(), 59);
  assert.strictEqual(end.getSeconds(), 59);
  assert.strictEqual(end.getMilliseconds(), 999);
});

check("a proposal is still live all through its final day", () => {
  const expiry = endOfDay(new Date(2026, 2, 31));
  const proposal = { status: "sent", expiryDate: expiry, isArchived: false };

  // The exact bug this guards: 9am on the day you told the client it was valid
  // until. A naive `now > midnight-of-the-31st` refuses them here.
  assert.strictEqual(isLapsed(proposal, new Date(2026, 2, 31, 9, 0)), false, "refused on its final morning");
  assert.strictEqual(isLapsed(proposal, new Date(2026, 2, 31, 23, 59, 0)), false, "refused a minute before midnight");
});

check("it lapses once that day is over", () => {
  const expiry = endOfDay(new Date(2026, 2, 31));
  const proposal = { status: "sent", expiryDate: expiry, isArchived: false };
  assert.strictEqual(isLapsed(proposal, new Date(2026, 3, 1, 0, 0, 1)), true);
});

check("expiryFromDays lands on the end of the Nth day out", () => {
  const from = new Date(2026, 2, 1, 14, 30); // 1 Mar, mid-afternoon
  const out = expiryFromDays(30, from);
  assert.strictEqual(out.getDate(), 31);
  assert.strictEqual(out.getMonth(), 2);
  assert.strictEqual(out.getHours(), 23);
  // Sent on the 1st with 30 days means live through the 31st, not the 30th.
  assert.strictEqual(isLapsed({ status: "sent", expiryDate: out }, new Date(2026, 2, 31, 12)), false);
});

// --- over-reach ------------------------------------------------------------

check("no expiry date never lapses", () => {
  // If this returned true, the first sweep would retire every open-ended
  // proposal in the database.
  assert.strictEqual(isLapsed({ status: "sent", expiryDate: null }, new Date(2030, 0, 1)), false);
  assert.strictEqual(isLapsed({ status: "sent" }, new Date(2030, 0, 1)), false);
});

check("an unparseable expiry date never lapses", () => {
  assert.strictEqual(isLapsed({ status: "sent", expiryDate: "not a date" }, new Date(2030, 0, 1)), false);
});

check("a decided proposal is left alone", () => {
  const past = endOfDay(new Date(2020, 0, 1));
  for (const status of ["accepted", "rejected"]) {
    assert.strictEqual(
      isLapsed({ status, expiryDate: past }, new Date(2026, 0, 1)),
      false,
      `${status} proposal was expired out from under the client`,
    );
  }
});

check("draft and superseded proposals are left alone", () => {
  const past = endOfDay(new Date(2020, 0, 1));
  for (const status of ["draft", "superseded", "expired"]) {
    assert.strictEqual(isLapsed({ status, expiryDate: past }, new Date(2026, 0, 1)), false, status);
  }
});

check("an archived proposal is left alone", () => {
  const past = endOfDay(new Date(2020, 0, 1));
  assert.strictEqual(
    isLapsed({ status: "sent", expiryDate: past, isArchived: true }, new Date(2026, 0, 1)),
    false,
  );
});

check("both live statuses do lapse", () => {
  const past = endOfDay(new Date(2020, 0, 1));
  const now = new Date(2026, 0, 1);
  assert.strictEqual(isLapsed({ status: "sent", expiryDate: past }, now), true);
  assert.strictEqual(isLapsed({ status: "viewed", expiryDate: past }, now), true);
});

// --- coming back -----------------------------------------------------------

check("a client who had opened it returns to viewed, not sent", () => {
  // Reverting to "sent" would contradict the view count sitting beside it on
  // the same row.
  assert.strictEqual(statusOnReinstate({ viewCount: 3, viewedDate: new Date() }), "viewed");
  assert.strictEqual(statusOnReinstate({ viewCount: 0, viewedDate: new Date() }), "viewed");
  assert.strictEqual(statusOnReinstate({ viewCount: 1, viewedDate: null }), "viewed");
});

check("a proposal the client never opened returns to sent", () => {
  assert.strictEqual(statusOnReinstate({ viewCount: 0, viewedDate: null }), "sent");
  assert.strictEqual(statusOnReinstate({ viewCount: null, viewedDate: null }), "sent");
});

// --- days remaining --------------------------------------------------------

check("daysUntilExpiry counts whole days and goes negative once past", () => {
  const expiry = endOfDay(new Date(2026, 2, 31));
  assert.strictEqual(daysUntilExpiry(expiry, new Date(2026, 2, 28, 12)), 4);
  assert.strictEqual(daysUntilExpiry(expiry, new Date(2026, 2, 31, 12)), 1);
  assert.ok((daysUntilExpiry(expiry, new Date(2026, 3, 5, 12)) ?? 0) < 0);
  assert.strictEqual(daysUntilExpiry(null), null);
  assert.strictEqual(daysUntilExpiry("nonsense"), null);
});

console.log(`\n${passed} proposal-expiry checks passed`);
