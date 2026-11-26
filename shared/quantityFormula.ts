/**
 * The quantity formula on an estimate line.
 *
 * A quantity can be a plain number, or an expression over take-off
 * measurements: `{takeoff:9f3…} * 1.1`, `ROUND({takeoff:9f3…} / 2.4)`. The
 * measured figure stays in the take-off where it was drawn, and the estimate
 * line says what it does with it.
 *
 * Two rules the rest of the code relies on:
 *
 *  1. References are stored by ID, never by name. A take-off item is renamed by
 *     double-clicking it in the list; if formulas held names, that keystroke
 *     would quietly break an estimate. The UI shows names and stores ids.
 *
 *  2. Evaluation NEVER runs the text. Formulas come back out of the database,
 *     so `eval` would be running whatever is in that column — this is a small
 *     recursive-descent parser over a fixed grammar instead.
 *
 * ROUND rounds UP to the next whole number (Jed's call): it is there for sheets,
 * packs and lengths you cannot buy a fraction of. `ROUND(10.2)` is 11.
 */

/** `{takeoff:<id>}` — the only reference form. */
const REF_PATTERN = /\{takeoff:([0-9a-zA-Z_-]+)\}/g;

export type FormulaResult =
  | { ok: true; value: number }
  | { ok: false; error: string; missingRefs: string[] };

