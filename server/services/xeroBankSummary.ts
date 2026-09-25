/**
 * Reads closing balances out of Xero's Reports/BankSummary.
 *
 * The report is ONE section with a row per bank account:
 *   Header:  Bank Accounts | Opening Balance | Cash Received | Cash Spent | Closing Balance
 *   Row:     <name, Attributes [{ Id: "accountID", Value: <uuid> }]> | … | <closing>
 *   SummaryRow: Total | …
 * The account id lives on the first cell as "accountID" — the money cells carry
 * an "account" attribute too, so match on the first cell and don't rely on
 * section boundaries (an earlier reader assumed a section per account and
 * returned $0 for every account).
 */
export function parseBankSummaryBalances(report: any): Map<string, number> {
  const balances = new Map<string, number>();
  const rows: any[] = report?.Rows ?? [];

  const header = rows.find((r) => r?.RowType === "Header");
  const headerCells: any[] = header?.Cells ?? [];
  const closingIdx = headerCells.findIndex((c) => /closing/i.test(String(c?.Value ?? "")));

  const accountRows = rows.flatMap((r) =>
    r?.RowType === "Section" && Array.isArray(r.Rows) ? r.Rows : r?.RowType === "Row" ? [r] : [],
  );
  for (const row of accountRows) {
    if (row?.RowType !== "Row") continue;
    const cells: any[] = row.Cells ?? [];
    const attrs: any[] = cells[0]?.Attributes ?? [];
    const id = (attrs.find((a) => /^accountid$/i.test(a?.Id)) ?? attrs.find((a) => /^account$/i.test(a?.Id)))?.Value;
    if (!id) continue;
    const cell = closingIdx > 0 && cells[closingIdx] ? cells[closingIdx] : cells[cells.length - 1];
    const value = parseFloat(String(cell?.Value ?? "").replace(/,/g, ""));
    balances.set(id, Number.isFinite(value) ? value : 0);
  }
  return balances;
}
