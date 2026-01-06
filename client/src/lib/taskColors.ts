// Notion-style colors: light background with darker text of the same hue
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

// Helper to check if a color string is a valid TaskColor key
export function isTaskColorKey(color: string | null | undefined): color is TaskColor {
  return !!color && color in TASK_COLORS;
}

// Get color config for a color value (handles both keys and legacy hex values)
export function getTaskColorConfig(color: string | null | undefined) {
  if (!color) return null;
  if (isTaskColorKey(color)) {
    return TASK_COLORS[color];
  }
  // Legacy hex color - return null so caller can handle it
  return null;
}
