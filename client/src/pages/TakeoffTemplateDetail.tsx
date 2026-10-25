import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Loader2, Calculator } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import {
  COLOR_SWATCHES,
  FILL_PATTERN_OPTIONS,
  LINE_SIZE_OPTIONS,
  LINE_TYPE_OPTIONS,
  TYPE_OPTIONS,
  UNIT_OPTIONS,
  type MeasurementType,
} from "@/components/takeoff/TakeoffMeasurementFormModal";
import type { TakeoffTemplate, TakeoffTemplateItem } from "@shared/takeoffTemplates";

/**
 * Edit one take-off template's items.
 *
 * The whole point of this page is to build a kit WITHOUT drawing first. Save
 * as template, inside a take-off, can only capture measurements that already
 * exist — so a standard set could never be set up ahead of a job, only
 * harvested from one.
 *
 * Items are edited in place and saved as a whole array, because that is how
 * they are stored: one JSON blob on company_settings, not rows. The unsaved
 * state lives here and is written on Save, rather than a mutation per
 * keystroke against a blob.
 */

/** A sensible starting point, matching the measurement defaults in the schema. */
function blankItem(): TakeoffTemplateItem {
  return {
    name: "",
    measurementType: "area",
    color: COLOR_SWATCHES[0],
    categoryName: null,
    multiplier: 1,
    wastePercent: 0,
    heightMm: null,
    fillPattern: "solid",
    lineType: "solid",
    lineSize: 2,
    unit: "m²",
  };
}

/**
 * Keep a stored value selectable even when it is not one of the offered options.
 *
 * The pickers are the ones the drawing form offers, but the stored value does
 * not have to come from there — `lineSize` is an integer column and the form
 * offers only 1-3, and a fill pattern written by older code may not be in the
 * current list. A Radix Select given a value it has no item for renders BLANK,
 * and can emit an empty onValueChange when it is first opened, which would
 * quietly rewrite a template the builder never touched.
 *
 * So anything already stored is appended to its own list, marked as what it
 * is, and survives a save untouched.
 */
function withStoredValue<T extends { value: string; label: string }>(
  options: readonly T[],
  stored: string | undefined | null,
): Array<{ value: string; label: string }> {
  const list = options.map((o) => ({ value: o.value, label: o.label }));
  if (stored && !list.some((o) => o.value === stored)) {
    list.push({ value: stored, label: `${stored} (saved)` });
  }
  return list;
}

/** Stands in for the empty unit a "manual" item may legitimately have. */
const BLANK_UNIT = "__none__";

function defaultUnitFor(type: string): string {
  if (type === "area") return "m²";
  if (type === "linear") return "lm";
  if (type === "count") return "each";
  return "";
}

