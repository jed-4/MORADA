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
      const m = /^\{takeoff:([0-9a-zA-Z_-]+)\}/.exec(s.slice(i));
      if (!m) return { error: "Unfinished take-off reference" };
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
        failure = failure ?? "A take-off item in this formula no longer exists";
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
  return { ok: true, value: Math.round(parsed.value * 100) / 100 };
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
    if (/^takeoff:[0-9a-zA-Z_-]+$/.test(name)) return `{${name}}`;
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
