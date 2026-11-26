/**
 * The named inputs of one assembly line (phase 3) — Thickness 0.1 m, Edge
 * 44 lm — set per job. Each is a number, or follows a take-off measurement:
 * on an estimate that's a link by id (`{takeoff:id}`), on a template a NAME
 * (`{Slab edge}`) that links when the template lands on a measured job.
 *
 * The line's own quantity is the first input and stays in the Qty cell; this
 * is for the others. Saving sends [{ key, value, formula }] — the line's
 * snapshot keeps the labels — and the components rescale from it.
 */
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { AssemblyInputValue } from "@shared/assemblies";
import { extractNameRefs, extractTakeoffRefs } from "@shared/quantityFormula";

export interface InputMeasurement {
  id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
}

export type InputEdit = { key: string; value: number; formula: string | null };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000));

/** A short summary for the chip: "0.1 m · 44 lm". */
export function inputsSummary(inputs: AssemblyInputValue[]): string {
  return inputs.map((i) => `${fmt(Number(i.value) || 0)}${i.unit ? ` ${i.unit}` : ""}`).join(" · ");
}

export function AssemblyInputsPopover({
  itemId, inputs, locked, mode, measurements, onSave,
}: {
  itemId: string;
  inputs: AssemblyInputValue[];
  locked: boolean;
  /** "estimate": link measurements by id. "template": name them. */
  mode: "estimate" | "template";
  measurements: InputMeasurement[];
  onSave: (edits: InputEdit[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Array<{ key: string; text: string; source: string }>>([]);

  // The <select> value for an input's take-off link: a measurement id on an
  // estimate, a name on a template, "" for a typed number.
  const sourceOf = (i: AssemblyInputValue): string => {
    if (!i.formula) return "";
    if (mode === "estimate") return extractTakeoffRefs(i.formula)[0] ?? "";
    return extractNameRefs(i.formula)[0] ?? "";
  };

  useEffect(() => {
    if (open) setDraft(inputs.map((i) => ({ key: i.key, text: fmt(Number(i.value) || 0), source: sourceOf(i) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const measured = (source: string) =>
    mode === "estimate" ? measurements.find((m) => m.id === source) : measurements.find((m) => m.name === source);

  const save = () => {
    const edits: InputEdit[] = [];
    for (const d of draft) {
      const original = inputs.find((i) => i.key === d.key);
      if (!original) continue;
      const formula = d.source ? (mode === "estimate" ? `{takeoff:${d.source}}` : `{${d.source}}`) : null;
      const typed = Number(d.text.replace(/[,\s]/g, ""));
      // On an estimate a linked input reads the measurement (the server has the
      // final say). A template has nothing measured: its number stands until
      // the template lands on a job that has the named item.
      const typedValue = Number.isFinite(typed) && d.text.trim() !== "" ? typed : Number(original.value) || 0;
      const value = formula && mode === "estimate"
        ? Number(measured(d.source)?.quantity ?? original.value) || 0
        : typedValue;
      if (formula === (original.formula ?? null) && Math.abs(value - (Number(original.value) || 0)) < 1e-9) continue;
      edits.push({ key: d.key, value, formula });
    }
    if (edits.length > 0) onSave(edits);
    setOpen(false);
  };

  if (inputs.length === 0) return null;
  const followsTakeoff = inputs.some((i) => i.formula);

  return (
    <Popover open={open} onOpenChange={(o) => { if (!o && open && !locked) save(); else setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 text-[10px] rounded px-1 py-px border flex-shrink-0 max-w-[160px] ${
            followsTakeoff ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
          } hover:text-foreground`}
          onClick={(e) => e.stopPropagation()}
          title={inputs.map((i) => `${i.label}: ${fmt(Number(i.value) || 0)}${i.unit ? ` ${i.unit}` : ""}${i.formula ? " (take-off)" : ""}`).join("\n")}
          data-testid={`button-assembly-inputs-${itemId}`}
        >
          <SlidersHorizontal className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate">{inputsSummary(inputs)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="text-xs font-medium mb-1">Inputs</div>
        <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
          The components' recipes read these. Change one and they rescale.
          {mode === "template" && " A take-off item named here links when the template lands on a measured job."}
        </p>
        <div className="space-y-2">
          {draft.map((d, n) => {
            const input = inputs.find((i) => i.key === d.key)!;
            const m = d.source ? measured(d.source) : undefined;
            return (
              <div key={d.key} className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 items-center">
                <span className="text-xs truncate" title={input.label}>{input.label}</span>
                <div className="flex items-center gap-1">
                  <Input
                    value={d.source && mode === "estimate" ? (m ? fmt(Number(m.quantity) || 0) : fmt(Number(input.value) || 0)) : d.text}
                    disabled={locked || (!!d.source && mode === "estimate")}
                    title={d.source && mode === "template" ? "Used until the template lands on a job that has this take-off item" : undefined}
                    onChange={(e) => setDraft((all) => all.map((x, k) => (k === n ? { ...x, text: e.target.value } : x)))}
                    onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                    inputMode="decimal"
                    className="h-7 w-20 text-xs text-right tabular-nums"
                    data-testid={`input-assembly-input-value-${d.key}`}
                  />
                  <span className="text-[11px] text-muted-foreground w-6">{input.unit ?? ""}</span>
                  <select
                    value={d.source}
                    disabled={locked}
                    onChange={(e) => setDraft((all) => all.map((x, k) => (k === n ? { ...x, source: e.target.value } : x)))}
                    className="h-7 flex-1 min-w-0 rounded-md border border-input bg-background px-1 text-[11px]"
                    title="Follow a take-off measurement"
                    data-testid={`select-assembly-input-source-${d.key}`}
                  >
                    <option value="">Typed</option>
                    {/* Keep a link whose measurement is gone visible, not silently dropped. */}
                    {d.source && !m && <option value={d.source}>{mode === "template" ? d.source : "deleted take-off item"}</option>}
                    {measurements.map((x) => (
                      <option key={x.id} value={mode === "estimate" ? x.id : x.name}>
                        {x.name}{x.quantity != null && mode === "estimate" ? ` (${fmt(Number(x.quantity) || 0)} ${x.unit ?? ""})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
        {!locked && (
          <div className="flex justify-end gap-1.5 mt-3">
            <button
              className="h-6 px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate"
              onClick={() => { setDraft([]); setOpen(false); }}
            >
              Cancel
            </button>
            <button
              className="h-6 px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90"
              onClick={save}
              data-testid={`button-save-assembly-inputs-${itemId}`}
            >
              Apply
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
