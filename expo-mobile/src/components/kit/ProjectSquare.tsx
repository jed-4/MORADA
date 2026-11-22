import { View } from 'react-native';
import { colors, metrics, size } from '../../theme';

export type ProjectSquareSize = keyof typeof size.projectSquare;

/** Stable fallback colour for a project with none set. */
export function fallbackProjectColor(key: string | number | null | undefined): string {
  const s = String(key ?? '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return colors.projectFallback[h % colors.projectFallback.length];
}

/** Solid project-colour square at 90%. Replaces every coloured left bar. */
export function ProjectSquare({
  color,
  fallbackKey,
  size: variant = 'row',
}: {
  color?: string | null;
  fallbackKey?: string | number | null;
  size?: ProjectSquareSize;
}) {
  const s = size.projectSquare[variant];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: s,
        height: s,
        borderRadius: metrics.square.radius[variant],
        backgroundColor: color || fallbackProjectColor(fallbackKey),
        opacity: metrics.square.opacity,
      }}
    />
  );
}
