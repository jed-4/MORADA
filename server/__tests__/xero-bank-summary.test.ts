/**
 * Reports/BankSummary → closing balance per bank account.
 *
 * The first fixture is Xero's own example from the Xero-OpenAPI spec
 * (getReportBankSummary). An earlier reader looked for a section per account
 * and an "account" attribute on the first cell; the real report has one
 * section, a row per account, and "accountID" — so every account read $0.
 */
import assert from "node:assert";
import { parseBankSummaryBalances } from "../services/xeroBankSummary";

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

const header = {
  RowType: "Header",
  Cells: [{ Value: "Bank Accounts" }, { Value: "Opening Balance" }, { Value: "Cash Received" }, { Value: "Cash Spent" }, { Value: "Closing Balance" }],
};
const accountRow = (id: string, name: string, opening: string, received: string, spent: string, closing: string) => ({
  RowType: "Row",
  Cells: [
    { Value: name, Attributes: [{ Value: id, Id: "accountID" }] },
    { Value: opening },
    { Value: received, Attributes: [{ Value: id, Id: "account" }] },
    { Value: spent, Attributes: [{ Value: id, Id: "account" }] },
    { Value: closing },
  ],
});

check("Xero's documented example", () => {
  const report = {
    ReportType: "BankSummary",
    Rows: [
      header,
      {
        RowType: "Section",
        Title: "",
        Rows: [
          accountRow("03f9cf1e-2deb-4bf1-b0a8-b57f08672eb8", "Big City Bank", "0.00", "110.00", "100.00", "10.00"),
          { RowType: "SummaryRow", Cells: [{ Value: "Total" }, { Value: "0.00" }, { Value: "110.00" }, { Value: "100.00" }, { Value: "10.00" }] },
        ],
      },
    ],
  };
  assert.deepStrictEqual([...parseBankSummaryBalances(report)], [["03f9cf1e-2deb-4bf1-b0a8-b57f08672eb8", 10]]);
});

check("every account in the one section gets its own closing balance", () => {
  const report = {
    Rows: [
      header,
      {
        RowType: "Section",
        Rows: [
          accountRow("a", "Everyday", "120000.00", "50000.00", "30000.00", "140000.00"),
          accountRow("b", "Tax holding", "25000.00", "0.00", "0.00", "25000.00"),
          accountRow("c", "Credit card", "-4200.50", "4200.50", "1800.25", "-1800.25"),
          { RowType: "SummaryRow", Cells: [{ Value: "Total" }, { Value: "" }, { Value: "" }, { Value: "" }, { Value: "163199.75" }] },
        ],
      },
    ],
  };
  const b = parseBankSummaryBalances(report);
  assert.strictEqual(b.size, 3);
  assert.strictEqual(b.get("a"), 140000);
  assert.strictEqual(b.get("b"), 25000);
  assert.strictEqual(b.get("c"), -1800.25);
});

check("the closing column is found by its header, not assumed last", () => {
  const report = {
    Rows: [
      { RowType: "Header", Cells: [{ Value: "Bank Accounts" }, { Value: "Closing Balance" }, { Value: "Note" }] },
      { RowType: "Section", Rows: [{ RowType: "Row", Cells: [{ Value: "X", Attributes: [{ Id: "accountID", Value: "x" }] }, { Value: "1,234.56" }, { Value: "99" }] }] },
    ],
  };
  assert.strictEqual(parseBankSummaryBalances(report).get("x"), 1234.56);
});

check("an empty or missing report is no balances, not a crash", () => {
  assert.strictEqual(parseBankSummaryBalances(undefined).size, 0);
  assert.strictEqual(parseBankSummaryBalances({ Rows: [header] }).size, 0);
});

console.log(`\nxero-bank-summary: ${passed} passed`);