/** Every take-off measurement a formula depends on, in first-seen order. */
export function extractTakeoffRefs(formula: string | null | undefined): string[] {
  if (!formula) return [];
  const ids: string[] = [];
  const re = new RegExp(REF_PATTERN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** True when the text is just a number — no references, no arithmetic. */
export function isPlainNumber(formula: string | null | undefined): boolean {
  if (!formula) return false;
  return /^\s*-?\d+(\.\d+)?\s*$/.test(formula);
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "ref"; id: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "(" }
  | { kind: ")" }
  | { kind: "round" };

function tokenize(input: string): { tokens: Token[] } | { error: string } {
  const tokens: Token[] = [];
  // × and ÷ arrive from pasted text and from some keyboards; they mean the
  // same thing as * and /, and rejecting them would be pedantry.
  const s = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === "(") { tokens.push({ kind: "(" }); i++; continue; }
    if (c === ")") { tokens.push({ kind: ")" }); i++; continue; }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c >= "0" && c <= "9") {
      const m = /^\d+(\.\d+)?/.exec(s.slice(i))!;
      tokens.push({ kind: "num", value: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === ".") {
      const m = /^\.\d+/.exec(s.slice(i));
      if (!m) return { error: "Stray '.'" };
      tokens.push({ kind: "num", value: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === "{") {
      // `{input:key}` — a named input of an assembly (shared/assemblies.ts).
      // Only assembly component recipes carry these; they are looked up under
      // the id "input:<key>" so one values map serves both kinds.
      const input = /^\{input:([0-9a-zA-Z_-]+)\}/.exec(s.slice(i));
      if (input) {
        tokens.push({ kind: "ref", id: `input:${input[1]}` });
        i += input[0].length;
        continue;
      }
      const m = /^\{takeoff:([0-9a-zA-Z_-]+)\}/.exec(s.slice(i));
      if (!m) {
        // A reference by NAME is a line waiting for its take-off item — it
        // came from an estimate template before that item was measured.
        const named = /^\{([^{}]*)\}/.exec(s.slice(i));
        if (named && named[1].trim() && !/^(takeoff|input):/.test(named[1].trim())) {
          return { error: `Waiting for take-off item "${named[1].trim()}"` };
        }
        return { error: "Unfinished take-off reference" };
      }
      tokens.push({ kind: "ref", id: m[1] });
      i += m[0].length;
      continue;
    }
    const word = /^[A-Za-z]+/.exec(s.slice(i));
    if (word) {
      if (word[0].toUpperCase() === "ROUND") {
        tokens.push({ kind: "round" });
        i += word[0].length;
        continue;
      }
      return { error: `Unknown word "${word[0]}"` };
    }
    return { error: `Unexpected character "${c}"` };
  }
  return { tokens };
}

/**
 * expression := term (('+' | '-') term)*
 * term       := factor (('*' | '/') factor)*
 * factor     := '-' factor | number | ref | '(' expression ')' | ROUND '(' expression ')'
 */
function parse(
  tokens: Token[],
  values: Map<string, number>,
  missing: string[],
): { value: number } | { error: string } {
  let pos = 0;
  const peek = () => tokens[pos];
  let failure: string | null = null;

  const expression = (): number => {
    let left = term();
    for (;;) {
      const t = peek();
      if (failure || !t || t.kind !== "op" || (t.value !== "+" && t.value !== "-")) return left;
      pos++;
      const right = term();
      left = t.value === "+" ? left + right : left - right;
    }
  };

  const term = (): number => {
    let left = factor();
    for (;;) {
      const t = peek();
      if (failure || !t || t.kind !== "op" || (t.value !== "*" && t.value !== "/")) return left;
      pos++;
      const right = factor();
      if (t.value === "/") {
        if (right === 0) { failure = failure ?? "Divide by zero"; return 0; }
        left = left / right;
      } else {
        left = left * right;
      }
    }
  };

  const factor = (): number => {
    const t = peek();
    if (!t) { failure = failure ?? "Formula ends early"; return 0; }
    if (t.kind === "op" && t.value === "-") { pos++; return -factor(); }
    if (t.kind === "op" && t.value === "+") { pos++; return factor(); }
    if (t.kind === "num") { pos++; return t.value; }
    if (t.kind === "ref") {
      pos++;
      const v = values.get(t.id);
      if (v === undefined) {
        if (!missing.includes(t.id)) missing.push(t.id);
        failure = failure ?? (t.id.startsWith("input:")
          ? "An input in this formula no longer exists"
          : "A take-off item in this formula no longer exists");
        return 0;
      }
      return v;
    }
    if (t.kind === "(") {
      pos++;
      const v = expression();
      const close = peek();
      if (!close || close.kind !== ")") { failure = failure ?? "Missing )"; return v; }
      pos++;
      return v;
    }
    if (t.kind === "round") {
      pos++;
      const open = peek();
      if (!open || open.kind !== "(") { failure = failure ?? "ROUND needs brackets"; return 0; }
      pos++;
      const v = expression();
      const close = peek();
      if (!close || close.kind !== ")") { failure = failure ?? "Missing )"; return v; }
      pos++;
      // Up, always: you cannot order 10.2 sheets.
      return Math.ceil(v);
    }
    failure = failure ?? "Unexpected symbol";
    return 0;
  };

  const value = expression();
  if (failure) return { error: failure };
  if (pos < tokens.length) return { error: "Unexpected symbol" };
  return { value };
}

/**
 * Work out what a formula comes to, given each referenced measurement's
 * quantity. The caller keeps the line's last quantity when this fails — a
 * broken formula must never silently zero a priced line.
 */
export function evaluateQuantityFormula(
  formula: string | null | undefined,
  quantities: Map<string, number> | Record<string, number>,
  opts: { decimals?: number } = {},
): FormulaResult {
  const text = (formula ?? "").trim();
  if (!text) return { ok: false, error: "Empty formula", missingRefs: [] };

  const values =
    quantities instanceof Map ? quantities : new Map(Object.entries(quantities));
  const lexed = tokenize(text);
  if ("error" in lexed) return { ok: false, error: lexed.error, missingRefs: [] };
  if (lexed.tokens.length === 0) return { ok: false, error: "Empty formula", missingRefs: [] };

  const missing: string[] = [];
  const parsed = parse(lexed.tokens, values, missing);
  if ("error" in parsed) return { ok: false, error: parsed.error, missingRefs: missing };
  if (!Number.isFinite(parsed.value)) return { ok: false, error: "Not a number", missingRefs: [] };

  // 2dp, like every other quantity in the estimate. ROUND has already taken
  // whatever it touched up to a whole number.
  const scale = 10 ** (opts.decimals ?? 2);
  return { ok: true, value: Math.round(parsed.value * scale) / scale };
}

/** `{takeoff:id}` → `{Wall tiles}`, for showing a formula to a human. */
export function formulaToDisplay(
  formula: string | null | undefined,
  names: Map<string, string> | Record<string, string>,
): string {
  if (!formula) return "";
  const map = names instanceof Map ? names : new Map(Object.entries(names));
  return formula.replace(REF_PATTERN, (_all, id: string) => `{${map.get(id) ?? "deleted item"}}`);
}

/**
 * `{Wall tiles}` → `{takeoff:id}`, for saving what a human typed.
 *
 * `picked` holds what the picker inserted (name → id) and wins, so two items
 * sharing a name still resolve correctly when they were chosen from the list.
 * A name typed by hand that matches more than one item is an error rather than
 * a guess — quantities are money.
 */
export function displayToFormula(
  display: string,
  byName: Map<string, string[]> | Record<string, string[]>,
  picked?: Map<string, string>,
): { ok: true; formula: string } | { ok: false; error: string } {
  const index = byName instanceof Map ? byName : new Map(Object.entries(byName));
  let error: string | null = null;
  const formula = display.replace(/\{([^{}]*)\}/g, (all, rawName: string) => {
    const name = rawName.trim();
    if (/^(takeoff|input):[0-9a-zA-Z_-]+$/.test(name)) return `{${name}}`;
    const fromPicker = picked?.get(name);
    if (fromPicker) return `{takeoff:${fromPicker}}`;
    const matches = index.get(name) ?? [];
    if (matches.length === 1) return `{takeoff:${matches[0]}}`;
    error =
      matches.length === 0
        ? `No take-off item called "${name}"`
        : `More than one take-off item is called "${name}" — pick it from the list`;
    return all;
  });
  if (error) return { ok: false, error };
  return { ok: true, formula };
}

// ─── References by NAME: estimate templates ────────────────────────────────
//
// A template has no project, so it has no measurements to point at. Its lines
// say WHICH take-off item they want by name — `{Wall tiles} * 1.1` — and the
// name becomes an id when the template is loaded into an estimate whose
// project has an item called that. Until then the estimate line keeps the
// name in its formula and sits at 0: a "waiting" line. Rule 1 above still
// holds for anything that is linked; a name is only ever a placeholder.

/** `{Wall tiles}` — anything in braces that is not an id reference. */
const NAME_REF_PATTERN = /\{([^{}]*)\}/g;

/** How names are compared: case, outer spaces and runs of spaces don't count. */
export function normaliseTakeoffName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The take-off item names a formula is still waiting for, first-seen order. */
export function extractNameRefs(formula: string | null | undefined): string[] {
  if (!formula) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(NAME_REF_PATTERN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(formula)) !== null) {
    const name = m[1].trim();
    if (!name || /^(takeoff|input):/.test(name)) continue;
    const key = normaliseTakeoffName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/** True when a formula names at least one take-off item it isn't linked to yet. */
export function isWaitingFormula(formula: string | null | undefined): boolean {
  return extractNameRefs(formula).length > 0;
}

/**
 * Check a template's formula reads, without any numbers to read it with:
 * every name stands in as 1. `{Wall tiles} * ` is caught here, at the template,
 * rather than on every estimate it is loaded into.
 */
export function checkTemplateFormula(
  text: string,
): { ok: true; formula: string; names: string[] } | { ok: false; error: string } {
  const formula = text.trim();
  if (!formula) return { ok: false, error: "Empty formula" };
  const names = extractNameRefs(formula);
  if (names.length === 0) {
    return { ok: false, error: "Pick a take-off item — type { to choose one" };
  }
  if (extractTakeoffRefs(formula).length > 0) {
    // An id only means something inside one project.
    return { ok: false, error: "A template can only name take-off items, not link to one project's" };
  }
  const stand = formula.replace(NAME_REF_PATTERN, "1");
  const result = evaluateQuantityFormula(stand, new Map());
  if (!result.ok) {
    return { ok: false, error: result.error === "Divide by zero" ? "Divides by zero" : result.error };
  }
  return { ok: true, formula, names };
}

export type NameResolution = {
  /** The formula with every uniquely matched name swapped for its id. */
  formula: string;
  /** Names that found exactly one item. */
  linked: string[];
  /** Names that found none. */
  waiting: string[];
  /** Names that found more than one — never guessed. */
  ambiguous: string[];
};

/**
 * Swap names for ids where the project has exactly one item of that name.
 *
 * `byName` is keyed by normaliseTakeoffName. A name matching two items (the
 * same item measured on two plans) is left as a name: quantities are money,
 * and picking one would quietly price half the job.
 */
export function resolveNameRefs(
  formula: string,
  byName: Map<string, string[]>,
): NameResolution {
  const linked: string[] = [];
  const waiting: string[] = [];
  const ambiguous: string[] = [];
  const note = (list: string[], name: string) => {
    if (!list.some((n) => normaliseTakeoffName(n) === normaliseTakeoffName(name))) list.push(name);
  };
  const out = formula.replace(NAME_REF_PATTERN, (all, raw: string) => {
    const name = raw.trim();
    if (!name || /^(takeoff|input):/.test(name)) return all;
    const ids = byName.get(normaliseTakeoffName(name)) ?? [];
    if (ids.length === 1) {
      note(linked, name);
      return `{takeoff:${ids[0]}}`;
    }
    note(ids.length === 0 ? waiting : ambiguous, name);
    return all;
  });
  return { formula: out, linked, waiting, ambiguous };
}

/** Build the index resolveNameRefs reads from a project's measurements. */
export function indexTakeoffByName(
  measurements: Array<{ id: string; name: string }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of measurements) {
    const key = normaliseTakeoffName(m.name ?? "");
    if (!key) continue;
    map.set(key, [...(map.get(key) ?? []), m.id]);
  }
  return map;
}

export type TemplateFormulaLink = {
  /** What to store on the estimate line, or null to store none. */
  formula: string | null;
  /** The quantity to store, or null to keep what was sent. */
  quantity: number | null;
  /** Every name found an item: the line follows the take-off from now on. */
  linked: boolean;
  /** Names still waiting (none measured) and names matching more than one. */
  waitingFor: string[];
  ambiguous: string[];
};

/**
 * A template line's `{Wall tiles} * 1.1`, as it lands in a project.
 *
 * Fully matched → id form, evaluated, the line's quantity is the take-off's.
 * Anything unmatched → the line keeps the formula with the names it couldn't
 * link and sits at 0, never at the template's number, so a waiting line can't
 * reach a quote looking priced. A formula that doesn't read, or that carries
 * ids from some other project, is dropped and the sent quantity kept.
 */
export function linkTemplateFormula(
  raw: unknown,
  byName: Map<string, string[]>,
  quantities: Map<string, number>,
): TemplateFormulaLink {
  const none: TemplateFormulaLink = { formula: null, quantity: null, linked: false, waitingFor: [], ambiguous: [] };
  if (typeof raw !== "string" || !raw.trim()) return none;
  const checked = checkTemplateFormula(raw);
  if (!checked.ok) return none;
  const r = resolveNameRefs(checked.formula, byName);
  if (r.waiting.length === 0 && r.ambiguous.length === 0) {
    const value = evaluateQuantityFormula(r.formula, quantities);
    if (value.ok) return { formula: r.formula, quantity: value.value, linked: true, waitingFor: [], ambiguous: [] };
  }
  return { formula: r.formula, quantity: 0, linked: false, waitingFor: r.waiting, ambiguous: r.ambiguous };
}