export default function TakeoffTemplateDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: templates, isLoading } = useQuery<TakeoffTemplate[]>({
    queryKey: ["/api/takeoff-templates"],
  });
  const template = templates?.find((t) => t.id === params.id);

  const [items, setItems] = useState<TakeoffTemplateItem[]>([]);
  const [dirty, setDirty] = useState(false);

  // Seed once the template arrives. Keyed on the id so opening a different
  // template replaces the draft rather than merging into it, and guarded on
  // `dirty` so a background refetch cannot wipe unsaved edits mid-typing.
  useEffect(() => {
    if (!template || dirty) return;
    setItems(template.items ?? []);
  }, [template?.id, template?.items, dirty]);

  const save = useMutation({
    mutationFn: async () => apiRequest(`/api/takeoff-templates/${params.id}`, "PATCH", { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-templates"] });
      setDirty(false);
      toast({ title: "Template saved" });
    },
    onError: (e: any) =>
      toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const update = (index: number, patch: Partial<TakeoffTemplateItem>) => {
    setDirty(true);
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const unitsFor = (type: string): string[] =>
    UNIT_OPTIONS[(type as MeasurementType)] ?? UNIT_OPTIONS.manual;

  const invalid = useMemo(
    () => items.some((i) => !i.name.trim()),
    [items],
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="loading-template">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-12 flex items-center px-3 gap-2 border-b border-border">
          <Button variant="ghost" size="sm" onClick={() => navigate("/takeoff-templates")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Take-off Templates
          </Button>
        </div>
        <EmptyState
          icon={Calculator}
          title="Template not found"
          description="It may have been deleted. Pick another from the list."
        />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="page-takeoff-template-detail">
      {/* Header — same shape as the other template detail pages. */}
      <div className="h-12 bg-background flex items-center px-3 gap-2 flex-shrink-0 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/takeoff-templates")}
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Take-off Templates
        </Button>
        <span className="text-sm font-medium truncate">{template.name}</span>
        <Badge variant="secondary" className="text-xs" data-testid="text-item-count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDirty(true);
              setItems((prev) => [...prev, blankItem()]);
            }}
            data-testid="button-add-item"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
          <Button
            size="sm"
            onClick={() => save.mutate()}
            // Blocked on a nameless item rather than silently saving one: an
            // item with no name is unusable on a plan and impossible to pick
            // out of a list afterwards.
            disabled={!dirty || invalid || save.isPending}
            title={invalid ? "Every item needs a name" : undefined}
            data-testid="button-save-template"
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {invalid && (
        <div className="px-3 py-1.5 text-xs text-destructive border-b border-border flex-shrink-0">
          Every item needs a name before this can be saved.
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {items.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="No items yet"
            description="Add the measurements this template should set up — what you measure, and how it is drawn."
            action={{
              label: "Add Item",
              icon: Plus,
              onClick: () => {
                setDirty(true);
                setItems([blankItem()]);
              },
              "data-testid": "button-add-first-item",
            }}
          />
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className="rounded-lg border border-border bg-card p-2 flex flex-wrap items-center gap-2"
                data-testid={`row-template-item-${index}`}
              >
                {/* Colour — the thing you recognise an item by on the plan. */}
                <Select value={item.color} onValueChange={(color) => update(index, { color })}>
                  <SelectTrigger className="w-[60px] h-8" data-testid={`select-color-${index}`}>
                    <span
                      className="h-4 w-4 rounded-full border border-border"
                      style={{ backgroundColor: item.color }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_SWATCHES.map((c) => (
                      <SelectItem key={c} value={c}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full border border-border"
                            style={{ backgroundColor: c }}
                          />
                          {c}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={item.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="Item name, e.g. Wall tiles"
                  className="h-8 flex-1 min-w-[160px]"
                  data-testid={`input-name-${index}`}
                />

                <Input
                  value={item.categoryName ?? ""}
                  onChange={(e) => update(index, { categoryName: e.target.value || null })}
                  placeholder="Category"
                  className="h-8 w-[130px]"
                  data-testid={`input-category-${index}`}
                />

                <Select
                  value={item.measurementType}
                  onValueChange={(measurementType) => {
                    // The unit follows the type unless the current one still
                    // applies — changing Area to Count must not leave "m²".
                    const allowed = unitsFor(measurementType);
                    update(index, {
                      measurementType,
                      unit: allowed.includes(item.unit ?? "") ? item.unit : defaultUnitFor(measurementType),
                      // A wall height only means anything on a linear run.
                      heightMm: measurementType === "linear" ? item.heightMm ?? null : null,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-[110px]" data-testid={`select-type-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.unit || BLANK_UNIT}
                  // A Radix Select cannot hold "" as a value — that means "no
                  // selection" — so the blank unit a manual item is allowed to
                  // have travels as a sentinel and is mapped back here. Without
                  // this it would save a literal space as the unit.
                  onValueChange={(unit) => update(index, { unit: unit === BLANK_UNIT ? "" : unit })}
                >
                  <SelectTrigger className="h-8 w-[90px]" data-testid={`select-unit-${index}`}>
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {withStoredValue(
                      unitsFor(item.measurementType).map((u) => ({ value: u || BLANK_UNIT, label: u || "—" })),
                      item.unit || undefined,
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Wall height turns a run into an area, so it only shows for linear. */}
                {item.measurementType === "linear" && (
                  <Input
                    type="number"
                    value={item.heightMm ?? ""}
                    onChange={(e) =>
                      update(index, { heightMm: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    placeholder="Height mm"
                    className="h-8 w-[100px]"
                    data-testid={`input-height-${index}`}
                  />
                )}

                <Select
                  value={item.fillPattern ?? "solid"}
                  onValueChange={(fillPattern) => update(index, { fillPattern })}
                >
                  <SelectTrigger className="h-8 w-[120px]" data-testid={`select-fill-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withStoredValue(FILL_PATTERN_OPTIONS, item.fillPattern).map((f) => (
                      <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={item.lineType ?? "solid"}
                  onValueChange={(lineType) => update(index, { lineType })}
                >
                  <SelectTrigger className="h-8 w-[110px]" data-testid={`select-linetype-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withStoredValue(LINE_TYPE_OPTIONS, item.lineType).map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={String(item.lineSize ?? 2)}
                  onValueChange={(v) => update(index, { lineSize: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-[80px]" data-testid={`select-linesize-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {withStoredValue(
                      LINE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n}px` })),
                      item.lineSize === undefined ? undefined : String(item.lineSize),
                    ).map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  value={item.wastePercent}
                  onChange={(e) => update(index, { wastePercent: Number(e.target.value) || 0 })}
                  className="h-8 w-[80px]"
                  title="Waste %"
                  data-testid={`input-waste-${index}`}
                />

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setDirty(true);
                    setItems((prev) => prev.filter((_, i) => i !== index));
                  }}
                  aria-label={`Remove ${item.name || "item"}`}
                  data-testid={`button-remove-${index}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
