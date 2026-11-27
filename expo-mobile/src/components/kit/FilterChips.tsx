import { Pressable, ScrollView, Text } from 'react-native';
import { metrics, radii, size, tabular, type, useColors } from '../../theme';

export interface Chip<K extends string> {
  key: K;
  label: string;
  count?: number | null;
}

/** Horizontal status filter (Defects, Projects search). */
export function FilterChips<K extends string>({ chips, value, onChange }: { chips: Chip<K>[]; value: K; onChange: (key: K) => void }) {
  const c = useColors();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: metrics.filterChip.gap }}>
      {chips.map((ch) => {
        const active = ch.key === value;
        return (
          <Pressable
            key={ch.key}
            onPress={() => onChange(ch.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: metrics.filterChip.innerGap,
              paddingVertical: metrics.filterChip.padY,
              paddingHorizontal: metrics.filterChip.padX,
              borderRadius: radii.md,
              borderWidth: size.border,
              borderColor: active ? c.border : 'transparent',
              backgroundColor: active ? c.surface : 'transparent',
            }}
          >
            <Text style={[type.meta, { color: active ? c.accent : c.muted }]}>{ch.label}</Text>
            {ch.count != null ? <Text style={[type.caption, tabular, { color: active ? c.accent : c.faint }]}>{ch.count}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
