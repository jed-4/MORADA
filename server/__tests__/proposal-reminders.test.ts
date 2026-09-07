/**
 * Proposal reminder triggers and rendering — pure functions over
 * shared/proposalReminders.ts. No DB, no server, no clock dependency.
 *
 * The failure mode this guards is specific and expensive: a trigger that
 * evaluates to "due" when it should be inert emails every client on the next
 * hourly sweep. So the cases below lean on the null path — a before_expiry
 * reminder on a proposal with no expiry date, an unparseable date, a proposal
 * that was never sent — where returning a Date instead of null is the
 * difference between silence and a mailout.
 */
import assert from "node:assert";
import {
  proposalReminderDueAt,
  renderProposalReminderText,
  describeProposalTrigger,
  DEFAULT_PROPOSAL_REMINDER_TEMPLATES,
} from "@shared/proposalReminders";

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

const SENT = new Date("2026-03-01T00:00:00.000Z");
const EXPIRY = new Date("2026-03-31T00:00:00.000Z");

// --- trigger timing --------------------------------------------------------

check("after_send fires offsetDays after the send date", () => {
  const due = proposalReminderDueAt(
    { trigger: "after_send", offsetDays: 5 },
    { sentDate: SENT, expiryDate: EXPIRY },
  );
  assert.strictEqual(due?.toISOString(), "2026-03-06T00:00:00.000Z");
});

check("before_expiry fires offsetDays BEFORE expiry, not after", () => {
  const due = proposalReminderDueAt(
    { trigger: "before_expiry", offsetDays: 3 },
    { sentDate: SENT, expiryDate: EXPIRY },
  );
  assert.strictEqual(due?.toISOString(), "2026-03-28T00:00:00.000Z");
  assert.ok(due! < EXPIRY, "a 'before expiry' reminder fired after the proposal expired");
});

check("before_expiry with no expiry date never fires", () => {
  // The expensive bug: returning a Date here (or epoch 0) makes the reminder
  // instantly overdue for every proposal without an expiry date, and the next
  // sweep emails all of them.
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "before_expiry", offsetDays: 3 }, { sentDate: SENT, expiryDate: null }),
    null,
  );
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "before_expiry", offsetDays: 3 }, { sentDate: SENT }),
    null,
  );
});

check("after_send on a proposal that was never sent never fires", () => {
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "after_send", offsetDays: 5 }, { sentDate: null, expiryDate: EXPIRY }),
    null,
  );
});

check("an unparseable date never fires", () => {
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "after_send", offsetDays: 5 }, { sentDate: "not a date" }),
    null,
  );
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "before_expiry", offsetDays: 3 }, { expiryDate: "" }),
    null,
  );
});

check("an unknown trigger never fires", () => {
  assert.strictEqual(
    proposalReminderDueAt({ trigger: "on_a_whim", offsetDays: 1 }, { sentDate: SENT, expiryDate: EXPIRY }),
    null,
  );
});

check("ISO date strings work as well as Date objects", () => {
  const due = proposalReminderDueAt(
    { trigger: "after_send", offsetDays: 5 },
    { sentDate: "2026-03-01T00:00:00.000Z" },
  );
  assert.strictEqual(due?.toISOString(), "2026-03-06T00:00:00.000Z");
});

check("offsetDays 0 means the moment itself, not never", () => {
  const afterSend = proposalReminderDueAt({ trigger: "after_send", offsetDays: 0 }, { sentDate: SENT });
  assert.strictEqual(afterSend?.toISOString(), SENT.toISOString());
  const atExpiry = proposalReminderDueAt({ trigger: "before_expiry", offsetDays: 0 }, { expiryDate: EXPIRY });
  assert.strictEqual(atExpiry?.toISOString(), EXPIRY.toISOString());
});

// --- rendering -------------------------------------------------------------

