import { Text, View, useColorScheme } from 'react-native';
import { metrics, projectTint, radii, tabular, type, useColors } from '../../theme';

interface CalendarBlockProps {
  title: string;
  time?: string | null;
  /** Project colour. Omit for internal (non-project) events. */
  color?: string | null;
  variant?: 'week' | 'list' | 'allDay';
  /** Block height in the week grid; time shows only at ≥49dp (> 45 min). */
  height?: number;
}

/** Calendar event: project tint fill + 3dp full-colour strip on the left. */
export function CalendarBlock({ title, time, color, variant = 'week', height }: CalendarBlockProps) {
  const c = useColors();
  const isDark = useColorScheme() === 'dark';
  const m = metrics.calendarBlock;
  const base = variant === 'list' ? c.surface : c.bg;
  // projectTint mixes in sRGB, so it is only meaningful over the light surfaces.
  const fill = color ? projectTint(color, isDark ? m.tintDark : m.tint, base) : c.internalFill;
  const strip = color || c.internalStrip;
  const showTime = !!time && (variant === 'list' || (variant === 'week' && (height ?? 0) >= m.showTimeMinHeight));
  const pad =
    variant === 'list'
      ? { paddingVertical: m.listPad.y, paddingRight: m.listPad.right, paddingLeft: m.listPad.left }
      : { paddingTop: m.weekPad.top, paddingRight: m.weekPad.right, paddingLeft: m.weekPad.left };
  return (
    <View
      style={{
        height: variant === 'allDay' ? m.allDayHeight : height,
        borderRadius: radii.sm,
        backgroundColor: fill,
        overflow: 'hidden',
        flexDirection: 'row',
      }}
    >
      <View style={{ width: m.strip, backgroundColor: strip }} />
      <View style={[{ flex: 1, justifyContent: variant === 'allDay' ? 'center' : 'flex-start' }, variant === 'allDay' ? { paddingLeft: m.weekPad.left } : pad]}>
        <Text numberOfLines={variant === 'list' ? 2 : variant === 'allDay' ? 1 : 3} style={[variant === 'list' ? type.rowTitle : type.micro, { color: c.textBody }]}>
          {title}
        </Text>
        {showTime ? <Text style={[variant === 'list' ? type.caption : type.tiny, tabular, { color: c.muted }]}>{time}</Text> : null}
      </View>
    </View>
  );
}

/** Workspace / Duo Today: the 3dp project-colour bar beside an agenda row (the only bar in the app). */
export function AgendaStrip({ color }: { color?: string | null }) {
  const c = useColors();
  const m = metrics.calendarBlock;
  return <View style={{ width: m.agendaWidth, height: m.agendaHeight, borderRadius: radii.xs, backgroundColor: color || c.internalStrip }} />;
}
