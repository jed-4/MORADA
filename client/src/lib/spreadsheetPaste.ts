/**
 * The bit of "paste from a spreadsheet" that is the same everywhere.
 *
 * Excel, Numbers and Google Sheets all put the same thing on the clipboard for
 * a selected range: tab-separated cells, newline-separated rows, with a cell
 * wrapped in double quotes if it contains a tab, a newline or a quote. Getting
 * that quoting right is fiddly and getting it wrong is silent — a description
 * containing a tab lands mangled and nobody notices — so there is one copy of
 * it here rather than one per grid that accepts a paste.
 *
 * What each grid still owns is which column MEANS what. That differs per grid
 * and belongs next to the grid.
 */

/** Refuses rather than truncates: a silent cap reads as "it all went in". */
export const MAX_PASTE_ROWS = 1000;

/**
 * Splits TSV honouring Excel's quoting. A plain `split("\t")` breaks the moment
 * someone's text contains a tab or a line break, which is exactly the sort of
 * row that then lands silently mangled.
 */
export function splitPastedRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }  // "" is a literal quote
        else inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell === "") { inQuotes = true; continue; }
    if (ch === "\t") { row.push(cell); cell = ""; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;      // CRLF is one break
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

/**
 * Drops entirely-empty columns from the left and right edges.
 *
 * Selecting a range in a spreadsheet routinely picks up empty spacer columns on
 * one side or the other; left in place they shift every column's meaning.
 * Interior blanks are deliberately kept — there the emptiness is positional
 * information, not padding.
 */
export function trimEmptyEdgeColumns(rows: string[][]): string[][] {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const filled = (c: number) => rows.some(r => (r[c] || "").trim() !== "");
  let start = 0;
  let end = width - 1;
  while (start <= end && !filled(start)) start++;
  while (end >= start && !filled(end)) end--;
  if (start === 0 && end === width - 1) return rows;
  if (start > end) return rows;
  return rows.map(r => r.slice(start, end + 1));
}

/** Is this cell one of the ways a spreadsheet says yes? */
export function parseBooleanCell(raw: string | undefined): boolean | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return undefined;
  if (["y", "yes", "true", "1", "required", "req", "x", "✓", "✔"].includes(v)) return true;
  if (["n", "no", "false", "0", "optional", "opt", "-"].includes(v)) return false;
  return undefined;
}
