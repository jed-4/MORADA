/**
 * Defects v2 stages 2–3: trade link + token rules, trade actions, the daily
 * digest, owner overdue reminders, handover helpers and backcharge money
 * (shared/defectTrades.ts).
 * Run with:  NODE_ENV=test npx tsx server/__tests__/defects-trades.test.ts
 */
process.env.NODE_ENV = process.env.NODE_ENV || "test";

import assert from "node:assert";
import { randomBytes } from "node:crypto";
import {
  TRADE_VISIBLE_STAGES,
  isWellFormedTradeToken,
  tradeTransitionTarget,
  tradeLinkShouldRevoke,
  tradeLinkIsLive,
  isDigestDue,
  localDateAndHour,
  buildDigest,
  ownerOverdueReminderDue,
  parseHandoverJobStages,
  splitHandoverPhotos,
  parseBackchargeDollars,
  validBackchargeCents,
  backchargeTotalsByTrade,
  MAX_BACKCHARGE_CENTS,
} from "@shared/defectTrades";
import { DEFECT_JOB_STAGES, DEFECT_STAGES, checkDefectTransition } from "@shared/defects";
import { gstSplit } from "@shared/money";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("trade tokens and links:");

check("a real token (32 random bytes, base64url) is well formed", () => {
  for (let i = 0; i < 50; i++) assert.ok(isWellFormedTradeToken(randomBytes(32).toString("base64url")));
});

check("short, odd or non-string tokens are rejected before the DB", () => {
  for (const bad of ["", "abc", "x".repeat(39), "a/b".repeat(20), "a b".repeat(20), "x".repeat(129), null, undefined, 42, {}]) {
    assert.strictEqual(isWellFormedTradeToken(bad as any), false, String(bad));
  }
});

check("a revoked link is not live; a missing one is not live", () => {
  assert.strictEqual(tradeLinkIsLive({ revokedAt: null }), true);
  assert.strictEqual(tradeLinkIsLive({ revokedAt: new Date() }), false);
  assert.strictEqual(tradeLinkIsLive(null), false);
});

check("the trade sees sent/accepted/rejected/fixed — never open or closed", () => {
  assert.deepStrictEqual([...TRADE_VISIBLE_STAGES].sort(), ["accepted", "fixed", "rejected", "sent"]);
});

check("link is revoked only when nothing open is left for the trade", () => {
  assert.strictEqual(tradeLinkShouldRevoke([]), true);
  assert.strictEqual(tradeLinkShouldRevoke(["closed", "closed"]), true);
  // Not yet sent doesn't keep a link alive — sending makes a new one.
  assert.strictEqual(tradeLinkShouldRevoke(["open", "closed"]), true);
  for (const s of ["sent", "accepted", "rejected", "fixed"]) {
    assert.strictEqual(tradeLinkShouldRevoke(["closed", s]), false, s);
  }
});

console.log("trade actions:");

check("accept: sent/rejected → accepted; nothing else", () => {
  assert.deepStrictEqual(tradeTransitionTarget("sent", "accept"), { ok: true, to: "accepted" });
  assert.deepStrictEqual(tradeTransitionTarget("rejected", "accept"), { ok: true, to: "accepted" });
  for (const s of ["open", "accepted", "fixed", "closed"]) assert.strictEqual(tradeTransitionTarget(s, "accept").ok, false, s);
});

check("mark fixed: sent/accepted/rejected → fixed; never from open/fixed/closed", () => {
  for (const s of ["sent", "accepted", "rejected"]) assert.deepStrictEqual(tradeTransitionTarget(s, "fixed"), { ok: true, to: "fixed" });
  for (const s of ["open", "fixed", "closed"]) assert.strictEqual(tradeTransitionTarget(s, "fixed").ok, false, s);
});

check("every trade move is also a legal stage-1 transition (never a close)", () => {
  for (const from of DEFECT_STAGES) {
    for (const action of ["accept", "fixed"] as const) {
      const t = tradeTransitionTarget(from, action);
      if (!t.ok) continue;
      assert.notStrictEqual(t.to, "closed");
      const c = checkDefectTransition(from, t.to, { canEdit: true, canClose: false });
      assert.ok(c.ok, `${from} → ${t.to}`);
    }
  }
});

console.log("digest timing (company time zone):");

