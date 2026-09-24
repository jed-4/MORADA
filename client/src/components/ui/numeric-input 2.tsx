import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A number field you can actually type in.
 *
 * The pattern this replaces, repeated across the app:
 *
 *   <Input type="number" value={n}
 *          onChange={(e) => update(parseFloat(e.target.value) || 0)} />
 *
 * which has two failures, both reproducible:
 *
 *   1. `<input type="number">` reports `value === ""` while the text is in an
 *      intermediate state — "1.", "-", "1e". So typing "1.5" goes 1 → "" → 0,
 *      and the decimal point can never be reached. The field visibly snaps to 0
 *      mid-keystroke.
 *   2. `|| 0` turns an empty field into 0, so the field cannot be cleared to
 *      retype it, and a legitimately empty value is indistinguishable from zero.
 *
 * The fix is to stop asking the browser to parse: this is `type="text"` with
 * `inputMode="decimal"`, so `.value` always returns exactly what was typed. The
 * component keeps that raw text while the field is focused and commits a parsed
 * number alongside it, so live totals still update on every keystroke — you just
 * do not lose what you typed.
 */
export interface NumericInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Committed value. `null` renders an empty field. */
  value: number | null | undefined;
  /** Called on every keystroke that parses to a number, and on blur. */
  onCommit: (value: number | null) => void;
  /** What an empty field means. Defaults to null (genuinely empty). */
  emptyValue?: number | null;
  /** Clamp on commit. */
  min?: number;
  max?: number;
  /** Select the whole field on focus, so typing replaces. Default true. */
  selectOnFocus?: boolean;
  /** Whole numbers only — day counts, offsets, durations. Blocks the decimal
   *  point at the keystroke rather than rounding it away after the fact. */
  integer?: boolean;
}

/** Allows "", "-", "1.", ".5", "-1.25" — every state on the way to a number. */
const PARTIAL_NUMBER = /^-?\d*\.?\d*$/;
/** Same, minus the decimal point. */
const PARTIAL_INTEGER = /^-?\d*$/;

const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onCommit,
      emptyValue = null,
      min,
      max,
      selectOnFocus = true,
      integer = false,
      className,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    // Non-null only while the user is mid-edit. Outside of that the committed
    // value renders, so an external change (a template, a reset) still shows.
    const [draft, setDraft] = React.useState<string | null>(null);

    const clamp = (n: number) => {
      let out = integer ? Math.trunc(n) : n;
      if (typeof min === "number" && out < min) out = min;
      if (typeof max === "number" && out > max) out = max;
      return out;
    };

    const display = draft ?? (value === null || value === undefined ? "" : String(value));

    return (
      <input
        // Spread FIRST. These props are the whole point of the component, so a
        // caller passing `value` or `onChange` — a react-hook-form `{...field}`
        // spread, say — must not be able to clobber them and silently restore
        // the broken behaviour it exists to fix.
        {...props}
        ref={ref}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          // Reject anything that could never become a number, so the field
          // cannot hold junk — but accept every partial state on the way.
          if (!(integer ? PARTIAL_INTEGER : PARTIAL_NUMBER).test(raw)) return;
          setDraft(raw);
          if (raw === "" || raw === "-" || raw === ".") {
            onCommit(emptyValue);
            return;
          }
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onCommit(clamp(parsed));
        }}
        onFocus={(e) => {
          if (selectOnFocus) e.target.select();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          // Drop the draft so the committed value renders canonically — "1.50"
          // becomes 1.5, "007" becomes 7, and a half-typed "1." resolves to 1.
          setDraft(null);
          const raw = e.target.value;
          if (raw === "" || raw === "-" || raw === ".") onCommit(emptyValue);
          else {
            const parsed = Number(raw);
            onCommit(Number.isFinite(parsed) ? clamp(parsed) : emptyValue);
          }
          onBlur?.(e);
        }}
        className={cn("tabular-nums", className)}
      />
    );
  },
);
NumericInput.displayName = "NumericInput";

export { NumericInput };
