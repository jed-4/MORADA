import { extractSkusFromText } from "../server/services/billSkuReader";

// A realistic trade invoice: codes in a column, one line with no code at all,
// lines listed in a different order to ours, and a decoy "Order No" number.
const INVOICE = `
THE PLASTER SHOP PTY LTD          TAX INVOICE 88213
ABN 55 123 456 789                Order No: 4471902
Date: 14/08/2026

CODE          DESCRIPTION                          QTY   UNIT    AMOUNT
CC-90         90mm Cove Cornice 3.6m               40    4.20    168.00
PB-13-2412    Fyrchek 13mm 2400x1200 sheet         25   24.90    622.50
              Delivery to site                      1   85.00     85.00
PB-10-2412    Standard 10mm 2400x1200 sheet        60   19.75  1,185.00

                                        SUBTOTAL   2,060.50
                                        GST          206.05
                                        TOTAL      2,266.55
`;

const OUR_LINES = [
  { id: "line-a", description: "13mm Fyrchek 2400x1200" },
  { id: "line-b", description: "10mm Standard 2400x1200" },
  { id: "line-c", description: "90mm Cove Cornice" },
  { id: "line-d", description: "Delivery" },
];

const EXPECTED: Record<string, string | null> = {
  "line-a": "PB-13-2412",
  "line-b": "PB-10-2412",
  "line-c": "CC-90",
  "line-d": null,          // no code printed — must NOT be given the order number
};

(async () => {
  const got = await extractSkusFromText(INVOICE, OUR_LINES);
  let pass = true;
  for (const l of OUR_LINES) {
    const actual = got.get(l.id) ?? null;
    const want = EXPECTED[l.id];
    const ok = actual === want;
    if (!ok) pass = false;
    console.log(`${ok ? "ok  " : "FAIL"} ${l.description.padEnd(26)} expected ${String(want).padEnd(12)} got ${String(actual)}`);
  }
  const invented = [...got.keys()].filter((k) => !OUR_LINES.some((l) => l.id === k));
  console.log(`\ninvented line ids: ${invented.length}`);
  console.log(pass && !invented.length ? "PASS" : "FAILED");
})();
