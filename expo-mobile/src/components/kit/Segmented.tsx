import { Pressable, Text, View } from 'react-native';
import { metrics, radii, size, type, useColors } from '../../theme';
import type { TabOption } from './UnderlineTabs';

/** Global Calendar tab only (List / Week / Month). Projects use UnderlineTabs. */
export function Segmented<K extends string>({ options, value, onChange }: { options: TabOption<K>[]; value: K; onChange: (key: K) => void }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', minHeight: metrics.segmented.height, borderRadius: radii.md, backgroundColor: c.avatarFill, padding: metrics.segmented.pad, gap: metrics.segmented.gap, alignSelf: 'flex-start' }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={{
              paddingVertical: metrics.segmented.segPadY,
              paddingHorizontal: metrics.segmented.segPadX,
              borderRadius: radii.seg,
              justifyContent: 'center',
              backgroundColor: active ? c.surface : 'transparent',
              borderWidth: size.border,
              borderColor: active ? c.border : 'transparent',
            }}
          >
            <Text style={[type.meta, { color: active ? c.accent : c.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
