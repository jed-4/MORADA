import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export const MEASUREMENT_COLORS = [
  "#A890D4", "#70CAD0", "#F0B964", "#DA988A", "#82C8A2",
  "#E27D9B", "#5FA5DC", "#C7A45F", "#7A8FB1", "#3F3F3F",
];

export const MARKUP_COLORS = [
  "#E85D04", "#EF4444", "#3B82F6", "#22C55E", "#A890D4", "#1A1A1A",
];

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
      <PopoverContent className="w-56 p-2">
        <div className="grid grid-cols-6 gap-1.5 mb-2">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className={`h-7 w-7 rounded-md border-2 ${color === c ? "border-foreground" : "border-transparent"}`}
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
