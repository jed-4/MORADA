/**
 * Turns a block copied out of a spreadsheet into labour tasks.
 *
 * Excel, Numbers and Google Sheets all put the same thing on the clipboard for
 * a selected range: tab-separated cells, newline-separated rows, with a cell
 * wrapped in double quotes if it contains a tab, a newline or a quote. So the
 * whole "import" is a TSV parse — no file, no upload, no column mapping.
 *
 * COLUMN ORDER IS NOT ASSUMED. The first build read Description · Men · Hours
 * because that is the order of the app's own grid, and promptly mangled a real
 * sheet laid out Men · Hours · Description. Which column is which is worked out
 * per paste: from the header row if there is one, otherwise from the shape of
 * the data — the description is the column made of words, the figures are the
 * columns made of numbers.
 *
 * Total Hrs is computed (men × hours), so it is never read from the clipboard.
 */

export interface ParsedLabourRow {
  description: string;
  numMen: number;
  hoursPerMan: number;
}

/** Zero-based indices into the pasted columns. */
export interface ColumnRoles {
  description: number;
  men: number | null;
  hours: number | null;
  /** How the roles were worked out — surfaced so the user can sanity-check. */
  source: "header" | "shape" | "single-column";
}

export interface LabourPasteResult {
  rows: ParsedLabourRow[];
  roles: ColumnRoles | null;
  /** A spreadsheet header row was recognised and dropped. */
  skippedHeader: boolean;
  /** Rows with no description — usually the empty tail of an over-wide selection. */
  skippedBlank: number;
  /** Columns beyond the three that were used. */
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

/**
 * Drops entirely-empty columns from the left and right edges.
 *
 * Selecting a range in a spreadsheet routinely picks up empty spacer columns on
 * one side or the other; left in place they shift every column's meaning.
 * Interior blanks are deliberately kept — there the emptiness is positional
 * information, not padding.
 */
function trimEmptyEdgeColumns(rows: string[][]): string[][] {
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

const DESC_HEADER = /^(description|desc|task|tasks|item|items|activity|scope|works?)$/i;
const MEN_HEADER = /(^|\b)(no\.?\s*men|men|crew|people|persons?|hands|qty|number)\b/i;
const HRS_HEADER = /h(ou)?rs?/i;

/** Roles from a header row, when every one of the three can be placed. */
function rolesFromHeader(cells: string[]): ColumnRoles | null {
  let description = -1, men = -1, hours = -1;
  cells.forEach((raw, i) => {
    const c = (raw || "").trim();
    if (!c) return;
    if (description < 0 && DESC_HEADER.test(c)) { description = i; return; }
    if (men < 0 && MEN_HEADER.test(c)) { men = i; return; }
    if (hours < 0 && HRS_HEADER.test(c)) { hours = i; return; }
  });
  if (description < 0) return null;
  return {
    description,
    men: men < 0 ? null : men,
    hours: hours < 0 ? null : hours,
    source: "header",
  };
}

/**
 * Roles from the data itself: the description is the column that holds words,
 * the figures are the columns that hold numbers, taken left to right.
 *
 * Left-to-right matters. Both real layouts seen so far put crew size before
 * hours-per-man — the app's own grid does, and so does the master Labour
 * Estimating sheet — so the first numeric column is men and the second is hours
 * regardless of which side of the description they sit on.
 */
function rolesFromShape(rows: string[][]): ColumnRoles | null {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  if (width === 0) return null;
  if (width === 1) return { description: 0, men: null, hours: null, source: "single-column" };

  const wordy: number[] = new Array(width).fill(0);
  const numeric: number[] = new Array(width).fill(0);

  for (const row of rows) {
    for (let c = 0; c < width; c++) {
      const cell = (row[c] || "").trim();
      if (!cell) continue;
      if (toNumber(cell) !== undefined) numeric[c]++;
      else wordy[c]++;
    }
  }

  // Description: most word-ish column. Ties go left, which is the conventional
  // layout and keeps behaviour stable for a one-row paste.
  let description = -1;
  for (let c = 0; c < width; c++) {
    if (wordy[c] > 0 && (description < 0 || wordy[c] > wordy[description])) description = c;
  }
  // Every column is numeric — nothing here is a task name.
  if (description < 0) return null;

  // A blank interior column is still a slot. Selecting three columns where the
  // middle one happens to be empty must not slide the third column's figure
  // into the second's meaning, so anything that isn't words counts as a figure
  // position — blank included. (Blank leading/trailing columns are trimmed off
  // before we get here, so this cannot drift on an over-wide selection.)
  const figures: number[] = [];
  for (let c = 0; c < width; c++) {
    if (c !== description && wordy[c] === 0) figures.push(c);
  }
  return {
    description,
    men: figures.length > 0 ? figures[0] : null,
    hours: figures.length > 1 ? figures[1] : null,
    source: "shape",
  };
}

/**
 * A header row is one whose figure columns aren't figures. Any row carrying a
 * real number somewhere is data, never a header.
 */
function looksLikeHeader(cells: string[]): boolean {
  const nonEmpty = cells.filter(c => (c || "").trim() !== "");
  if (nonEmpty.length === 0) return false;
  if (nonEmpty.some(c => toNumber(c) !== undefined)) return false;
  return nonEmpty.some(c => DESC_HEADER.test(c.trim()) || MEN_HEADER.test(c) || HRS_HEADER.test(c));
}

export function parseLabourPaste(text: string): LabourPasteResult {
  const result: LabourPasteResult = {
    rows: [],
    roles: null,
    skippedHeader: false,
    skippedBlank: 0,
    extraColumns: 0,
  };
  if (!text || !text.trim()) return result;

  let raw = splitRows(text).filter(r => r.some(c => (c || "").trim() !== ""));
  if (raw.length === 0) return result;
  raw = trimEmptyEdgeColumns(raw);

  let header: string[] | null = null;
  if (raw.length > 1 && looksLikeHeader(raw[0])) {
    header = raw[0];
    raw = raw.slice(1);
    result.skippedHeader = true;
  }

  const roles = (header && rolesFromHeader(header)) || rolesFromShape(raw);
  if (!roles) return result;
  result.roles = roles;

  const used = [roles.description, roles.men, roles.hours].filter(i => i != null).length;
  const width = raw.reduce((w, r) => Math.max(w, r.length), 0);
  result.extraColumns = Math.max(0, width - used);

  for (const cells of raw) {
    const description = (cells[roles.description] || "").trim();
    const men = roles.men == null ? undefined : toNumber(cells[roles.men]);
    const hours = roles.hours == null ? undefined : toNumber(cells[roles.hours]);

    // A task with no description is not a task. This is what strips the empty
    // tail you get from selecting whole columns.
    if (!description) {
      if (men !== undefined || hours !== undefined) result.skippedBlank++;
      continue;
    }

    result.rows.push({
      description,
      // Blank crew size means one person, which is the grid's own default and
      // the overwhelmingly common case in the source sheets.
      numMen: men !== undefined && men > 0 ? men : 1,
      hoursPerMan: hours !== undefined && hours >= 0 ? hours : 0,
    });
  }

  return result;
}

/** Human-readable summary of the layout that was inferred, for the toast. */
export function describeRoles(roles: ColumnRoles | null): string {
  if (!roles) return "";
  const slots: string[] = [];
  const put = (i: number | null, label: string) => { if (i != null) slots[i] = label; };
  put(roles.description, "Description");
  put(roles.men, "Men");
  put(roles.hours, "Hrs");
  return slots.filter(Boolean).join(" · ");
}
