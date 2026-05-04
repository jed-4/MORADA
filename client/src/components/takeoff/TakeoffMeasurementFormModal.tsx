import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TakeoffCategory, TakeoffMeasurement } from "@shared/schema";

export type MeasurementType = "area" | "linear" | "count" | "manual";

export type FillPattern =
  | "solid" | "vertical" | "horizontal"
  | "diagonal" | "diagonal-reverse" | "grid" | "none";

export type LineType = "solid" | "dashed" | "dash-dot" | "dotted";

export interface MeasurementFormData {
  name: string;
  categoryId: string | null;
  measurementType: MeasurementType;
  color: string;
  multiplier: number;
  wastePercent: number;
  unit: string;
  fillPattern: FillPattern;
  lineType: LineType;
  lineSize: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  categories: TakeoffCategory[];
  /** Pass an existing measurement to edit, or null to create a new one. */
  editing?: TakeoffMeasurement | null;
  onSubmit: (data: MeasurementFormData) => void;
}

const COLOR_SWATCHES = [
  "#A890D4", "#70CAD0", "#F0B964", "#DA988A", "#82C8A2",
  "#E27D9B", "#5FA5DC", "#C7A45F", "#7A8FB1", "#3F3F3F",
];

const TYPE_OPTIONS: Array<{ value: MeasurementType; label: string; hint: string }> = [
  { value: "area", label: "Area", hint: "Polygon area on plan" },
  { value: "linear", label: "Linear", hint: "Polyline length" },
  { value: "count", label: "Count", hint: "Click to place items" },
  { value: "manual", label: "Manual", hint: "Type quantity manually" },
];

const UNIT_OPTIONS: Record<MeasurementType, string[]> = {
  area: ["m²", "ft²"],
  linear: ["m", "lm", "ft"],
  count: ["each", "pcs"],
  manual: ["", "m", "m²", "m³", "kg", "L", "hrs", "each"],
};

export const FILL_PATTERN_OPTIONS: Array<{ value: FillPattern; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "vertical", label: "Vertical" },
  { value: "horizontal", label: "Horizontal" },
  { value: "diagonal", label: "Diagonal" },
  { value: "diagonal-reverse", label: "Diagonal reverse" },
  { value: "grid", label: "Grid" },
  { value: "none", label: "None" },
];

export const LINE_TYPE_OPTIONS: Array<{ value: LineType; label: string }> = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dash-dot", label: "Dash-dot" },
  { value: "dotted", label: "Dotted" },
];

export const LINE_SIZE_OPTIONS = [1, 2, 3];

function defaultUnitFor(type: MeasurementType): string {
  if (type === "area") return "m²";
  if (type === "linear") return "lm";
  if (type === "count") return "each";
  return "";
}

