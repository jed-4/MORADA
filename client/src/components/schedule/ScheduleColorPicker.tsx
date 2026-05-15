import { BUILDPRO_PALETTE } from '@/lib/colors';
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const GRAY_COLOR = "#9b9b9b"; // Slate — default fallback

// Generate a deterministic color from a string (user ID or name)
export function generateColorFromString(str: string): string {
  if (!str) return GRAY_COLOR;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const pool = BUILDPRO_PALETTE.filter(c => c.hex !== GRAY_COLOR);
  const index = Math.abs(hash) % pool.length;
  return pool[index].hex;
}

interface ScheduleColorPickerProps {
  currentColor?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  onColorChange: (color: string | null) => void;
  triggerButton?: React.ReactNode;
  align?: "start" | "end" | "center";
  open?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function ScheduleColorPicker({
  currentColor,
  assigneeId,
  assigneeName,
  onColorChange,
  triggerButton,
  align = "end",
  open,
  onMouseEnter,
  onMouseLeave,
}: ScheduleColorPickerProps) {

  const assigneeColor = assigneeId ? generateColorFromString(assigneeId) : null;

  const handleColorSelect = (color: string | null) => {
    onColorChange(color);
  };

  return (
    <Popover open={open}>
      <PopoverTrigger asChild>
        {triggerButton || (
          <Button size="icon" variant="ghost" className="h-6 w-6" data-testid="button-color-picker">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-72 p-3"
        data-testid="popover-color-picker"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="space-y-3">
          {/* Assignee Color Option */}
          {assigneeColor && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2">Assignee Color</div>
              <button
                onClick={() => handleColorSelect(assigneeColor)}
                className="w-full flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2"
                data-testid="button-assignee-color"
              >
                <div
                  className="w-6 h-6 rounded-full border-2 border-border"
                  style={{ backgroundColor: assigneeColor }}
                />
                <span className="text-sm">
                  {assigneeName || "Assignee"} Color
                </span>
                {currentColor === assigneeColor && (
                  <span className="ml-auto text-xs text-muted-foreground">✓</span>
                )}
              </button>
            </div>
          )}

          {/* Palette */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Colors</div>
            <div className="grid grid-cols-8 gap-1.5">
              {BUILDPRO_PALETTE.map(({ name, hex }) => (
                <button
                  key={hex}
                  onClick={() => handleColorSelect(hex)}
                  className="w-7 h-7 rounded-full border-2 hover-elevate active-elevate-2 relative flex items-center justify-center"
                  style={{
                    backgroundColor: hex,
                    borderColor: currentColor?.toLowerCase() === hex.toLowerCase() ? "#000" : "transparent",
                  }}
                  title={name}
                  data-testid={`button-color-${name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {currentColor?.toLowerCase() === hex.toLowerCase() && (
                    <span className="text-white text-xs font-bold drop-shadow-sm">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Color */}
          <div>
            <button
              onClick={() => handleColorSelect(null)}
              className="w-full flex items-center gap-2 p-2 rounded-md hover-elevate active-elevate-2 text-sm"
              data-testid="button-clear-color"
            >
              <div className="w-6 h-6 rounded-full border-2 border-border bg-muted" />
              <span>Default Color</span>
              {!currentColor && (
                <span className="ml-auto text-xs text-muted-foreground">✓</span>
              )}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
