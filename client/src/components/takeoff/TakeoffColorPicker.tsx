import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { BUILDPRO_PALETTE_HEXES } from "@/lib/colors";

// Deliberately still on BUILDPRO_PALETTE while the rest of the app moves to
// MORADA_PALETTE. These colours are drawn over plans, not over app chrome, so
// they need contrast against white paper rather than harmony with the UI, and
// the Morada palette is warm and muted by design. Measured against white: only
// 5 of its 27 colours reach a 3:1 ratio and 9 fall below 2:1, versus 18 of 44
// for BuildPro. Switching would make most markup options near-invisible on a
// drawing. Needs either a saturated markup set added to the palette, or a
// decision that takeoff stays a deliberate exception.
export const MEASUREMENT_COLORS = BUILDPRO_PALETTE_HEXES;
export const MARKUP_COLORS = BUILDPRO_PALETTE_HEXES;

interface Props {
  color: string;
  onChange: (color: string) => void;
  palette?: string[];
  size?: number;
  testId?: string;
}

export default function TakeoffColorPicker({
  color,
  onChange,
  palette = MEASUREMENT_COLORS,
  size = 16,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(color);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full border border-border flex-shrink-0"
          style={{ backgroundColor: color, height: size, width: size }}
          data-testid={testId}
          aria-label="Pick colour"
        />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2">
        <div className="grid grid-cols-8 gap-1.5 mb-2">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              data-testid={`swatch-${c.replace("#", "")}`}
            />
          ))}
        </div>
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => { if (/^#[0-9A-Fa-f]{6}$/.test(custom)) onChange(custom); }}
          placeholder="#RRGGBB"
          className="h-7 text-xs"
        />
      </PopoverContent>
    </Popover>
  );
}
