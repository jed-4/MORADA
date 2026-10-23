/**
 * The nightly catch-up for client invoices.
 *
 * The webhook is one delivery attempt at an endpoint that is not always up —
 * every deploy restarts the app. This sweep is what makes "reconcile by
 * themselves" true rather than "true as long as no event was ever missed".
 *
 * What is pinned here is the matching and the accounting, because that is
 * where a sweep quietly does the wrong thing: touching someone else's invoice
 * in a shared Xero org, or reporting work it did not do.
 */
import assert from "node:assert";
import { reconcileClientInvoicesWithXero, type ReconcileDeps } from "../services/reconcileClientInvoices";

let failures = 0;
const check = (name: string, fn: () => Promise<void>) =>
  fn().then(
    () => console.log(`  ok   ${name}`),
    (e) => { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); },
  );

/** Builds deps over fixtures, recording which invoices were written. */
function deps(opts: {
  connection?: { id: string; isActive: boolean } | null;
  linked?: any[];
  xero?: any[];
  /** id → the state getClientInvoice reports AFTER applyState ran. */
  after?: Record<string, any>;
}): { d: ReconcileDeps; applied: string[] } {
  const applied: string[] = [];
  const d: ReconcileDeps = {
    getConnection: async () => (opts.connection === undefined ? { id: "c1", isActive: true } : opts.connection),
    listLinkedInvoices: async () => opts.linked ?? [],
    listXeroInvoices: async () => opts.xero ?? [],
    applyState: (async (_store: any, args: any) => {
      applied.push(args.invoice.id);
      return { xeroStatus: args.xeroInvoice.Status, amountPaidCents: 0, amountDueCents: 0 };
    }) as any,
    store: { getClientInvoice: async (id: string) => opts.after?.[id] ?? null },
  };
  return { d, applied };
}

const inv = (id: string, xeroId: string, extra: any = {}) =>
  ({ id, xeroInvoiceId: xeroId, status: "sent", paidAmount: 0, ...extra });

async function main() {
  await check("no Xero connection does nothing and reports not connected", async () => {
    const { d, applied } = deps({ connection: null, linked: [inv("a", "X1")] });
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(r.connected, false);
    assert.strictEqual(applied.length, 0);
  });

  await check("an inactive connection is left alone", async () => {
    const { d, applied } = deps({ connection: { id: "c1", isActive: false }, linked: [inv("a", "X1")] });
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(r.connected, false);
    assert.strictEqual(applied.length, 0);
  });

  // THE ONE THAT MATTERS in a shared Xero org.
  await check("an invoice in Xero that is not ours is never touched", async () => {
    const { d, applied } = deps({
      linked: [inv("a", "X1")],
      xero: [{ InvoiceID: "X1", Status: "PAID" }, { InvoiceID: "SOMEONE-ELSE", Status: "PAID" }],
      after: { a: { status: "paid", paidAmount: 500 } },
    });
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.deepStrictEqual(applied, ["a"], "only our own invoice");
    assert.strictEqual(r.checked, 1);
  });

  await check("changed counts only invoices that actually moved", async () => {
    const { d, applied } = deps({
      linked: [inv("a", "X1"), inv("b", "X2")],
      xero: [{ InvoiceID: "X1", Status: "PAID" }, { InvoiceID: "X2", Status: "AUTHORISED" }],
      after: {
        a: { status: "paid", paidAmount: 500 }, // moved
        b: { status: "sent", paidAmount: 0 },   // unchanged
      },
    });
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(applied.length, 2, "both are examined");
    assert.strictEqual(r.checked, 2);
    assert.strictEqual(r.changed, 1, "only one actually moved");
  });

  await check("linked locally but absent from Xero is reported, not silently dropped", async () => {
    const { d } = deps({
      linked: [inv("a", "X1"), inv("b", "X2"), inv("c", "X3")],
      xero: [{ InvoiceID: "X1", Status: "PAID" }],
      after: { a: { status: "paid", paidAmount: 500 } },
    });
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(r.checked, 1);
    assert.strictEqual(r.missingInXero, 2);
  });

  await check("one bad invoice does not abandon the rest of the ledger", async () => {
    const { d } = deps({
      linked: [inv("a", "X1"), inv("b", "X2")],
      xero: [{ InvoiceID: "X1", Status: "PAID" }, { InvoiceID: "X2", Status: "PAID" }],
      after: { b: { status: "paid", paidAmount: 100 } },
    });
    (d as any).applyState = async (_s: any, args: any) => {
      if (args.invoice.id === "a") throw new Error("Xero blew up on this one");
      return { xeroStatus: "PAID", amountPaidCents: 0, amountDueCents: 0 };
    };
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(r.checked, 2, "both attempted");
    assert.strictEqual(r.changed, 1, "the healthy one still updated");
  });

  await check("nothing linked means no call to Xero at all", async () => {
    let called = false;
    const { d } = deps({ linked: [] });
    d.listXeroInvoices = async () => { called = true; return []; };
    const r = await reconcileClientInvoicesWithXero("co", {}, d);
    assert.strictEqual(r.connected, true);
    assert.strictEqual(called, false, "must not spend a Xero request on an empty ledger");
  });

  console.log(failures ? `\n${failures} failing` : "\nall passing");
  process.exit(failures ? 1 : 0);
}
main();
