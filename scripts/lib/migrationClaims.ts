/**
 * What the migration files claim to have done.
 *
 * Migrations here are hand-applied numbered .sql files with no tracking table,
 * so every question about them ("is this on prod?", "does the ORM still declare
 * it?") is answered by parsing the SQL. This is the one parser, shared by
 * scripts/check-migrations.ts (SQL vs a live database) and
 * scripts/check-schema-sync.ts (SQL vs shared/schema.ts).
 *
 * Scoping matters more than it looks. An earlier version matched
 * `ALTER TABLE (\w+)[\s\S]*?ADD COLUMN (\w+)` across the whole file, so an
 * ALTER on one table happily paired with an ADD COLUMN from a statement much
 * further down and reported a column against the wrong table. Each ALTER here
 * owns only the text up to the next ALTER/CREATE TABLE.
 */

export interface Claim {
  table: string;
  /** Absent for a CREATE TABLE claim. */
  column?: string;
}

export interface MigrationEffects {
  /** table -> the migration that created it. */
  tables: Map<string, string>;
  /** "table.column" -> the migration that added it. */
  columns: Map<string, string>;
  /** Tables a later migration dropped or renamed away. */
  droppedTables: Set<string>;
  /** "table.column" a later migration dropped or renamed away. */
  droppedColumns: Set<string>;
}

/** Comments out, so a commented-out CREATE TABLE is not read as a real one. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

const ALTER = /ALTER\s+TABLE\s+(?:ONLY\s+)?["`]?(\w+)["`]?/gi;
const NEXT_TABLE_STATEMENT = /(?:ALTER|CREATE)\s+TABLE\s/i;
const CREATE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
const DROP_TABLE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
const ADD_COLUMN = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
const DROP_COLUMN = /DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?["`]?(\w+)["`]?/gi;
const RENAME_COLUMN = /RENAME\s+COLUMN\s+["`]?(\w+)["`]?\s+TO\s+["`]?(\w+)["`]?/gi;
const RENAME_TABLE = /RENAME\s+TO\s+["`]?(\w+)["`]?/i;

/** The text one ALTER TABLE owns: up to the next ALTER/CREATE TABLE. */
function alterRegions(body: string): { table: string; text: string }[] {
  const regions: { table: string; text: string }[] = [];
  for (const m of body.matchAll(ALTER)) {
    const rest = body.slice(m.index! + m[0].length);
    const next = rest.search(NEXT_TABLE_STATEMENT);
    regions.push({
      table: m[1].toLowerCase(),
      text: next === -1 ? rest : rest.slice(0, next),
    });
  }
  return regions;
}

/**
 * Tables and columns one migration says it creates — what a database must have
 * for the migration to count as applied.
 *
 * A rename is reported as the NEW name only: the old one is gone by definition,
 * and reporting it would make every rename look like an unapplied migration.
 */
export function claimsOf(sql: string): Claim[] {
  const body = stripComments(sql);
  const claims: Claim[] = [];

  for (const m of body.matchAll(CREATE)) claims.push({ table: m[1].toLowerCase() });

  for (const { table, text } of alterRegions(body)) {
    for (const a of text.matchAll(ADD_COLUMN)) claims.push({ table, column: a[1].toLowerCase() });
    for (const r of text.matchAll(RENAME_COLUMN)) claims.push({ table, column: r[2].toLowerCase() });
  }
  return claims;
}

/** Every migration file, oldest first. `from` is a four-digit prefix. */
export function migrationFileNames(names: string[], from = "0000"): string[] {
  return names
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .filter((f) => f.slice(0, 4) >= from)
    .sort();
}

/**
 * Every migration's effects, folded together in order — so a column added in
 * 0046 and renamed in 0047 ends up counted once, under its new name.
 */
export function foldEffects(files: { name: string; sql: string }[]): MigrationEffects {
  const effects: MigrationEffects = {
    tables: new Map(),
    columns: new Map(),
    droppedTables: new Set(),
    droppedColumns: new Set(),
  };

  for (const { name, sql } of files) {
    const body = stripComments(sql);

    for (const m of body.matchAll(CREATE)) effects.tables.set(m[1].toLowerCase(), name);
    for (const m of body.matchAll(DROP_TABLE)) effects.droppedTables.add(m[1].toLowerCase());

    for (const { table, text } of alterRegions(body)) {
      const renamedTable = !/RENAME\s+COLUMN/i.test(text) ? text.match(RENAME_TABLE) : null;
      if (renamedTable) {
        effects.droppedTables.add(table);
        effects.tables.set(renamedTable[1].toLowerCase(), name);
        continue;
      }
      for (const a of text.matchAll(ADD_COLUMN)) {
        effects.columns.set(`${table}.${a[1].toLowerCase()}`, name);
      }
      for (const a of text.matchAll(DROP_COLUMN)) {
        effects.droppedColumns.add(`${table}.${a[1].toLowerCase()}`);
      }
      for (const r of text.matchAll(RENAME_COLUMN)) {
        effects.droppedColumns.add(`${table}.${r[1].toLowerCase()}`);
        effects.columns.set(`${table}.${r[2].toLowerCase()}`, name);
      }
    }
  }
  return effects;
}

/** Was this claim undone by a later migration (dropped, or renamed away)? */
export function isSuperseded(claim: Claim, effects: MigrationEffects): boolean {
  if (effects.droppedTables.has(claim.table)) return true;
  if (!claim.column) return false;
  return effects.droppedColumns.has(`${claim.table}.${claim.column}`);
}
