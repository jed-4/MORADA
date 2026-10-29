/**
 * The payment schedule a client sees.
 *
 * One requirement carries this whole feature: a builder shares what a claim is
 * expected to be, then goes on editing the draft, and the client's figure does
 * NOT move. Everything here exists to pin that — and to pin the thing that
 * would quietly break it, which is a live money field leaking into the
 * forecast projection.
 *
 * Run: npx tsx server/__tests__/client-payment-schedule.test.ts
 */
import assert from "node:assert/strict";
import {
  isClaimShared,
  isClaimIssued,
  isClaimInClientSchedule,
  claimStage,
  clientFacingClaimCents,
  sharedAmountDrift,
  hasSharedAmountDrift,
} from "@shared/claimSchedule";
import { projectClientClaimForecast } from "../clientProjections";

let passed = 0;
const check = (_label: string, fn: () => void) => { fn(); passed++; };

const SHARED_AT = new Date("2026-10-27T01:00:00Z");

/** A draft the builder has shared at $50,000 and has since edited up to $52,000. */
const sharedDraft = {
  id: "inv-1",
  projectId: "proj-1",
  name: "Lock-up",
  status: "draft",
  invoiceDate: new Date("2026-07-24"),
  dueDate: new Date("2026-08-07"),
  totalAmount: 5_200_000,
  clientSharedAmountCents: 5_000_000,
  clientSharedAt: SHARED_AT,
};

const unsharedDraft = { ...sharedDraft, id: "inv-2", clientSharedAmountCents: null, clientSharedAt: null };
const sentClaim = { ...sharedDraft, id: "inv-3", status: "sent" };

// --- what belongs in the client's schedule ----------------------------------

check("an unshared draft is not in the client's schedule at all", () => {
  // The guarantee that makes a draft safe to keep working on.
  assert.equal(isClaimInClientSchedule(unsharedDraft), false);
});

check("a shared draft is in the schedule", () => {
  assert.equal(isClaimInClientSchedule(sharedDraft), true);
});

check("an issued claim is in the schedule whether or not it was shared", () => {
  for (const status of ["sent", "partial", "paid", "overdue"]) {
    assert.equal(isClaimInClientSchedule({ ...unsharedDraft, status }), true, status);
  }
});

check("an APPROVED claim is not issued — Jed's call, supersede at sent", () => {
  // "approved" means authorised internally and is the point it pushes to Xero.
  // Treating it as issued would show the client the real claim before it was
  // sent to them.
  assert.equal(isClaimIssued({ ...sharedDraft, status: "approved" }), false);
  assert.equal(claimStage({ ...sharedDraft, status: "approved" }), "upcoming");
});

check("an approved-but-unshared claim stays invisible", () => {
  assert.equal(isClaimInClientSchedule({ ...unsharedDraft, status: "approved" }), false);
});

// --- which number the client gets -------------------------------------------

check("a shared draft shows the FROZEN figure, never the live total", () => {
  // The heart of it. The draft has moved to $52,000 and the client sees
  // $50,000 until the builder shares again.
  assert.equal(clientFacingClaimCents(sharedDraft), 5_000_000);
  assert.notEqual(clientFacingClaimCents(sharedDraft), sharedDraft.totalAmount);
});

check("editing the draft does not move the client's figure", () => {
  for (const total of [5_200_000, 9_999_900, 0, 1]) {
    assert.equal(clientFacingClaimCents({ ...sharedDraft, totalAmount: total }), 5_000_000,
      `total ${total} leaked into the client's figure`);
  }
});

check("once sent, the client sees the real total", () => {
  assert.equal(clientFacingClaimCents(sentClaim), 5_200_000);
});

check("a shared claim with no amount shows nothing, not $0", () => {
  // Should not happen, but "$0 due" is a worse lie than a dash.
  assert.equal(clientFacingClaimCents({ ...sharedDraft, clientSharedAmountCents: null }), null);
});

check("the stage a client reads is never the builder's word 'draft'", () => {
  assert.equal(claimStage(sharedDraft), "upcoming");
  assert.equal(claimStage(sentClaim), "issued");
  assert.equal(claimStage({ ...sentClaim, status: "paid" }), "paid");
  assert.equal(claimStage({ ...sentClaim, status: "partial" }), "issued");
});

