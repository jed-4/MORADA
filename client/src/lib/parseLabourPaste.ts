/**
 * Turns a block copied out of a spreadsheet into labour tasks.
 *
 * Excel, Numbers and Google Sheets all put the same thing on the clipboard for
 * a selected range: tab-separated cells, newline-separated rows, with a cell
 * wrapped in double quotes if it contains a tab, a newline or a quote. So the
 * whole "import" is a TSV parse — no file, no upload, no column mapping.
 *
 * The labour grid is Description · No. Men · Hrs / Man, and Total Hrs is
 * computed (numMen × hoursPerMan), so only the first three columns are read.
 * Anything further right is counted and reported, never silently swallowed.
 */

export interface ParsedLabourRow {
  description: string;
  numMen: number;
  hoursPerMan: number;
}

export interface LabourPasteResult {
  rows: ParsedLabourRow[];
  /** A spreadsheet header row was recognised and dropped. */
  skippedHeader: boolean;
  /** Rows with no description — usually the empty tail of an over-wide selection. */
  skippedBlank: number;
  /** Widest row seen beyond the three columns the grid uses. */
  extraColumns: number;
}

/** Refuses rather than truncates: a silent cap reads as "it all went in". */
export const MAX_PASTE_ROWS = 1000;

/**
 * Splits TSV honouring Excel's quoting. A plain `split("\t")` breaks the moment
 * someone's task description contains a tab or a line break, which is exactly
 * the sort of row that then lands silently mangled.
 */
function splitRows(text: string): string[][] {
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
 * "1,200.5", "$95.00", " 3 " → 1200.5, 95, 3. Returns undefined for anything
 * that isn't a number, so the caller can fall back to a default rather than
 * writing NaN into the grid.
 */
function toNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

const HEADER_WORDS = /^(description|task|tasks|item|items|activity|scope)$/i;

/**
 * A header row is one whose numeric columns aren't numeric. Matching on the
 * word "Description" alone would miss re-labelled sheets, and matching on
 * non-numeric alone would eat a real first row that had blank figures — so
 * either signal is enough, but a row with real numbers is never a header.
 */
function looksLikeHeader(cells: string[]): boolean {
  const [first, men, hrs] = cells;
  if (toNumber(men) !== undefined || toNumber(hrs) !== undefined) return false;
  if (HEADER_WORDS.test((first || "").trim())) return true;
  const hasMenish = /men|crew|people|qty|number/i.test(men || "");
  const hasHrsish = /h(ou)?rs?/i.test(hrs || "");
  return hasMenish || hasHrsish;
}

export function parseLabourPaste(text: string): LabourPasteResult {
  const result: LabourPasteResult = {
    rows: [],
    skippedHeader: false,
    skippedBlank: 0,
    extraColumns: 0,
  };
  if (!text || !text.trim()) return result;

  const raw = splitRows(text);

  raw.forEach((cells, index) => {
    result.extraColumns = Math.max(result.extraColumns, cells.length - 3);

    if (index === 0 && raw.length > 1 && looksLikeHeader(cells)) {
      result.skippedHeader = true;
      return;
    }

    const description = (cells[0] || "").trim();
    const men = toNumber(cells[1]);
    const hours = toNumber(cells[2]);

    // A task with no description is not a task. This is what strips the empty
    // tail you get from selecting whole columns.
    if (!description) {
      if (men !== undefined || hours !== undefined) result.skippedBlank++;
      return;
    }

    result.rows.push({
      description,
      // Blank crew size means one person, which is the grid's own default and
      // the overwhelmingly common case in the source sheets.
      numMen: men !== undefined && men > 0 ? men : 1,
      hoursPerMan: hours !== undefined && hours >= 0 ? hours : 0,
    });
  });

  return result;
}