const SYD = "Australia/Sydney";
// 2026-11-19 is AEDT (UTC+11): 07:00 local = 20:00 UTC the day before.
const at = (iso: string) => new Date(iso);

check("local date/hour in Sydney", () => {
  assert.deepStrictEqual(localDateAndHour(at("2026-11-18T20:30:00Z"), SYD), { date: "2026-11-19", hour: 7 });
  assert.deepStrictEqual(localDateAndHour(at("2026-11-18T19:59:00Z"), SYD), { date: "2026-11-19", hour: 6 });
});

check("not due before 7am local", () => {
  assert.strictEqual(isDigestDue({ now: at("2026-11-18T19:59:00Z"), timeZone: SYD, lastDigestAt: null }), false);
});

check("due at/after 7am when never sent", () => {
  assert.strictEqual(isDigestDue({ now: at("2026-11-18T20:00:00Z"), timeZone: SYD, lastDigestAt: null }), true);
  assert.strictEqual(isDigestDue({ now: at("2026-11-19T03:00:00Z"), timeZone: SYD, lastDigestAt: null }), true);
});

check("once per local day — a later sweep the same day does nothing", () => {
  const sentToday = at("2026-11-18T20:05:00Z"); // 7:05am 19 Nov local
  assert.strictEqual(isDigestDue({ now: at("2026-11-19T02:00:00Z"), timeZone: SYD, lastDigestAt: sentToday }), false);
  // Next morning it's due again.
  assert.strictEqual(isDigestDue({ now: at("2026-11-19T20:01:00Z"), timeZone: SYD, lastDigestAt: sentToday }), true);
});

check("a different company time zone moves the hour", () => {
  // 7am in Perth (UTC+8) = 23:00 UTC; at 21:00 UTC it's 5am in Perth.
  assert.strictEqual(isDigestDue({ now: at("2026-11-18T21:00:00Z"), timeZone: "Australia/Perth", lastDigestAt: null }), false);
  assert.strictEqual(isDigestDue({ now: at("2026-11-18T23:00:00Z"), timeZone: "Australia/Perth", lastDigestAt: null }), true);
});

check("a junk time zone falls back to Sydney instead of throwing", () => {
  assert.deepStrictEqual(localDateAndHour(at("2026-11-18T20:30:00Z"), "Not/AZone"), { date: "2026-11-19", hour: 7 });
});

console.log("digest content:");

const now = at("2026-11-19T00:00:00Z");
const d = (id: string, stage: string, due: string | null, sent: string | null) => ({
  id, stage, dueDate: due ? at(due) : null, sentToTradeAt: sent ? at(sent) : null,
});

check("first digest lists everything live as new", () => {
  const r = buildDigest([d("a", "sent", "2026-12-01", "2026-11-10"), d("b", "accepted", null, "2026-11-01")], null, now);
  assert.deepStrictEqual(r.fresh.map((x) => x.id), ["a", "b"]);
  assert.strictEqual(r.overdue.length, 0);
  assert.strictEqual(r.send, true);
});

check("later digests: new = sent since the last digest; overdue listed once", () => {
  const last = at("2026-11-18T00:00:00Z");
  const rows = [
    d("old", "sent", "2026-12-01", "2026-11-10"),
    d("new", "sent", "2026-12-01", "2026-11-18T05:00:00Z"),
    d("late", "accepted", "2026-11-15", "2026-11-18T06:00:00Z"),
  ];
  const r = buildDigest(rows, last, now);
  assert.deepStrictEqual(r.fresh.map((x) => x.id), ["new"]);
  assert.deepStrictEqual(r.overdue.map((x) => x.id), ["late"]);
});

check("fixed (waiting on builder) and closed never appear; nothing → no email", () => {
  const r = buildDigest([d("f", "fixed", "2026-11-01", "2026-11-18T05:00:00Z"), d("c", "closed", "2026-11-01", null)], at("2026-11-18T00:00:00Z"), now);
  assert.deepStrictEqual(r, { fresh: [], overdue: [], send: false });
});

check("nothing new and nothing overdue → skip", () => {
  const r = buildDigest([d("old", "sent", "2026-12-01", "2026-11-10")], at("2026-11-18T00:00:00Z"), now);
  assert.strictEqual(r.send, false);
});

console.log("owner overdue reminders:");

