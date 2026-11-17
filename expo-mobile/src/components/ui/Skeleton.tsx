import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme, radius } from '../../theme';

// Shimmer placeholder block for first-ever loads (cached loads render real
// content instantly — skeletons are only for empty-cache cold starts).
//
//   <Skeleton width={150} height={120} borderRadius={16} />
//   <SkeletonRow />  — avatar + two text lines

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = '100%',
  height = 14,
  borderRadius = radius.md,
  style,
}: SkeletonProps) {
  const theme = useTheme();
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: theme.border }, animatedStyle, style]}
    />
  );
}

/** Convenience row: circular avatar + two stacked lines. */
export function SkeletonRow({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      <Skeleton width={36} height={36} borderRadius={18} />
      <View style={styles.lines}>
        <Skeleton width="70%" height={13} />
        <Skeleton width="45%" height={11} />
      </View>
    </View>
  );
}

/**
 * Placeholder list shown while a screen's first load is in flight, so the
 * screen looks like what is coming instead of a lone spinner or "No items".
 */
export function SkeletonList({ count = 6, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.list, style]} accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 16,
    gap: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
});
