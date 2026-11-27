import { Text, View } from 'react-native';
import { metrics, radii, tabular, type, useColors } from '../../theme';

/** Accent count pill. Renders nothing at 0. */
export function UnreadBadge({ count }: { count: number }) {
  const c = useColors();
  if (!count || count <= 0) return null;
  return (
    <View
      style={{
        height: metrics.badge.height,
        minWidth: metrics.badge.height,
        borderRadius: radii.badge,
        paddingHorizontal: metrics.badge.padX,
        backgroundColor: c.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text allowFontScaling={false} style={[type.micro, tabular, { color: c.onAccent }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}
