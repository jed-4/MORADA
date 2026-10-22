/**
 * Xero → Morada client invoice state.
 *
 * The bug these pin: the webhook and the Sync button each carried their own
 * copy of this logic, and the webhook's copy omitted SentToContact. An invoice
 * sent from inside Xero therefore stayed "approved" in Morada until somebody
 * pressed Sync — which read as "client invoices don't auto-sync".
 *
 * Both paths now call one function, so the test asserts the BEHAVIOUR is
 * identical apart from the audit label on the payment row.
 */
import assert from "node:assert";
import {
  applyXeroClientInvoiceState,
  type ClientInvoiceStateStore,
} from "../services/xeroClientInvoiceState";

type Call = { fn: string; args: any[] };

function spyStore() {
  const calls: Call[] = [];
  const store: ClientInvoiceStateStore = {
    async updateClientInvoice(id, patch) { calls.push({ fn: "update", args: [id, patch] }); },
    async createClientInvoicePayment(row) { calls.push({ fn: "payment", args: [row] }); },
    async syncClientInvoicePaidStatus(id) { calls.push({ fn: "recompute", args: [id] }); },
  };
  return { store, calls };
}

const INV = { id: "inv-1", status: "approved", paidAmount: 0 };
let failures = 0;
const check = (name: string, fn: () => Promise<void>) =>
  fn().then(
    () => console.log(`  ok   ${name}`),
    (e) => { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); },
  );

async function main() {
  // THE REGRESSION. Before the fix, the webhook path did not do this.
  for (const source of ["webhook", "manual"] as const) {
    await check(`${source}: SentToContact moves an approved invoice to sent`, async () => {
      const { store, calls } = spyStore();
      await applyXeroClientInvoiceState(store, {
        invoice: INV, source,
        xeroInvoice: { Status: "AUTHORISED", SentToContact: true, AmountPaid: 0, AmountDue: 100 },
      });
      const sent = calls.find((c) => c.fn === "update" && c.args[1].status === "sent");
      assert.ok(sent, "expected the invoice to be marked sent");
    });
  }

  await check("a paid invoice is never walked backwards to sent", async () => {
    const { store, calls } = spyStore();
    await applyXeroClientInvoiceState(store, {
      invoice: { id: "inv-2", status: "paid", paidAmount: 10_000 }, source: "webhook",
      xeroInvoice: { Status: "PAID", SentToContact: true, AmountPaid: 100, AmountDue: 0 },
    });
    assert.ok(!calls.some((c) => c.fn === "update" && c.args[1].status === "sent"));
  });

  await check("a payment increase is recorded as the DIFFERENCE, not Xero's total", async () => {
    const { store, calls } = spyStore();
    await applyXeroClientInvoiceState(store, {
      invoice: { id: "inv-3", status: "sent", paidAmount: 40_000 }, source: "webhook",
      xeroInvoice: { Status: "AUTHORISED", AmountPaid: 700, AmountDue: 300 },
    });
    const pay = calls.find((c) => c.fn === "payment");
    assert.ok(pay, "expected a payment row");
    assert.strictEqual(pay!.args[0].amount, 30_000, "must be 70,000 − 40,000");
  });

  await check("no increase still recomputes paid status", async () => {
    const { store, calls } = spyStore();
    await applyXeroClientInvoiceState(store, {
      invoice: { id: "inv-4", status: "sent", paidAmount: 70_000 }, source: "webhook",
      xeroInvoice: { Status: "AUTHORISED", AmountPaid: 700, AmountDue: 0 },
    });
    assert.ok(!calls.some((c) => c.fn === "payment"), "no new payment row");
    assert.ok(calls.some((c) => c.fn === "recompute"), "expected a recompute");
  });

  for (const Status of ["VOIDED", "DELETED"]) {
    await check(`${Status} in Xero reverts the invoice to draft`, async () => {
      const { store, calls } = spyStore();
      await applyXeroClientInvoiceState(store, {
        invoice: { id: "inv-5", status: "sent", paidAmount: 0 }, source: "webhook",
        xeroInvoice: { Status, AmountPaid: 0, AmountDue: 0 },
      });
      assert.ok(calls.some((c) => c.fn === "update" && c.args[1].status === "draft"));
    });
  }

  await check("webhook and button differ ONLY in the payment audit label", async () => {
    const rows: any[] = [];
    for (const source of ["webhook", "manual"] as const) {
      const { store, calls } = spyStore();
      await applyXeroClientInvoiceState(store, {
        invoice: { id: "inv-6", status: "approved", paidAmount: 0 }, source,
        xeroInvoice: { Status: "AUTHORISED", SentToContact: true, AmountPaid: 250, AmountDue: 0 },
      });
      rows.push({
        shape: calls.map((c) => c.fn).join(","),
        row: calls.find((c) => c.fn === "payment")!.args[0],
      });
    }
    assert.strictEqual(rows[0].shape, rows[1].shape, "same sequence of writes");
    assert.strictEqual(rows[0].row.amount, rows[1].row.amount, "same amount");
    assert.notStrictEqual(rows[0].row.paymentMethod, rows[1].row.paymentMethod, "label differs");
  });

  console.log(failures ? `\n${failures} failing` : "\nall passing");
  process.exit(failures ? 1 : 0);
}
main();
