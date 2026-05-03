import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TakeoffCategory } from "@shared/schema";

export type MeasurementType = "area" | "linear" | "count" | "manual";
export interface PendingMeasurement {
  name: string;
  categoryId: string | null;
  measurementType: MeasurementType;
  color: string;
  multiplier: number;
  wastePercent: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  categories: TakeoffCategory[];
  onCreate: (data: PendingMeasurement) => void;
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

export default function TakeoffCreateMeasurementModal({
  open,
  onOpenChange,
  projectId,
  categories,
  onCreate,
}: Props) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("__none__");
  const [newCategory, setNewCategory] = useState("");
  const [measurementType, setMeasurementType] = useState<MeasurementType>("area");
  const [color, setColor] = useState(COLOR_SWATCHES[0]);
  const [multiplier, setMultiplier] = useState("1");
  const [wastePercent, setWastePercent] = useState("0");

  const createCategory = useMutation({
    mutationFn: async (catName: string) => {
      return await apiRequest(`/api/projects/${projectId}/takeoff/categories`, "POST", {
        name: catName,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "takeoff/categories"],
      });
    },
  });

  const reset = () => {
    setName("");
    setCategoryId("__none__");
    setNewCategory("");
    setMeasurementType("area");
    setColor(COLOR_SWATCHES[0]);
    setMultiplier("1");
    setWastePercent("0");
  };

  const handleCreate = async () => {
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

    onCreate({
      name: name.trim(),
      categoryId: finalCategoryId,
      measurementType,
      color,
      multiplier: parseFloat(multiplier) || 1,
      wastePercent: parseFloat(wastePercent) || 0,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New measurement</DialogTitle>
          <DialogDescription>
            Set the details, then draw on the plan to record it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Name</Label>
            <Input
              id="m-name"
              value={name}
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
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
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

          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={measurementType} onValueChange={(v) => setMeasurementType(v as MeasurementType)}>
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
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2 items-center">
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-md border-2 ${
                    color === c ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                  data-testid={`swatch-${c.replace("#", "")}`}
                />
              ))}
              <Input
                type="text"
                value={color}
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
                id="m-multiplier"
                type="number"
                step="0.01"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
                data-testid="input-multiplier"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-waste">Waste %</Label>
              <Input
                id="m-waste"
                type="number"
                step="0.1"
                value={wastePercent}
                onChange={(e) => setWastePercent(e.target.value)}
                data-testid="input-waste-percent"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} data-testid="button-create-measurement">
            {measurementType === "manual" ? "Create" : "Create & draw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
