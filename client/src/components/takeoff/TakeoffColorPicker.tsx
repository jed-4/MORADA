import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { MORADA_MARKUP_PALETTE_HEXES, markupColorName } from "@/lib/colors";

// Takeoff uses the drawing-weight palette, not MORADA_PALETTE. These colours
// are strokes over PDF plans and need to carry against white paper rather than
// sit harmoniously on app chrome — see the note on MORADA_MARKUP_PALETTE in
// lib/colors.ts for how they are derived from the Morada hues and why they are
// kept separate.
export const MEASUREMENT_COLORS = MORADA_MARKUP_PALETTE_HEXES;
export const MARKUP_COLORS = MORADA_MARKUP_PALETTE_HEXES;

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
      {/* Narrower than before: the palette is 11 drawing colours, not 44, so the
          popover no longer needs to be w-72 and a 6-wide grid fills two rows
          evenly instead of leaving three orphans under a row of eight. */}
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-6 gap-1.5 mb-2">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              title={markupColorName(c) ?? c}
              aria-label={markupColorName(c) ?? c}
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
