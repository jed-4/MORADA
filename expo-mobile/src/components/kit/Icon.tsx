import type { LucideIcon } from 'lucide-react-native';
import { metrics, size as sizes, useColors, type DesignColors } from '../../theme';

type IconTone = 'icon' | 'muted' | 'faint' | 'accent' | 'text' | 'onAccent' | 'link' | 'danger';

interface IconProps {
  as: LucideIcon;
  size?: number;
  /** A theme colour role. Ignored when `color` is given. */
  tone?: IconTone;
  color?: string;
  strokeWidth?: number;
}

/** Every icon in the revamp goes through here: Lucide, round caps, theme colour. */
export function Icon({ as: Glyph, size = sizes.icon.header, tone = 'icon', color, strokeWidth = metrics.iconStroke }: IconProps) {
  const c = useColors();
  return <Glyph size={size} color={color ?? toneColor(c, tone)} strokeWidth={strokeWidth} />;
}

export function toneColor(c: DesignColors, tone: IconTone): string {
  return c[tone];
}
