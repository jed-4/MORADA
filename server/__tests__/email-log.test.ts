/**
 * Email log rules — what a delivery event may change, and what a row means.
 *
 * Two pure functions carry the feature's promises:
 *   - deliveryPatch: webhooks arrive out of order and are retried, so a late
 *     "delivered" must never paper over a bounce, and an "open" (approximate —
 *     Apple Mail opens everything) must never be able to change the outcome.
 *   - deliveryHealth: "Sent" is never shown as good news. It only ever meant a
 *     provider accepted the request.
 *
 * No database, no network.
 *
 * Run with:  NODE_ENV=test npx tsx server/__tests__/email-log.test.ts
 */
import assert from "node:assert";
import { deliveryPatch, parseResendEvent, type ResendDeliveryEvent } from "../services/resendWebhook";
import { deliveryHealth, emailContextHref, emailTypeLabel, hideBearerLinks } from "@shared/emailLog";

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}\n      ${err?.message || err}`);
  }
}

const T = new Date("2026-10-30T01:00:00Z");
const ev = (kind: ResendDeliveryEvent["kind"], detail?: string): ResendDeliveryEvent =>
  ({ messageId: "m1", kind, detail, occurredAt: T });

console.log("deliveryPatch:");

check("delivered moves sent → delivered and stamps deliveredAt", () => {
  const p = deliveryPatch({ status: "sent" }, ev("delivered"))!;
  assert.strictEqual(p.status, "delivered");
  assert.strictEqual(p.deliveredAt, T);
});

check("a late delivered does NOT overwrite a bounce, nor claim delivery", () => {
  assert.strictEqual(deliveryPatch({ status: "bounced" }, ev("delivered")), null);
});

check("a delayed after delivered does not regress it", () => {
  assert.strictEqual(deliveryPatch({ status: "delivered", deliveredAt: T }, ev("delayed")), null);
});

check("bounced after delivered is recorded (late bounce)", () => {
  const p = deliveryPatch({ status: "delivered", deliveredAt: T }, ev("bounced", "Mailbox full"))!;
  assert.strictEqual(p.status, "bounced");
  assert.strictEqual(p.statusDetail, "Mailbox full");
});

check("a retried bounce changes nothing — so it cannot notify twice", () => {
  assert.strictEqual(deliveryPatch({ status: "bounced" }, ev("bounced", "again")), null);
});

check("complaint after delivered is recorded", () => {
  assert.strictEqual(deliveryPatch({ status: "delivered" }, ev("complained"))!.status, "complained");
});

check("an open counts, and implies delivered when that event was lost", () => {
  const p = deliveryPatch({ status: "sent", openCount: 0 }, ev("opened"))!;
  assert.strictEqual(p.status, "delivered");
  assert.strictEqual(p.openCount, 1);
  assert.strictEqual(p.firstOpenedAt, T);
});

check("an open NEVER changes a bounced status", () => {
  const p = deliveryPatch({ status: "bounced", openCount: 0 }, ev("opened"))!;
  assert.strictEqual(p.status, undefined);
  assert.strictEqual(p.openCount, 1);
});

check("a second open keeps the first-open time and increments", () => {
  const first = new Date("2026-10-29T00:00:00Z");
  const p = deliveryPatch({ status: "delivered", deliveredAt: first, firstOpenedAt: first, openCount: 2 }, ev("opened"))!;
  assert.strictEqual(p.openCount, 3);
  assert.strictEqual(p.firstOpenedAt, undefined);
  assert.strictEqual(p.lastOpenedAt, T);
});

check("clicks count separately from opens", () => {
  const p = deliveryPatch({ status: "delivered", deliveredAt: T, clickCount: 0 }, ev("clicked"))!;
  assert.strictEqual(p.clickCount, 1);
  assert.strictEqual(p.openCount, undefined);
});

console.log("parseResendEvent:");

check("maps opened/clicked/delayed, ignores email.sent", () => {
  assert.strictEqual(parseResendEvent({ type: "email.opened", data: { email_id: "x" } })!.kind, "opened");
  assert.strictEqual(parseResendEvent({ type: "email.clicked", data: { email_id: "x" } })!.kind, "clicked");
  assert.strictEqual(parseResendEvent({ type: "email.delivery_delayed", data: { email_id: "x" } })!.kind, "delayed");
  assert.strictEqual(parseResendEvent({ type: "email.sent", data: { email_id: "x" } }), null);
});

check("bounce detail comes through", () => {
  const e = parseResendEvent({ type: "email.bounced", data: { email_id: "x", bounce: { message: "No such user" } } })!;
  assert.strictEqual(e.detail, "No such user");
});

console.log("deliveryHealth:");

const now = new Date("2026-10-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

check("a fresh Resend send is 'Sending', not good news and not a problem", () => {
  const h = deliveryHealth({ status: "sent", provider: "resend", sentAt: hoursAgo(0.1) }, { now, trackingEnabled: true });
  assert.strictEqual(h.key, "sending");
  assert.strictEqual(h.needsAttention, false);
});

check("an unconfirmed Resend send after 4h needs attention", () => {
  const h = deliveryHealth({ status: "sent", provider: "resend", sentAt: hoursAgo(5) }, { now, trackingEnabled: true });
  assert.strictEqual(h.key, "unconfirmed");
  assert.strictEqual(h.needsAttention, true);
});

check("...but not once it is older than a week (predates tracking)", () => {
  const h = deliveryHealth({ status: "sent", provider: "resend", sentAt: hoursAgo(24 * 10) }, { now, trackingEnabled: true });
  assert.strictEqual(h.key, "unconfirmed");
  assert.strictEqual(h.needsAttention, false);
});

check("with tracking off, nothing is flagged unconfirmed", () => {
  const h = deliveryHealth({ status: "sent", provider: "resend", sentAt: hoursAgo(5) }, { now, trackingEnabled: false });
  assert.strictEqual(h.key, "untracked");
  assert.strictEqual(h.needsAttention, false);
});

check("Gmail sends say delivery is not tracked", () => {
  const h = deliveryHealth({ status: "sent", provider: "gmail", sentAt: hoursAgo(5) }, { now, trackingEnabled: true });
  assert.strictEqual(h.key, "gmail_untracked");
  assert.strictEqual(h.needsAttention, false);
});

check("bounced, complained and failed always need attention", () => {
  for (const status of ["bounced", "complained", "failed"]) {
    const h = deliveryHealth({ status, provider: "resend", sentAt: hoursAgo(24 * 30) }, { now, trackingEnabled: true });
    assert.strictEqual(h.needsAttention, true, status);
    assert.strictEqual(h.tone, "negative", status);
  }
});

check("delivered with an open reads 'Opened'", () => {
  assert.strictEqual(deliveryHealth({ status: "delivered", sentAt: hoursAgo(1), openCount: 2 }, { now, trackingEnabled: true }).key, "opened");
});

console.log("labels & links:");

check("onboarding sub-types group under one label", () => {
  assert.strictEqual(emailTypeLabel("onboarding:tips_day3"), "Onboarding");
  assert.strictEqual(emailTypeLabel("something_new"), "Other");
});

check("links need a project, and point at the right page", () => {
  assert.strictEqual(emailContextHref("variation", "v1", "p1"), "/projects/p1/variations/v1");
  assert.strictEqual(emailContextHref("rfq_reminder", "r1", "p1"), "/projects/p1/rfqs/r1");
  assert.strictEqual(emailContextHref("variation", "v1", null), null);
  assert.strictEqual(emailContextHref("password_reset", "u1", "p1"), null);
});

console.log("hideBearerLinks:");

check("portal tokens in hrefs and visible text are masked", () => {
  const url = "https://app.moradaco.com.au/portal/variation/3f1c9a2b-7d44-4e8a-9b1f-0c2d3e4f5a6b";
  const out = hideBearerLinks(`<a href="${url}">Review</a><p>${url}</p>`);
  assert.ok(!out.includes("3f1c9a2b-7d44"), out);
  assert.ok(out.includes("/portal/variation/"), "path kept so the reader sees what it was");
});

check("ordinary links are left alone", () => {
  const html = `<a href="https://lighthouseprojects.com.au/contact">Contact</a>`;
  assert.strictEqual(hideBearerLinks(html), html);
});

console.log(`\nemail-log: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
