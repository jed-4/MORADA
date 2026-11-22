import { Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';

export interface TabOption<K extends string> {
  key: K;
  label: string;
}

/** View switch inside a project: underlined labels on a full-width rule. */
export function UnderlineTabs<K extends string>({
  tabs,
  value,
  onChange,
  nav,
}: {
  tabs: TabOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Trailing ‹ Today › (Schedule Gantt / Calendar). */
  nav?: { onPrev: () => void; onToday: () => void; onNext: () => void };
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: metrics.underlineTabs.gap, borderBottomWidth: size.border, borderBottomColor: c.border, minHeight: metrics.underlineTabs.height }}
    >
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: metrics.hitSlop, bottom: 0, left: metrics.hitSlop / 2, right: metrics.hitSlop / 2 }}
          >
            <Text style={[type.body, { color: active ? c.accent : c.muted }]}>{t.label}</Text>
            <View
              style={{
                marginTop: metrics.underlineTabs.underlineGap,
                height: size.underline,
                borderRadius: radii.xs / 2,
                backgroundColor: active ? c.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
      {nav ? (
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: metrics.underlineTabs.navGap, paddingBottom: metrics.underlineTabs.underlineGap + size.underline }}>
          <Pressable onPress={nav.onPrev} hitSlop={metrics.hitSlop} accessibilityLabel="Previous">
            <ChevronLeft size={metrics.underlineTabs.navIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
          </Pressable>
          <Pressable onPress={nav.onToday} hitSlop={metrics.hitSlop} accessibilityRole="button">
            <Text style={[type.meta, { color: c.accent }]}>Today</Text>
          </Pressable>
          <Pressable onPress={nav.onNext} hitSlop={metrics.hitSlop} accessibilityLabel="Next">
            <ChevronRight size={metrics.underlineTabs.navIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
