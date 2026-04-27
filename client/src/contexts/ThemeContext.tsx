import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
type ResolvedTheme = "dark" | "light";
export type WarmVariant = "none" | "a" | "b" | "c" | "d" | "e" | "f" | "g";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  warmVariant: WarmVariant;
  setWarmVariant: (variant: WarmVariant) => void;
};

const initialState: ThemeProviderState = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
  warmVariant: "none",
  setWarmVariant: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
  }
  return defaultTheme;
}

function getStoredWarmVariant(): WarmVariant {
  if (typeof window === "undefined") return "none";
  try {
    const stored = localStorage.getItem("dark-warm-variant");
    if (stored === "a" || stored === "b" || stored === "c" || stored === "d" || stored === "e" || stored === "f" || stored === "g") return stored;
  } catch {
  }
  return "none";
}

const WARM_VARIANT_CLASSES: Record<WarmVariant, string | null> = {
  none: null,
  a: "dark-warm-a",
  b: "dark-warm-b",
  c: "dark-warm-c",
  d: "dark-warm-d",
  e: "dark-warm-e",
  f: "dark-warm-f",
  g: "dark-warm-g",
};

const ALL_VARIANT_CLASSES = ["dark-warm-a", "dark-warm-b", "dark-warm-c", "dark-warm-d", "dark-warm-e", "dark-warm-f", "dark-warm-g"];

function applyWarmVariantClass(resolved: ResolvedTheme, variant: WarmVariant) {
  const root = window.document.documentElement;
  root.classList.remove(...ALL_VARIANT_CLASSES);
  if (variant === "none") return;
  // Dark mode is locked to the base `.dark` palette (#1C1B19) — variants a–f
  // have been removed from CSS, so we never apply their classes either.
  // Only the light-mode variant `g` still has a CSS rule.
  if (variant === "g" && resolved === "light") {
    root.classList.add("dark-warm-g");
  }
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  ...props
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme(defaultTheme));
  const [warmVariant, setWarmVariantState] = useState<WarmVariant>(() => getStoredWarmVariant());

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const currentTheme = getStoredTheme(defaultTheme);
    if (currentTheme === "system") {
      return getSystemTheme();
    }
    return currentTheme;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const root = window.document.documentElement;

    const applyTheme = (resolved: ResolvedTheme) => {
      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      setResolvedTheme(resolved);
      applyWarmVariantClass(resolved, warmVariant);
    };

    if (theme === "system") {
      const systemTheme = getSystemTheme();
      applyTheme(systemTheme);

      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? "dark" : "light");
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    } else {
      applyTheme(theme);
    }
  }, [theme, warmVariant]);

  const value = {
    theme,
    resolvedTheme,
    setTheme: (newTheme: Theme) => {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("theme", newTheme);
        } catch {
        }
      }
      setThemeState(newTheme);
    },
    warmVariant,
    setWarmVariant: (variant: WarmVariant) => {
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("dark-warm-variant", variant);
        } catch {
        }
      }
      setWarmVariantState(variant);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
