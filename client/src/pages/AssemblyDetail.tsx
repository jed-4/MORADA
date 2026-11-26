import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ChevronRight, GripVertical, Loader2, MoreVertical, Plus, Trash2, Archive, ArchiveRestore, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CostCodeSelect } from "@/components/CostCodeSelect";
import {
  PriceListItemPicker, lookupItemExGstCents, unitCarriesToEstimate, type PriceListLookupItem,
} from "@/components/estimates/PriceListItemPicker";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AssemblyComponentInput, AssemblyWithComponents, FieldCategoryWithOptions } from "@shared/schema";
import {
  assemblyRateBreakdown, componentQuantityOf, mainInputLabel, newInputKey, previewAssemblyCostExTax,
  recipeFromDisplay, recipeToDisplay, type AssemblyInputDef,
} from "@shared/assemblies";
import { dollarsToCents, formatCents } from "@shared/money";

const LINE_TYPES = ["Material", "Labour", "Subcontractor", "Fee", "Equipment"] as const;

type DraftComponent = AssemblyComponentInput & { key: string };

interface Draft {
  name: string;
  description: string;
  unitType: string;
  costCodeId: string | null;
  /** What the line's own quantity is called — the first input ("Area"). */
  quantityLabel: string;
  /** The other named inputs (Thickness, Edge…), each with a default. */
  inputs: AssemblyInputDef[];
  components: DraftComponent[];
}

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function toDraft(a: AssemblyWithComponents): Draft {
  return {
    name: a.name,
    description: a.description ?? "",
    unitType: a.unitType,
    costCodeId: a.costCodeId,
    quantityLabel: a.quantityLabel ?? "",
    inputs: (a.inputs ?? []).map((i) => ({ key: i.key, label: i.label, unit: i.unit ?? null, defaultValue: Number(i.defaultValue) || 0 })),
    components: a.components.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      type: c.type,
      priceListItemId: c.priceListItemId,
      unitType: c.unitType,
      unitCostCents: c.unitCostCents,
      qtyMode: c.qtyMode === "fixed" || c.qtyMode === "formula" ? c.qtyMode : "per_unit",
      qtyFactor: c.qtyFactor,
      qtyFormula: c.qtyFormula,
      wastagePercent: c.wastagePercent,
      markupPercent: c.markupPercent,
      costCodeId: c.costCodeId,
    })),
  };
}

function blankComponent(): DraftComponent {
  return {
    key: newKey(), name: "", type: "Material", priceListItemId: null, unitType: "each",
    unitCostCents: 0, qtyMode: "per_unit", qtyFactor: 1, wastagePercent: 0, markupPercent: null, costCodeId: null,
  };
}

/**
 * A number input that lets you type freely ("0.", "12.5") and commits a parsed
 * number on blur. A plain controlled number input fights the cursor.
 */
function NumberCell({
  value, onCommit, className, placeholder, allowEmpty = false, "data-testid": testId,
}: {
  value: number | null | undefined;
  onCommit: (n: number | null) => void;
  className?: string;
  placeholder?: string;
  allowEmpty?: boolean;
  "data-testid"?: string;
}) {
  const shown = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <Input
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim().replace(/[$,\s]/g, "");
        if (t === "") {
          const empty = allowEmpty ? null : 0;
          if (empty !== (value ?? null)) onCommit(empty);
          return;
        }
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) setText(shown);
        else if (n !== value) onCommit(n); // blur alone is not an edit
      }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`h-7 text-xs text-right tabular-nums ${className ?? ""}`}
      data-testid={testId}
    />
  );
}

/**
 * A component's recipe over the assembly's inputs, typed with their NAMES —
 * `Area × Thickness × 1.05` — and saved by key, so renaming an input never
 * breaks it. Checked as you leave the cell; a recipe that doesn't read stays
 * red and blocks Save rather than pricing at 0.
 */
