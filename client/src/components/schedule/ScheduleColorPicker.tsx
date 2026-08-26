import { MORADA_PALETTE_GROUPS } from '@/lib/colors';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Fallback for an assignee with no usable id. Was #9b9b9b (BuildPro Slate);
// now Stone, the nearest Morada neutral at ΔE 8.7.
const FALLBACK_COLOR = "#8A8680";

// A schedule colour derived from the assignee, offered as a one-click option
// alongside the palette. Neutrals are excluded so an auto-suggested colour is
// always an actual colour — the same reason Slate was excluded before.
//
// This only ever SUGGESTS. The hex is stored on the schedule item the moment
// it is clicked, and nothing renders a stored colour through this function, so
// changing the pool does not repaint anything that already exists. The one
// visible effect is that an assignee whose colour was picked from here before
// the palette changed will no longer see the tick against the shortcut, since
// the suggestion for that id is now a different colour.
const ASSIGNEE_POOL = MORADA_PALETTE_GROUPS
  .filter(g => g.group !== 'Neutral')
  .flatMap(g => g.colors);

// Generate a deterministic color from a string (user ID or name)
export function generateColorFromString(str: string): string {
  if (!str) return FALLBACK_COLOR;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const index = Math.abs(hash) % ASSIGNEE_POOL.length;
  return ASSIGNEE_POOL[index].hex;
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
        className="w-auto p-3"
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

          {/* Palette — the shared picker, so schedule offers the same grouped
              set as every other colour control in the app. */}
          <div className="-mx-3">
            <ColorPicker
              value={currentColor ?? ""}
              onChange={handleColorSelect}
              showCustom={false}
              data-testid="color-picker-schedule"
            />
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