check("once a local day, only while overdue and owned", () => {
  const base = { stage: "sent", dueDate: at("2026-11-17T00:00:00Z"), ownerUserId: "u1", now: at("2026-11-18T21:00:00Z"), timeZone: SYD };
  assert.strictEqual(ownerOverdueReminderDue({ ...base, remindedAt: null }), true);
  assert.strictEqual(ownerOverdueReminderDue({ ...base, remindedAt: at("2026-11-18T20:10:00Z") }), false);
  assert.strictEqual(ownerOverdueReminderDue({ ...base, remindedAt: at("2026-11-17T20:10:00Z") }), true);
  assert.strictEqual(ownerOverdueReminderDue({ ...base, ownerUserId: null, remindedAt: null }), false);
  assert.strictEqual(ownerOverdueReminderDue({ ...base, stage: "fixed", remindedAt: null }), false);
  assert.strictEqual(ownerOverdueReminderDue({ ...base, dueDate: at("2026-12-30T00:00:00Z"), remindedAt: null }), false);
});

console.log("handover:");

check("job stages default to pre-handover + handover; junk ignored", () => {
  const valid = DEFECT_JOB_STAGES as unknown as string[];
  assert.deepStrictEqual(parseHandoverJobStages(undefined, valid), ["pre_handover", "handover"]);
  assert.deepStrictEqual(parseHandoverJobStages("nope,;drop table", valid), ["pre_handover", "handover"]);
  assert.deepStrictEqual(parseHandoverJobStages("dlp,dlp,warranty", valid), ["dlp", "warranty"]);
});

check("before/after split: after + trade photos are 'after', untagged are 'before'", () => {
  const r = splitHandoverPhotos([{ kind: "before" }, { kind: null }, { kind: "after" }, { kind: "trade" }, {}]);
  assert.strictEqual(r.before.length, 3);
  assert.strictEqual(r.after.length, 2);
});

console.log("backcharge money (cents inc GST via shared/money.ts):");

check("typed dollars → integer cents", () => {
  assert.strictEqual(parseBackchargeDollars("1250.50"), 125050);
  assert.strictEqual(parseBackchargeDollars("$1,250.5"), 125050);
  assert.strictEqual(parseBackchargeDollars(300), 30000);
  assert.strictEqual(parseBackchargeDollars("0.1"), 10);
  // Float trap: 0.29 * 100 = 28.999… — must still be 29 cents.
  assert.strictEqual(parseBackchargeDollars("0.29"), 29);
  assert.strictEqual(parseBackchargeDollars("19.99"), 1999);
});

check("zero, negative, 3dp, words and huge amounts are refused", () => {
  for (const bad of ["0", "0.00", "-5", "1.234", "ten", "", " ", null, undefined, "1e5", "10000000.01"]) {
    assert.strictEqual(parseBackchargeDollars(bad as any), null, String(bad));
  }
  assert.strictEqual(parseBackchargeDollars("1000000"), MAX_BACKCHARGE_CENTS);
});

check("cents from the API must be a positive integer in range", () => {
  assert.strictEqual(validBackchargeCents(12345), 12345);
  for (const bad of [0, -1, 1.5, "100", null, MAX_BACKCHARGE_CENTS + 1]) assert.strictEqual(validBackchargeCents(bad as any), null, String(bad));
});

check("totals per trade add up, split GST exactly, biggest first", () => {
  const t = backchargeTotalsByTrade([
    { contactId: "a", contactName: "Acme Plumbing", cents: 11000 },
    { contactId: "b", contactName: "Bob's Tiling", cents: 5500 },
    { contactId: "a", contactName: "Acme Plumbing", cents: 2201 },
    { contactId: "b", contactName: "Bob's Tiling", cents: null },
    { contactId: null, contactName: null, cents: 100 },
  ]);
  assert.deepStrictEqual(t.map((x) => [x.contactName, x.count, x.totalCents]), [
    ["Acme Plumbing", 2, 13201],
    ["Bob's Tiling", 1, 5500],
    ["No trade", 1, 100],
  ]);
  for (const x of t) {
    assert.strictEqual(x.exGstCents + x.gstCents, x.totalCents);
    assert.deepStrictEqual({ exGst: x.exGstCents, gst: x.gstCents }, gstSplit(x.totalCents));
  }
  assert.strictEqual(t[0].exGstCents, 12001); // 13201 / 1.1 = 12000.9 → 12001
});

console.log(`\n${passed} checks passed`);
