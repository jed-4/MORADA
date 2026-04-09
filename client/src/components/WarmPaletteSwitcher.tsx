import { useTheme, WarmVariant } from "@/contexts/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const VARIANTS: { id: WarmVariant; label: string; description: string; bgColor: string; accentColor: string }[] = [
  {
    id: "none",
    label: "Default",
    description: "Default cool blue-grey dark mode",
    bgColor: "#26293a",
    accentColor: "#9b8dc0",
  },
  {
    id: "a",
    label: "A",
    description: "Warm Muted Lavender — taupe backgrounds, soft lavender accent",
    bgColor: "#2a2520",
    accentColor: "#9d8fc0",
  },
  {
    id: "b",
    label: "B",
    description: "Dusty Mauve — deep earthy taupe, dusty rose-purple accent",
    bgColor: "#252119",
    accentColor: "#9370a8",
  },
  {
    id: "c",
    label: "C",
    description: "Warm Violet — balanced warm taupe, violet accent closest to current lilac",
    bgColor: "#292520",
    accentColor: "#9088b8",
  },
];

export function WarmPaletteSwitcher() {
  const { resolvedTheme, warmVariant, setWarmVariant } = useTheme();

  if (resolvedTheme !== "dark") return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1"
      style={{ visibility: "visible" }}
    >
      <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 shadow-md">
        <span className="text-xs text-muted-foreground mr-1 select-none">Palette</span>
        {VARIANTS.map((variant) => {
          const isActive = warmVariant === variant.id;
          return (
            <Tooltip key={variant.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setWarmVariant(variant.id)}
                  aria-label={variant.description}
                  aria-pressed={isActive}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 4,
                    background: variant.bgColor,
                    border: isActive
                      ? `2px solid ${variant.accentColor}`
                      : "2px solid transparent",
                    outline: isActive ? `1px solid ${variant.accentColor}` : "none",
                    outlineOffset: 1,
                    cursor: "pointer",
                    position: "relative",
                    flexShrink: 0,
                    transition: "border-color 0.15s, outline-color 0.15s",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: variant.accentColor,
                      display: "block",
                    }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[180px] text-center text-xs">
                <p className="font-medium">{variant.label === "Default" ? "Default" : `Variant ${variant.label}`}</p>
                <p className="text-muted-foreground">{variant.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