// --- drift, which only the builder sees -------------------------------------

check("drift is the gap between the live total and what was shared", () => {
  assert.equal(sharedAmountDrift(sharedDraft), 200_000);
  assert.equal(hasSharedAmountDrift(sharedDraft), true);
});

check("a claim matching what was shared has no drift", () => {
  assert.equal(hasSharedAmountDrift({ ...sharedDraft, totalAmount: 5_000_000 }), false);
});

check("drift can be negative — a claim can come down", () => {
  assert.equal(sharedAmountDrift({ ...sharedDraft, totalAmount: 4_000_000 }), -1_000_000);
  assert.equal(hasSharedAmountDrift({ ...sharedDraft, totalAmount: 4_000_000 }), true);
});

check("an unshared or issued claim cannot drift", () => {
  // Nothing was promised; or the number they see IS the real one.
  assert.equal(hasSharedAmountDrift(unsharedDraft), false);
  assert.equal(hasSharedAmountDrift(sentClaim), false);
});

// --- the projection: an allow-list, and it must stay one --------------------

/** Every field name that would reveal the live claim. */
const LIVE_MONEY_FIELDS = [
  "totalAmount", "subtotal", "gstAmount", "markupAmount", "paidAmount",
  "balanceAmount", "lineBreakdown", "contractClaimRows", "lineItemClaims",
  "lockedContractPrice", "status",
];

check("the forecast carries NO live money field", () => {
  const out = projectClientClaimForecast({
    ...sharedDraft,
    subtotal: 4_727_273,
    gstAmount: 472_727,
    markupAmount: 100_000,
    paidAmount: 0,
    balanceAmount: 5_200_000,
    lineBreakdown: [{ description: "Lock-up stage", amountIncCents: 5_200_000 }],
    contractClaimRows: [{ id: "r1", claimPercent: 20 }],
    lineItemClaims: { "item-1": 20 },
    lockedContractPrice: 49_738_473,
  });
  for (const field of LIVE_MONEY_FIELDS) {
    assert.equal(field in out, false, `forecast leaked "${field}" — the client would see the live claim`);
  }
});

check("the forecast carries only the frozen figure", () => {
  const out = projectClientClaimForecast(sharedDraft);
  assert.equal(out.amountIncCents, 5_000_000);
  assert.equal(out.stage, "upcoming");
  assert.equal(out.name, "Lock-up");
});

check("the forecast is an allow-list, so an unknown field cannot ride along", () => {
  // A field added to the invoices table must not reach the client because
  // somebody spread the row. This is why the projection builds a new object.
  const out = projectClientClaimForecast({
    ...sharedDraft,
    internalNotes: "client is slow to pay",
    xeroInvoiceId: "xero-123",
    companyId: "company-1",
    costToDate: 4_100_000,
  });
  assert.deepEqual(
    Object.keys(out).sort(),
    ["amountIncCents", "dueDate", "id", "invoiceDate", "name", "projectId", "sharedAt", "stage"],
  );
});

check("the forecast carries no invoice number", () => {
  // An unsent claim has not been issued; a number invites the client to treat
  // it as a document they can pay.
  const out = projectClientClaimForecast({ ...sharedDraft, invoiceNumber: "INV-1042" });
  assert.equal("invoiceNumber" in out, false);
});

// --- shapes that must not crash ---------------------------------------------

check("a missing or junk claim is simply not in the schedule", () => {
  for (const junk of [null, undefined, {}, { status: null }]) {
    assert.equal(isClaimInClientSchedule(junk as any), false);
    assert.equal(hasSharedAmountDrift(junk as any), false);
  }
  assert.equal(clientFacingClaimCents(null), null);
});

check("sharing is decided by the timestamp, not the amount", () => {
  // A claim legitimately shared at $0 (a nil claim) is still shared.
  assert.equal(isClaimShared({ ...sharedDraft, clientSharedAmountCents: 0 }), true);
  assert.equal(clientFacingClaimCents({ ...sharedDraft, clientSharedAmountCents: 0 }), 0);
  assert.equal(isClaimShared({ ...sharedDraft, clientSharedAt: null }), false);
});

console.log(`client payment schedule: ${passed} passed, 0 failed`);
