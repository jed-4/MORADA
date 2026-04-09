import { useTheme, WarmVariant } from "@/contexts/ThemeContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type VariantDef = {
  id: WarmVariant;
  label: string;
  description: string;
  bgColor: string;
  accentColor: string;
  isLight?: boolean;
};

const DARK_VARIANTS: VariantDef[] = [
  {
    id: "none",
    label: "Default",
    description: "Default — cool blue-grey charcoal",
    bgColor: "#242830",
    accentColor: "#9b8fd4",
  },
  {
    id: "a",
    label: "A",
    description: "Warm Taupe — brown-taupe backgrounds, lavender accent",
    bgColor: "#2e2419",
    accentColor: "#9c83cc",
  },
  {
    id: "b",
    label: "B",
    description: "Deep Mocha — rich earthy mocha, dusty mauve-rose accent",
    bgColor: "#281910",
    accentColor: "#a07ab8",
  },
  {
    id: "c",
    label: "C",
    description: "Warm Walnut — warm walnut tone, violet accent close to default",
    bgColor: "#2c211a",
    accentColor: "#9585cc",
  },
  {
    id: "d",
    label: "D",
    description: "Dark Slate — near-neutral charcoal, muted slate-blue accent (Figma-style)",
    bgColor: "#262628",
    accentColor: "#6878a8",
  },
  {
    id: "e",
    label: "E",
    description: "Warm Dark — very dark charcoal, warm purple accent",
    bgColor: "#1a1918",
    accentColor: "#9b7fd4",
  },
  {
    id: "f",
    label: "F",
    description: "Dusty Dark — cool grey-purple base, muted purple accent",
    bgColor: "#1a1920",
    accentColor: "#8878a8",
  },
];

const LIGHT_VARIANTS: VariantDef[] = [
  {
    id: "g",
    label: "Warm Light",
    description: "Warm Light — warm cream whites, purple accent",
    bgColor: "#faf9f7",
    accentColor: "#7d62b5",
    isLight: true,
  },
];

export function WarmPaletteSwitcher() {
  const { warmVariant, setWarmVariant, setTheme } = useTheme();

  const handleSelect = (v: VariantDef) => {
    if (v.isLight) {
      setTheme("light");
    } else {
      setTheme("dark");
    }
    setWarmVariant(v.id);
  };

  const renderSwatch = (v: VariantDef) => {
    const isActive = warmVariant === v.id;
    return (
      <Tooltip key={v.id}>
        <TooltipTrigger asChild>
          <button
            onClick={() => handleSelect(v)}
            aria-label={v.description}
            aria-pressed={isActive}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              background: v.bgColor,
              border: isActive ? `2px solid ${v.accentColor}` : "2px solid transparent",
              outline: isActive ? `1px solid ${v.accentColor}` : "none",
              outlineOffset: 1,
              cursor: "pointer",
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
                background: v.accentColor,
                display: "block",
              }}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
          <p className="font-medium">{v.label === "Default" ? "Default" : v.label.length <= 2 ? `Variant ${v.label}` : v.label}</p>
          <p className="text-muted-foreground">{v.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 shadow-md">
        <span className="text-xs text-muted-foreground mr-1 select-none">Dark</span>
        {DARK_VARIANTS.map(renderSwatch)}
      </div>
      <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1.5 shadow-md">
        <span className="text-xs text-muted-foreground mr-1 select-none">Light</span>
        {LIGHT_VARIANTS.map(renderSwatch)}
      </div>
    </div>
  );
}