const ctx = {
  proposal: {
    id: "prop-1",
    proposalNumber: "PROP-2026-0007",
    name: "Kitchen and bathroom renovation",
    expiryDate: EXPIRY,
    totalAmount: 8_800_000,
  },
  recipientName: "Linda",
  senderName: "Jed Smith",
  companyName: "Lighthouse Projects",
  projectName: "42 Bay Road",
  baseUrl: "https://app.moradaco.com.au",
  shareToken: "tok-abc",
  now: new Date("2026-03-25T00:00:00.000Z"),
};

check("placeholders substitute, including the tokenised portal link", () => {
  const out = renderProposalReminderText(
    "Hi {{client_name}}, {{proposal_name}} for {{project_name}} — {{portal_link}}",
    ctx,
  );
  assert.strictEqual(
    out,
    "Hi Linda, Kitchen and bathroom renovation for 42 Bay Road — " +
      "https://app.moradaco.com.au/portal/proposal/prop-1?token=tok-abc",
  );
});

check("the portal link is empty rather than broken when there is no token", () => {
  // A link without its share token 401s. Better to render nothing than to send
  // a client a link that refuses them.
  const out = renderProposalReminderText("{{portal_link}}", { ...ctx, shareToken: null });
  assert.strictEqual(out, "");
});

check("valid_until and days_remaining read in en-AU", () => {
  const out = renderProposalReminderText("{{valid_until}} / {{days_remaining}}", ctx);
  assert.strictEqual(out, "31 Mar 2026 / 6");
});

check("days_remaining floors at 0 rather than going negative", () => {
  const out = renderProposalReminderText("{{days_remaining}}", {
    ...ctx,
    now: new Date("2026-04-10T00:00:00.000Z"),
  });
  assert.strictEqual(out, "0");
});

check("a missing client name degrades to a usable greeting", () => {
  const out = renderProposalReminderText("Hi {{client_name}},", { ...ctx, recipientName: null });
  assert.strictEqual(out, "Hi there,");
});

check("an unknown placeholder is left verbatim, not blanked", () => {
  // A visible {{typo}} in the preview is a mistake you catch; a silently empty
  // string is one the client finds.
  const out = renderProposalReminderText("Hi {{client_nmae}},", ctx);
  assert.strictEqual(out, "Hi {{client_nmae}},");
});

// --- seeded defaults -------------------------------------------------------

check("the seeded cadence is two emails: day 5, then 3 days before expiry", () => {
  assert.strictEqual(DEFAULT_PROPOSAL_REMINDER_TEMPLATES.length, 2);
  const [first, second] = DEFAULT_PROPOSAL_REMINDER_TEMPLATES;
  assert.strictEqual(first.trigger, "after_send");
  assert.strictEqual(first.offsetDays, 5);
  assert.strictEqual(second.trigger, "before_expiry");
  assert.strictEqual(second.offsetDays, 3);
});

check("every seeded template renders with no placeholder left over", () => {
  for (const t of DEFAULT_PROPOSAL_REMINDER_TEMPLATES) {
    const subject = renderProposalReminderText(t.subject, ctx);
    const body = renderProposalReminderText(t.body, ctx);
    assert.ok(!/\{\{/.test(subject), `unsubstituted token in subject of "${t.name}": ${subject}`);
    assert.ok(!/\{\{/.test(body), `unsubstituted token in body of "${t.name}": ${body}`);
    assert.ok(body.includes("https://app.moradaco.com.au/portal/proposal/"), `"${t.name}" has no portal link`);
  }
});

check("trigger descriptions read as English", () => {
  assert.strictEqual(describeProposalTrigger({ trigger: "after_send", offsetDays: 5 }), "5 days after sending");
  assert.strictEqual(describeProposalTrigger({ trigger: "after_send", offsetDays: 1 }), "1 day after sending");
  assert.strictEqual(describeProposalTrigger({ trigger: "after_send", offsetDays: 0 }), "Immediately after sending");
  assert.strictEqual(describeProposalTrigger({ trigger: "before_expiry", offsetDays: 3 }), "3 days before it expires");
  assert.strictEqual(describeProposalTrigger({ trigger: "before_expiry", offsetDays: 0 }), "On the expiry date");
});

console.log(`\n${passed} proposal-reminder checks passed`);
