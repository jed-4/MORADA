import { Pressable, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, tabular, type, useColors } from '../../theme';

/** Project-detail section tile (Schedule, Scope, Selections…). Lives in a horizontal scroll. */
export function SectionTile({ icon: Glyph, label, count, onPress }: { icon: LucideIcon; label: string; count?: string | number | null; onPress: () => void }) {
  const c = useColors();
  const m = metrics.sectionTile;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      style={({ pressed }) => ({
        width: m.width,
        height: m.height,
        borderRadius: radii.lg,
        backgroundColor: c.surface,
        borderWidth: size.border,
        borderColor: c.border,
        paddingTop: m.pad.top,
        paddingRight: m.pad.right,
        paddingBottom: m.pad.bottom,
        paddingLeft: m.pad.left,
        justifyContent: 'space-between',
        opacity: pressed ? metrics.pressedOpacity : 1,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Glyph size={m.icon} color={c.icon} strokeWidth={metrics.iconStroke} />
        {count != null && count !== '' ? <Text style={[type.micro, tabular, { color: c.muted }]}>{count}</Text> : null}
      </View>
      <Text numberOfLines={1} style={[type.tile, { color: c.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}
