// Notion-style color utilities: Generate pastel backgrounds and dark text from any hex color

// Convert hex color to HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

// Convert HSL to hex color
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Legacy color key to hex mapping
const LEGACY_COLOR_HEX: Record<string, string> = {
  default: "#6366f1",
  blue: "#3b82f6",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#a855f7",
  orange: "#f97316",
  yellow: "#eab308",
  pink: "#ec4899",
  teal: "#14b8a6",
  gray: "#6b7280",
};

// Generate Notion-style color variants from any hex color or legacy color key
export function generateNotionColors(hexColor: string | null | undefined): {
  pastelBg: string;
  darkText: string;
  originalHex: string;
} {
  // Default fallback color (indigo)
  const defaultColor = '#6366f1';
  
  // Resolve input to hex color
  let hex = defaultColor;
  if (hexColor) {
    // Check if it's a legacy color key
    if (hexColor in LEGACY_COLOR_HEX) {
      hex = LEGACY_COLOR_HEX[hexColor];
    } else if (hexColor.startsWith('#') && (hexColor.length === 7 || hexColor.length === 4)) {
      // Valid hex color
      hex = hexColor.length === 4 
        ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
        : hexColor;
    } else {
      // Unknown format - use default
      hex = defaultColor;
    }
  }
  
  try {
    const hsl = hexToHsl(hex);
    
    // Validate HSL values
    if (isNaN(hsl.h) || isNaN(hsl.s) || isNaN(hsl.l)) {
      throw new Error('Invalid HSL values');
    }
    
    // Pastel background: Keep hue, reduce saturation to 60%, increase lightness to 92%
    const pastelBg = hslToHex(hsl.h, Math.min(hsl.s, 60), 92);
    
    // Dark text: Keep hue, moderate saturation, low lightness (30%)
    const darkText = hslToHex(hsl.h, Math.min(hsl.s * 0.9, 70), 30);
    
    return {
      pastelBg,
      darkText,
      originalHex: hex,
    };
  } catch {
    // Fallback for invalid colors
    return {
      pastelBg: '#e0e7ff',
      darkText: '#3730a3',
      originalHex: defaultColor,
    };
  }
}

// Generate dark mode variant (darker pastel, lighter text)
export function generateNotionColorsDark(hexColor: string | null | undefined): {
  pastelBg: string;
  darkText: string;
  originalHex: string;
} {
  const defaultColor = '#6366f1';
  const hex = hexColor || defaultColor;
  
  try {
    const hsl = hexToHsl(hex);
    
    // Dark mode pastel: Keep hue, reduce saturation, lower lightness for dark bg
    const pastelBg = hslToHex(hsl.h, Math.min(hsl.s * 0.4, 30), 20);
    
    // Dark mode text: Keep hue, moderate saturation, high lightness
    const lightText = hslToHex(hsl.h, Math.min(hsl.s * 0.7, 50), 75);
    
    return {
      pastelBg,
      darkText: lightText,
      originalHex: hex,
    };
  } catch {
    return {
      pastelBg: '#1e1b4b',
      darkText: '#a5b4fc',
      originalHex: defaultColor,
    };
  }
}

// Legacy TASK_COLORS for backwards compatibility
export const TASK_COLORS = {
  default: { bg: "bg-muted", text: "text-foreground", hex: "#6366f1", name: "Default" },
  blue: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", hex: "#3b82f6", name: "Blue" },
  green: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", hex: "#22c55e", name: "Green" },
  red: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", hex: "#ef4444", name: "Red" },
  purple: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300", hex: "#a855f7", name: "Purple" },
  orange: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300", hex: "#f97316", name: "Orange" },
  yellow: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", hex: "#eab308", name: "Yellow" },
  pink: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-300", hex: "#ec4899", name: "Pink" },
  teal: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-700 dark:text-teal-300", hex: "#14b8a6", name: "Teal" },
  gray: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-700 dark:text-gray-300", hex: "#6b7280", name: "Gray" },
} as const;

export type TaskColor = keyof typeof TASK_COLORS;

export function isTaskColorKey(color: string | null | undefined): color is TaskColor {
  return !!color && color in TASK_COLORS;
}

export function getTaskColorConfig(color: string | null | undefined) {
  if (!color) return null;
  if (isTaskColorKey(color)) {
    return TASK_COLORS[color];
  }
  return null;
}
