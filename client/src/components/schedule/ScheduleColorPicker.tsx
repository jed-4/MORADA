import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Brand primary colour palette (top row)
const PRIMARY_COLORS = [
  { name: "Lilac", value: "#A890D4" },
  { name: "Periwinkle", value: "#8AA5DE" },
  { name: "Aqua", value: "#70CAD0" },
  { name: "Mint", value: "#82C8A2" },
  { name: "Sand", value: "#D4B670" },
  { name: "Coral", value: "#DA988A" },
  { name: "Rose", value: "#D08AAF" },
  { name: "Lavender", value: "#B294D0" },
];

// Standard color palette for schedule items (extended set, shown below)
const STANDARD_COLORS = [
  ...PRIMARY_COLORS,
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Amber", value: "#f59e0b" },
  { name: "Yellow", value: "#eab308" },
  { name: "Lime", value: "#84cc16" },
  { name: "Green", value: "#22c55e" },
  { name: "Emerald", value: "#10b981" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Cyan", value: "#06b6d4" },
  { name: "Sky", value: "#0ea5e9" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Violet", value: "#8b5cf6" },
  { name: "Purple", value: "#a855f7" },
  { name: "Fuchsia", value: "#d946ef" },
  { name: "Pink", value: "#ec4899" },
  { name: "Rose Pink", value: "#f43f5e" },
  { name: "Gray", value: "#9ca3af" },
];

const GRAY_COLOR = "#9ca3af";

// Generate a deterministic color from a string (user ID or name)
export function generateColorFromString(str: string): string {
  if (!str) return GRAY_COLOR;

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const pool = STANDARD_COLORS.filter(c => c.value !== GRAY_COLOR);
  const index = Math.abs(hash) % pool.length;
  return pool[index].value;
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
        className="w-64 p-3" 
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
                  className="w-6 h-6 rounded border-2 border-border"
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

          {/* Brand Colors */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Brand Colors</div>
            <div className="grid grid-cols-8 gap-1.5">
              {PRIMARY_COLORS.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorSelect(color.value)}
                  className="w-7 h-7 rounded border-2 hover-elevate active-elevate-2 relative"
                  style={{
                    backgroundColor: color.value,
                    borderColor: currentColor === color.value ? "#000" : "transparent",
                  }}
                  title={color.name}
                  data-testid={`button-color-${color.name.toLowerCase()}`}
                >
                  {currentColor === color.value && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Standard Colors */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Standard Colors</div>
            <div className="grid grid-cols-6 gap-1.5">
              {STANDARD_COLORS.slice(PRIMARY_COLORS.length).map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleColorSelect(color.value)}
                  className="w-8 h-8 rounded border-2 hover-elevate active-elevate-2 relative"
                  style={{
                    backgroundColor: color.value,
                    borderColor: currentColor === color.value ? "#000" : "transparent",
                  }}
                  title={color.name}
                  data-testid={`button-color-${color.name.toLowerCase()}`}
                >
                  {currentColor === color.value && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </span>
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
              <div className="w-6 h-6 rounded border-2 border-border bg-muted" />
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
