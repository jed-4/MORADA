import { useState } from "react";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pixel length the user drew on the page (in rendered px). */
  pixelLength: number;
  onSave: (data: {
    calibrationPixelLength: number;
    calibrationRealDistance: number;
    calibrationUnit: "mm" | "cm" | "m";
  }) => void;
}

export default function TakeoffScaleModal({
  open,
  onOpenChange,
  pixelLength,
  onSave,
}: Props) {
  const [distance, setDistance] = useState<string>("");
  const [unit, setUnit] = useState<"mm" | "cm" | "m">("mm");

  const handleSave = () => {
    const num = parseFloat(distance);
    if (!num || num <= 0 || pixelLength <= 0) return;
    onSave({
      calibrationPixelLength: pixelLength,
      calibrationRealDistance: num,
      calibrationUnit: unit,
    });
    setDistance("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Calibrate scale</DialogTitle>
          <DialogDescription>
            Enter the real-world distance of the line you drew on the plan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            You drew a line {Math.round(pixelLength)} px long.
          </div>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="real-distance">Real distance</Label>
              <Input
                id="real-distance"
                type="number"
                step="0.01"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                placeholder="e.g. 1000"
                data-testid="input-real-distance"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as any)}>
                <SelectTrigger data-testid="select-calibration-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm">mm</SelectItem>
                  <SelectItem value="cm">cm</SelectItem>
                  <SelectItem value="m">m</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!distance || parseFloat(distance) <= 0}
            data-testid="button-save-calibration"
          >
            Save scale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
