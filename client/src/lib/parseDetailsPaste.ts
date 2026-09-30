/**
 * Turns a block copied out of a spreadsheet into Details template rows.
 *
 * A Details row is a checklist line for an estimate: a name, optionally some
 * notes, optionally whether it is required. That is a much simpler shape than
 * the labour grid — there are no figures to tell apart — so the column roles
 * are worked out from a header when there is one, and otherwise by position,
 * with the notes column taken only when a second column actually holds prose.
 *
 * The TSV parsing itself is shared: see ./spreadsheetPaste.
 */
import {
  MAX_PASTE_ROWS,
  parseBooleanCell,
  splitPastedRows,
  trimEmptyEdgeColumns,
} from "./spreadsheetPaste";

export { MAX_PASTE_ROWS };

export interface ParsedDetailsRow {
  categoryName: string;
  brainstormNotes: string;
  isRequired: boolean;
}

/** Zero-based indices into the pasted columns. */
export interface DetailsColumnRoles {
  name: number;
  notes: number | null;
  required: number | null;
  /** How the roles were worked out — surfaced so the user can sanity-check. */
  source: "header" | "position";
}

export interface DetailsPasteResult {
  rows: ParsedDetailsRow[];
  roles: DetailsColumnRoles | null;
  /** A spreadsheet header row was recognised and dropped. */
  skippedHeader: boolean;
  /** Rows with no name — usually the empty tail of an over-wide selection. */
  skippedBlank: number;
  /** Columns beyond the ones that were used. */
  extraColumns: number;
}

const NAME_HEADER = /^(item|items|detail|details|category|categories|name|description|desc|task|tasks|check|checks)$/i;
const NOTES_HEADER = /^(notes?|brainstorm|brainstorm notes|comment|comments|detail notes|remarks?)$/i;
const REQUIRED_HEADER = /^(required|require|mandatory|must|needed|compulsory)\??$/i;

function rolesFromHeader(cells: string[]): DetailsColumnRoles | null {
  let name: number | null = null;
  let notes: number | null = null;
  let required: number | null = null;
  cells.forEach((cell, i) => {
    const c = cell.trim();
    if (name === null && NAME_HEADER.test(c)) { name = i; return; }
    if (notes === null && NOTES_HEADER.test(c)) { notes = i; return; }
    if (required === null && REQUIRED_HEADER.test(c)) { required = i; }
  });
  if (name === null) return null;
  return { name, notes, required, source: "header" };
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(c => NAME_HEADER.test(c.trim()))
    || cells.some(c => NOTES_HEADER.test(c.trim()))
    || cells.some(c => REQUIRED_HEADER.test(c.trim()));
}

/**
 * No header: the first column is the name, because that is the only column a
 * Details paste is guaranteed to have.
 *
 * A second column becomes Notes only if some row actually has prose there — a
 * column of yes/no is a Required flag, not notes, and a column of blanks is an
 * artefact of the selection rather than an empty notes column.
 */
function rolesFromPosition(rows: string[][]): DetailsColumnRoles {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  let notes: number | null = null;
  let required: number | null = null;

  for (let c = 1; c < width; c++) {
    const values = rows.map(r => (r[c] ?? "").trim()).filter(v => v !== "");
    if (values.length === 0) continue;
    const allBoolean = values.every(v => parseBooleanCell(v) !== undefined);
    if (allBoolean && required === null) { required = c; continue; }
    if (!allBoolean && notes === null) { notes = c; }
  }
  return { name: 0, notes, required, source: "position" };
}

export function parseDetailsPaste(text: string): DetailsPasteResult {
  const empty: DetailsPasteResult = {
    rows: [], roles: null, skippedHeader: false, skippedBlank: 0, extraColumns: 0,
  };
  if (!text || !text.trim()) return empty;

  let rows = trimEmptyEdgeColumns(
    splitPastedRows(text).filter(r => r.some(c => (c ?? "").trim() !== "")),
  );
  if (rows.length === 0) return empty;

  let skippedHeader = false;
  let roles: DetailsColumnRoles | null = null;

  if (looksLikeHeader(rows[0])) {
    roles = rolesFromHeader(rows[0]);
    // Drop the header whether or not it yielded roles: it is a label row
    // either way, and importing "Item" as a Details line helps nobody.
    rows = rows.slice(1);
    skippedHeader = true;
  }
  if (!roles) roles = rolesFromPosition(rows);
  if (rows.length === 0) return { ...empty, roles, skippedHeader };

  const used = [roles.name, roles.notes, roles.required].filter((n): n is number => n !== null);
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const extraColumns = Math.max(0, width - used.length);

  const parsed: ParsedDetailsRow[] = [];
  let skippedBlank = 0;
  for (const r of rows) {
    const categoryName = (r[roles.name] ?? "").trim();
    if (!categoryName) { skippedBlank++; continue; }
    const notes = roles.notes !== null ? (r[roles.notes] ?? "").trim() : "";
    const req = roles.required !== null ? parseBooleanCell(r[roles.required]) : undefined;
    parsed.push({
      categoryName,
      brainstormNotes: notes,
      // Required is the default for a Details line, so an unreadable or absent
      // flag keeps the stricter behaviour rather than quietly making it optional.
      isRequired: req ?? true,
    });
  }

  return { rows: parsed, roles, skippedHeader, skippedBlank, extraColumns };
}

/** Plain-English summary of how the columns were read, for the confirm toast. */
export function describeDetailsRoles(roles: DetailsColumnRoles | null): string {
  if (!roles) return "";
  const col = (i: number) => String.fromCharCode(65 + i);
  const parts = [`${col(roles.name)} → Item`];
  if (roles.notes !== null) parts.push(`${col(roles.notes)} → Notes`);
  if (roles.required !== null) parts.push(`${col(roles.required)} → Required`);
  return parts.join(" · ");
}