function RecipeCell({
  formula, labels, defaults, onCommit, onError, "data-testid": testId,
}: {
  formula: string | null | undefined;
  labels: { mainLabel: string; inputs: AssemblyInputDef[] };
  defaults: AssemblyInputDef[];
  onCommit: (formula: string) => void;
  onError: (error: string | null) => void;
  "data-testid"?: string;
}) {
  const shown = recipeToDisplay(formula, labels);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!error) setText(shown); }, [shown, error]);
  const check = () => {
    const r = recipeFromDisplay(text, { ...labels, defaults });
    if (!r.ok) {
      setError(r.error);
      onError(r.error);
      return;
    }
    setError(null);
    onError(null);
    if (r.formula !== formula) onCommit(r.formula);
  };
  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={check}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      placeholder={`${mainInputLabel(labels.mainLabel)} × 1.1`}
      title={error ?? "A recipe over the inputs: + − × ÷, ROUND() rounds up. Names with spaces go in { }."}
      className={`h-7 text-xs font-mono ${error ? "border-destructive text-destructive" : ""}`}
      data-testid={testId}
    />
  );
}

/** One extra input in the Inputs list. */
function InputRow({
  input, index, inUse, onChange, onRemove,
}: {
  input: AssemblyInputDef;
  index: number;
  inUse: boolean;
  onChange: (patch: Partial<AssemblyInputDef>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <Input
        value={input.label}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="e.g. Thickness"
        className="h-7 text-xs"
        data-testid={`input-assembly-input-label-${index}`}
      />
      <Input
        value={input.unit ?? ""}
        onChange={(e) => onChange({ unit: e.target.value })}
        placeholder="m"
        className="h-7 text-xs"
        data-testid={`input-assembly-input-unit-${index}`}
      />
      <NumberCell
        value={input.defaultValue}
        onCommit={(n) => onChange({ defaultValue: n ?? 0 })}
        data-testid={`input-assembly-input-default-${index}`}
      />
      <button
        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover-elevate disabled:opacity-30 disabled:hover:text-muted-foreground"
        onClick={onRemove}
        disabled={inUse}
        title={inUse ? "A recipe uses this input — change the recipe first" : `Remove ${input.label || "input"}`}
        aria-label={`Remove ${input.label || "input"}`}
        data-testid={`button-remove-input-${index}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

/** A unit <select> that never drops a value it doesn't know (the Radix value-wipe trap). */
function UnitSelect({ value, units, onChange, testId }: { value: string; units: string[]; onChange: (u: string) => void; testId?: string }) {
  const options = units.includes(value) || !value ? units : [value, ...units];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs"
      data-testid={testId}
    >
      {options.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  );
}

export default function AssemblyDetail() {
  const [, params] = useRoute("/assemblies/:id");
  const id = params?.id ?? "";
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: assembly, isLoading } = useQuery<AssemblyWithComponents>({
    queryKey: ["/api/assemblies", id],
    enabled: !!id,
  });
  const { data: unitCategory } = useQuery<FieldCategoryWithOptions>({
    queryKey: ["/api/field-categories/by-key/estimate_item.unit"],
  });
  const units = useMemo(
    () => (unitCategory?.options ?? []).map((o) => o.name).filter(Boolean) as string[],
    [unitCategory],
  );

  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewQty, setPreviewQty] = useState<number>(100);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Component key → why its recipe doesn't read. Any entry blocks Save.
  const [recipeErrors, setRecipeErrors] = useState<Record<string, string>>({});
  const setRecipeError = (key: string, error: string | null) =>
    setRecipeErrors((m) => {
      if ((m[key] ?? null) === error) return m;
      const next = { ...m };
      if (error) next[key] = error; else delete next[key];
      return next;
    });

  // Take the server copy whenever we have no unsaved edits.
  useEffect(() => {
    if (assembly && !dirty) setDraft(toDraft(assembly));
  }, [assembly, dirty]);

  const update = (fn: (d: Draft) => Draft) => {
    setDraft((d) => (d ? fn(d) : d));
    setDirty(true);
  };
  const updateComponent = (key: string, patch: Partial<DraftComponent>) => {
    const current = draft?.components.find((c) => c.key === key);
    if (current && Object.entries(patch).every(([k, v]) => (current as any)[k] === v)) return; // nothing changed
    update((d) => ({ ...d, components: d.components.map((c) => (c.key === key ? { ...c, ...patch } : c)) }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return null;
      const components = draft.components
        .filter((c) => c.name.trim() !== "")
        .map(({ key: _key, ...c }) => c);
      return apiRequest(`/api/assemblies/${id}`, "PATCH", {
        name: draft.name,
        description: draft.description.trim() || null,
        unitType: draft.unitType,
        costCodeId: draft.costCodeId || null,
        quantityLabel: draft.quantityLabel.trim() || null,
        inputs: draft.inputs.map((i) => ({ ...i, label: i.label.trim(), unit: i.unit?.trim() || null })),
        components,
      }) as Promise<AssemblyWithComponents>;
    },
    onSuccess: (saved) => {
      if (saved) {
        queryClient.setQueryData(["/api/assemblies", id], saved);
        setDraft(toDraft(saved));
      }
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["/api/assemblies"] });
      toast({ title: "Assembly saved" });
    },
    onError: (e: Error) => toast({ title: "Couldn't save", description: e.message, variant: "destructive" }),
  });

  const archive = useMutation({
    mutationFn: (isArchived: boolean) => apiRequest(`/api/assemblies/${id}`, "PATCH", { isArchived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/assemblies"] }),
  });

  const remove = useMutation({
    mutationFn: () => apiRequest(`/api/assemblies/${id}`, "DELETE"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assemblies"] });
      navigate("/assemblies");
    },
    onError: (e: Error) => toast({ title: "Couldn't delete", description: e.message, variant: "destructive" }),
  });

  const pickFromCatalogue = (key: string, item: PriceListLookupItem) => {
    updateComponent(key, {
      name: item.name,
      unitCostCents: lookupItemExGstCents(item),
      priceListItemId: item.id,
      ...(unitCarriesToEstimate(item.unitType, units) ? { unitType: item.unitType } : {}),
      ...(item.costCodeId ? { costCodeId: item.costCodeId } : {}),
    });
    if (!unitCarriesToEstimate(item.unitType, units)) {
      toast({
        title: "Priced from catalogue — check the unit",
        description: `Estimates have no "${item.unitType}" unit, so the component kept its existing one.`,
      });
    }
  };

  if (isLoading || !draft) {
    return <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>;
  }
  if (!assembly) {
    return <div className="p-6 text-sm text-muted-foreground">Assembly not found.</div>;
  }

  const { perUnitExTax, fixedExTax } = assemblyRateBreakdown(draft.components, draft.inputs);
  const previewTotal = previewAssemblyCostExTax(draft.components, previewQty, draft.inputs);
  const labels = { mainLabel: draft.quantityLabel, inputs: draft.inputs };
  const usedKeys = new Set(
    draft.components.filter((c) => c.qtyMode === "formula").flatMap((c) =>
      Array.from((c.qtyFormula ?? "").matchAll(/\{input:([0-9a-zA-Z_-]+)\}/g)).map((m) => m[1])),
  );
  const hasRecipeErrors = Object.keys(recipeErrors).length > 0;
  const updateInput = (key: string, patch: Partial<AssemblyInputDef>) =>
    update((d) => ({ ...d, inputs: d.inputs.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
  const money = (dollars: number) => formatCents(dollarsToCents(dollars), { alwaysShowDecimals: true });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 flex-shrink-0">
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/templates")}>Templates</button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate("/assemblies")}>Assemblies</button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground" data-testid="text-page-title">{draft.name || "Untitled"}</span>
        {assembly.isArchived && <span className="ml-1 text-[10px] px-1 rounded bg-muted text-muted-foreground">Archived</span>}
      </div>

      <div className="border border-border rounded-t-lg bg-card flex-shrink-0">
        <div className="h-9 flex items-center justify-between px-3 gap-2">
          <div className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : `Version ${assembly.version}`}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="h-6 w-auto px-2 text-xs border rounded-md bg-primary text-white border-primary/20 hover:bg-primary/90 active-elevate-2 flex items-center gap-1 disabled:opacity-50"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending || !draft.name.trim() || hasRecipeErrors}
              title={hasRecipeErrors ? "Fix the red recipes first" : undefined}
              data-testid="button-save-assembly"
            >
              {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Save
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-6 w-6 border border-border/50 rounded-md flex items-center justify-center text-muted-foreground hover-elevate" data-testid="button-assembly-menu">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => archive.mutate(!assembly.isArchived)}>
                  {assembly.isArchived ? <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> : <Archive className="h-3.5 w-3.5 mr-2" />}
                  {assembly.isArchived ? "Restore" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border-x border-b border-border rounded-b-lg bg-card">
        <div className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 max-w-6xl">
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Name</span>
                <Input
                  value={draft.name}
                  onChange={(e) => update((d) => ({ ...d, name: e.target.value }))}
                  className="h-8 text-sm"
                  data-testid="input-assembly-name"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Priced per</span>
                <UnitSelect value={draft.unitType} units={units} onChange={(u) => update((d) => ({ ...d, unitType: u }))} testId="select-assembly-unit" />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">Description (prints on the estimate line)</span>
              <Textarea
                value={draft.description}
                onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
                className="text-xs min-h-[56px]"
                data-testid="input-assembly-description"
              />
            </label>
            <label className="block space-y-1 max-w-sm">
              <span className="text-xs text-muted-foreground">Default cost code (for components without one)</span>
              <CostCodeSelect
                value={draft.costCodeId ?? ""}
                onValueChange={(v) => update((d) => ({ ...d, costCodeId: v || null }))}
                triggerClassName="h-8 text-xs"
                data-testid="select-assembly-cost-code"
              />
            </label>

            <div className="space-y-1.5 pt-1" data-testid="section-assembly-inputs">
              <div className="text-xs font-medium">Inputs</div>
              <p className="text-[11px] text-muted-foreground leading-snug max-w-xl">
                What the estimator fills in when this lands in an estimate. The first is the line's own quantity; add
                others (a slab's thickness, its edge length) and write a component's quantity as a recipe over them.
                Each can follow a take-off measurement on the job.
              </p>
              <div className="grid grid-cols-[180px_80px_96px_24px] gap-1.5 items-center text-[11px] text-muted-foreground">
                <span>Name</span><span>Unit</span><span className="text-right">Default</span><span />
                <Input
                  value={draft.quantityLabel}
                  onChange={(e) => update((d) => ({ ...d, quantityLabel: e.target.value }))}
                  placeholder="Qty"
                  className="h-7 text-xs"
                  data-testid="input-assembly-quantity-label"
                />
                <span className="text-xs text-foreground px-1">{draft.unitType}</span>
                <span className="text-right text-[11px]">the line's qty</span>
                <span />
                {draft.inputs.map((i, n) => (
                  <InputRow
                    key={i.key}
                    input={i}
                    index={n}
                    inUse={usedKeys.has(i.key)}
                    onChange={(patch) => updateInput(i.key, patch)}
                    onRemove={() => update((d) => ({ ...d, inputs: d.inputs.filter((x) => x.key !== i.key) }))}
                  />
                ))}
              </div>
              <button
                className="h-6 w-auto px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
                onClick={() => update((d) => ({
                  ...d,
                  inputs: [...d.inputs, { key: newInputKey(), label: "", unit: null, defaultValue: 0 }],
                }))}
                data-testid="button-add-input"
              >
                <Plus className="h-3.5 w-3.5" />
                Add input
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2 h-fit">
            <div className="text-xs font-medium">Price check</div>
            <div className="text-xs text-muted-foreground">
              {money(perUnitExTax)} per {draft.unitType}
              {fixedExTax > 0 && <> + {money(fixedExTax)} fixed</>}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">At</span>
              <NumberCell value={previewQty} onCommit={(n) => setPreviewQty(n ?? 0)} className="w-20" data-testid="input-preview-qty" />
              <span className="text-xs text-muted-foreground">{draft.unitType}{draft.inputs.length > 0 && <> · other inputs at their defaults</>}</span>
            </div>
            <div className="text-sm font-semibold tabular-nums" data-testid="text-preview-total">{money(previewTotal)}</div>
            <div className="text-[11px] text-muted-foreground leading-snug">
              Ex GST, with line markup and wastage, before your builder's margin — exactly what the components will price at in an estimate.
            </div>
          </div>
        </div>

        <div className="px-4 pb-6">
          <div className="text-xs font-medium mb-2">Components</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1180px]">
              <thead className="text-muted-foreground border-b border-border">
                <tr className="h-8">
                  <th className="w-5" />
                  <th className="text-left font-medium px-1.5 min-w-[240px]">Component</th>
                  <th className="text-left font-medium px-1.5 w-28">Type</th>
                  <th className="text-left font-medium px-1.5 w-64">Quantity</th>
                  <th className="text-left font-medium px-1.5 w-20">Unit</th>
                  <th className="text-right font-medium px-1.5 w-24">Unit cost (ex)</th>
                  <th className="text-right font-medium px-1.5 w-16">Waste %</th>
                  <th className="text-right font-medium px-1.5 w-16">Markup %</th>
                  <th className="text-left font-medium px-1.5 w-40">Cost code</th>
                  <th className="text-right font-medium px-1.5 w-24">At {previewQty}</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {draft.components.map((c, index) => {
                  const qtyAtPreview = componentQuantityOf(
                    { mode: c.qtyMode, factor: c.qtyFactor, formula: c.qtyFormula },
                    { quantity: previewQty, inputs: draft.inputs },
                  );
                  const lineAtPreview = previewAssemblyCostExTax([c], previewQty, draft.inputs);
                  return (
                    <tr key={c.key} className="border-b border-border/60 align-middle" data-testid={`row-component-${index}`}>
                      <td className="text-muted-foreground/40"><GripVertical className="h-3.5 w-3.5" /></td>
                      <td className="px-1.5 py-1">
                        <div className="flex items-center gap-1">
                          {c.priceListItemId && <Tag className="h-3 w-3 text-primary flex-shrink-0" aria-label="From the price list" />}
                          <PriceListItemPicker
                            value={c.name}
                            onChange={(name) => updateComponent(c.key, { name })}
                            onSelect={(item) => pickFromCatalogue(c.key, item)}
                            linked={!!c.priceListItemId}
                            placeholder="Type to search the price list…"
                            className="h-7 text-xs"
                            data-testid={`input-component-name-${index}`}
                          />
                        </div>
                      </td>
                      <td className="px-1.5">
                        <select
                          value={c.type}
                          onChange={(e) => updateComponent(c.key, { type: e.target.value })}
                          className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                        >
                          {LINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="px-1.5">
                        <div className="flex items-center gap-1">
                          {c.qtyMode === "formula" ? (
                            <div className="flex-1 min-w-0">
                              <RecipeCell
                                formula={c.qtyFormula}
                                labels={labels}
                                defaults={draft.inputs}
                                onCommit={(qtyFormula) => updateComponent(c.key, { qtyFormula })}
                                onError={(e) => setRecipeError(c.key, e)}
                                data-testid={`input-component-recipe-${index}`}
                              />
                            </div>
                          ) : (
                            <NumberCell
                              value={c.qtyFactor}
                              onCommit={(n) => updateComponent(c.key, { qtyFactor: n ?? 0 })}
                              className="w-16"
                              data-testid={`input-component-factor-${index}`}
                            />
                          )}
                          <select
                            value={c.qtyMode}
                            onChange={(e) => {
                              const mode = e.target.value as "per_unit" | "fixed" | "formula";
                              setRecipeError(c.key, null);
                              updateComponent(c.key, mode === "formula"
                                // Start the recipe from what the line already said.
                                ? { qtyMode: mode, qtyFormula: c.qtyFormula || (c.qtyMode === "fixed" ? String(c.qtyFactor) : `{input:qty} × ${c.qtyFactor}`) }
                                : { qtyMode: mode });
                            }}
                            className="h-7 rounded-md border border-input bg-background px-1 text-xs flex-shrink-0"
                            title={c.qtyMode === "fixed"
                              ? "The same quantity whatever the assembly's size"
                              : c.qtyMode === "formula"
                                ? "Worked out from the inputs"
                                : `Per ${draft.unitType} of the assembly`}
                            data-testid={`select-component-mode-${index}`}
                          >
                            <option value="per_unit">/ {draft.unitType}</option>
                            <option value="fixed">fixed</option>
                            <option value="formula">recipe</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-1.5">
                        <UnitSelect value={c.unitType} units={units} onChange={(u) => updateComponent(c.key, { unitType: u })} />
                      </td>
                      <td className="px-1.5">
                        <NumberCell
                          value={c.unitCostCents / 100}
                          onCommit={(n) => {
                            const cents = dollarsToCents(n ?? 0);
                            // Same rule as an estimate line: a hand-typed cost leaves the price list.
                            updateComponent(c.key, cents === c.unitCostCents ? {} : { unitCostCents: cents, priceListItemId: null });
                          }}
                          data-testid={`input-component-cost-${index}`}
                        />
                      </td>
                      <td className="px-1.5">
                        <NumberCell value={c.wastagePercent} onCommit={(n) => updateComponent(c.key, { wastagePercent: Math.round(n ?? 0) })} />
                      </td>
                      <td className="px-1.5">
                        <NumberCell value={c.markupPercent} allowEmpty placeholder="—" onCommit={(n) => updateComponent(c.key, { markupPercent: n })} />
                      </td>
                      <td className="px-1.5">
                        <CostCodeSelect
                          value={c.costCodeId ?? ""}
                          onValueChange={(v) => updateComponent(c.key, { costCodeId: v || null })}
                          placeholder="Assembly default"
                          triggerClassName="h-7 text-xs"
                        />
                      </td>
                      <td className="px-1.5 text-right tabular-nums">
                        <div>{money(lineAtPreview)}</div>
                        <div className="text-[10px] text-muted-foreground">{qtyAtPreview ?? "—"} {c.unitType}</div>
                      </td>
                      <td className="text-right">
                        <button
                          className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover-elevate"
                          onClick={() => {
                            setRecipeError(c.key, null);
                            update((d) => ({ ...d, components: d.components.filter((x) => x.key !== c.key) }));
                          }}
                          aria-label={`Remove ${c.name || "component"}`}
                          data-testid={`button-remove-component-${index}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button
            className="mt-2 h-6 w-auto px-2 text-xs border rounded-md border-border/50 text-muted-foreground hover-elevate active-elevate-2 flex items-center gap-1"
            onClick={() => update((d) => ({ ...d, components: [...d.components, blankComponent()] }))}
            data-testid="button-add-component"
          >
            <Plus className="h-3.5 w-3.5" />
            Add component
          </button>
          {draft.components.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground max-w-xl">
              Add what one {draft.unitType} of this assembly takes — e.g. 0.105 m³ of concrete and 1.1 m² of mesh per m² of slab — and anything
              that's needed once whatever the size, like a pump hire, as <span className="font-medium">fixed</span>.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${assembly.name}?`}
        description="Estimates that already use it keep their lines and prices; they just stop being linked to this assembly. Archive instead if you only want to hide it."
        confirmLabel="Delete"
        destructive
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