export default function TakeoffMeasurementFormModal({
  open, onOpenChange, projectId, categories, editing, onSubmit,
}: Props) {
  const { toast } = useToast();
  const isEdit = !!editing;
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [newCategory, setNewCategory] = useState("");
  const [measurementType, setMeasurementType] = useState<MeasurementType>("area");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [multiplier, setMultiplier] = useState("1");
  const [wastePercent, setWastePercent] = useState("0");
  const [unit, setUnit] = useState("m²");
  const [fillPattern, setFillPattern] = useState<FillPattern>("solid");
  const [lineType, setLineType] = useState<LineType>("solid");
  const [lineSize, setLineSize] = useState<number>(2);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setCategoryId(editing.categoryId ?? "__none__");
      setNewCategory("");
      setMeasurementType(editing.measurementType as MeasurementType);
      setColor(editing.color);
      setMultiplier(String(editing.multiplier ?? 1));
      setWastePercent(String(editing.wastePercent ?? 0));
      setUnit(editing.unit || defaultUnitFor(editing.measurementType as MeasurementType));
      setFillPattern((editing.fillPattern as FillPattern) || "solid");
      setLineType((editing.lineType as LineType) || "solid");
      setLineSize(editing.lineSize ?? 2);
    } else {
      setName("");
      setCategoryId("__none__");
      setNewCategory("");
      setMeasurementType("area");
      setColor(COLOR_SWATCHES[0]);
      setMultiplier("1");
      setWastePercent("0");
      setUnit("m²");
      setFillPattern("solid");
      setLineType("solid");
      setLineSize(2);
    }
  }, [open, editing]);

  // Keep unit valid when type changes (only for create flow — don't stomp user choice on edit).
  useEffect(() => {
    if (isEdit) return;
    setUnit(defaultUnitFor(measurementType));
  }, [measurementType, isEdit]);

  const createCategory = useMutation({
    mutationFn: async (catName: string) =>
      apiRequest(`/api/projects/${projectId}/takeoff/categories`, "POST", { name: catName }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "takeoff/categories"],
      });
    },
  });

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    let finalCategoryId: string | null = null;
    if (categoryId === "__new__" && newCategory.trim()) {
      try {
        const created = await createCategory.mutateAsync(newCategory.trim());
        finalCategoryId = created.id;
      } catch (e: any) {
        toast({ title: "Failed to add category", description: e?.message, variant: "destructive" });
        return;
      }
    } else if (categoryId !== "__none__") {
      finalCategoryId = categoryId;
    }

    onSubmit({
      name: name.trim(),
      categoryId: finalCategoryId,
      measurementType,
      color,
      multiplier: parseFloat(multiplier) || 1,
      wastePercent: parseFloat(wastePercent) || 0,
      unit,
      fillPattern,
      lineType,
      lineSize,
    });
  };

  const showFillRow = measurementType === "area";
  const showLineRow = measurementType === "area" || measurementType === "linear";
  const unitOptions = UNIT_OPTIONS[measurementType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit measurement" : "New measurement"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details for this measurement."
              : "Set the details, then draw on the plan to record it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Name</Label>
            <Input
              id="m-name" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Living room floor"
              data-testid="input-measurement-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger data-testid="select-measurement-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Uncategorised</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
                <SelectItem value="__new__">+ New category…</SelectItem>
              </SelectContent>
            </Select>
            {categoryId === "__new__" && (
              <Input
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name"
                className="mt-2"
                data-testid="input-new-category"
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={measurementType}
                onValueChange={(v) => setMeasurementType(v as MeasurementType)}
                disabled={isEdit}
              >
                <SelectTrigger data-testid="select-measurement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="font-medium">{opt.label}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{opt.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger data-testid="select-measurement-unit">
                  <SelectValue placeholder="Unit" />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u || "__blank__"} value={u || "__blank__"}>
                      {u || "(none)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(showFillRow || showLineRow) && (
            <div className="grid grid-cols-2 gap-2">
              {showFillRow && (
                <div className="space-y-1.5">
                  <Label>Fill</Label>
                  <Select value={fillPattern} onValueChange={(v) => setFillPattern(v as FillPattern)}>
                    <SelectTrigger data-testid="select-measurement-fill">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FILL_PATTERN_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <FillSwatch pattern={opt.value} color={color} />
                            <span>{opt.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showLineRow && (
                <div className="space-y-1.5">
                  <Label>Line</Label>
                  <Select value={lineType} onValueChange={(v) => setLineType(v as LineType)}>
                    <SelectTrigger data-testid="select-measurement-line-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          <div className="flex items-center gap-2">
                            <LineSwatch type={opt.value} color={color} />
                            <span>{opt.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showLineRow && (
                <div className="space-y-1.5">
                  <Label>Size</Label>
                  <Select value={String(lineSize)} onValueChange={(v) => setLineSize(parseInt(v))}>
                    <SelectTrigger data-testid="select-measurement-line-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LINE_SIZE_OPTIONS.map((s) => (
                        <SelectItem key={s} value={String(s)}>
                          <div className="flex items-center gap-2">
                            <SizeSwatch size={s} color={color} />
                            <span>{s === 1 ? "Thin" : s === 2 ? "Medium" : "Thick"}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-md border-2 ${
                    color === c ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  data-testid={`swatch-${c.replace("#", "")}`}
                />
              ))}
              <Input
                type="text" value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-24 h-8 text-xs"
                data-testid="input-custom-color"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-multiplier">Multiplier</Label>
              <Input
                id="m-multiplier" type="number" step="0.01"
                value={multiplier} onChange={(e) => setMultiplier(e.target.value)}
                data-testid="input-multiplier"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-waste">Waste %</Label>
              <Input
                id="m-waste" type="number" step="0.1"
                value={wastePercent} onChange={(e) => setWastePercent(e.target.value)}
                data-testid="input-waste-percent"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} data-testid="button-submit-measurement">
            {isEdit ? "Save" : measurementType === "manual" ? "Create" : "Create & draw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FillSwatch({ pattern, color }: { pattern: FillPattern; color: string }) {
  const id = `swatch-${pattern}`;
  return (
    <svg width="32" height="14" className="rounded-sm border border-border">
      <defs>
        <PatternDef id={id} pattern={pattern} color={color} />
      </defs>
      <rect width="32" height="14" fill={pattern === "none" ? "transparent" : `url(#${id})`} />
    </svg>
  );
}

function LineSwatch({ type, color }: { type: LineType; color: string }) {
  return (
    <svg width="32" height="6">
      <line
        x1="2" y1="3" x2="30" y2="3"
        stroke={color} strokeWidth={2}
        strokeDasharray={lineDashArray(type)}
      />
    </svg>
  );
}

function SizeSwatch({ size, color }: { size: number; color: string }) {
  return (
    <svg width="32" height="6">
      <line x1="2" y1="3" x2="30" y2="3" stroke={color} strokeWidth={size} />
    </svg>
  );
}

export function lineDashArray(type: LineType): string | undefined {
  switch (type) {
    case "dashed": return "6 3";
    case "dash-dot": return "8 3 2 3";
    case "dotted": return "2 3";
    default: return undefined;
  }
}

/**
 * Renders a small <pattern> def inline (used by both swatches and the canvas).
 * Exposes a stable id you provide so callers can reference it via fill="url(#id)".
 */
export function PatternDef({
  id, pattern, color,
}: { id: string; pattern: FillPattern; color: string }) {
  if (pattern === "solid") {
    return (
      <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
        <rect width="4" height="4" fill={color} fillOpacity={0.2} />
      </pattern>
    );
  }
  if (pattern === "vertical") {
    return (
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill={color} fillOpacity={0.06} />
        <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth={1} />
        <line x1="3" y1="0" x2="3" y2="6" stroke={color} strokeWidth={1} />
      </pattern>
    );
  }
  if (pattern === "horizontal") {
    return (
      <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
        <rect width="6" height="6" fill={color} fillOpacity={0.06} />
        <line x1="0" y1="0" x2="6" y2="0" stroke={color} strokeWidth={1} />
        <line x1="0" y1="3" x2="6" y2="3" stroke={color} strokeWidth={1} />
      </pattern>
    );
  }
  if (pattern === "diagonal") {
    return (
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill={color} fillOpacity={0.06} />
        <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth={1} />
        <line x1="4" y1="0" x2="4" y2="8" stroke={color} strokeWidth={1} />
      </pattern>
    );
  }
  if (pattern === "diagonal-reverse") {
    return (
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
        <rect width="8" height="8" fill={color} fillOpacity={0.06} />
        <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth={1} />
        <line x1="4" y1="0" x2="4" y2="8" stroke={color} strokeWidth={1} />
      </pattern>
    );
  }
  if (pattern === "grid") {
    return (
      <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill={color} fillOpacity={0.06} />
        <line x1="0" y1="0" x2="8" y2="0" stroke={color} strokeWidth={1} />
        <line x1="0" y1="0" x2="0" y2="8" stroke={color} strokeWidth={1} />
      </pattern>
    );
  }
  // none → transparent
  return (
    <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="transparent" />
    </pattern>
  );
}
