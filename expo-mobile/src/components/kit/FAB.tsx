import { Pressable, StyleSheet } from 'react-native';
import { Plus, type LucideIcon } from 'lucide-react-native';
import { metrics, radii, shadow, size, useColors } from '../../theme';

/**
 * 52dp accent circle, bottom-right. Sits above the tab bar (screens inside the
 * tab navigator already end at the bar). Screens with a FAB need ≥84dp bottom
 * padding on their scroll view so the last row isn't hidden (`FAB_CLEARANCE`).
 */
export function FAB({ onPress, label, icon: Glyph = Plus }: { onPress: () => void; label: string; icon?: LucideIcon }) {
  const c = useColors();
  const iconSize = Glyph === Plus ? size.fabIcon : metrics.fab.cameraIcon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.fab,
        shadow.fab,
        { backgroundColor: c.accent, opacity: pressed ? metrics.solidPressedOpacity : 1 },
      ]}
    >
      <Glyph size={iconSize} color={c.onAccent} strokeWidth={metrics.iconStrokeActive} />
    </Pressable>
  );
}

/** Bottom padding for a scroll view on a screen with a FAB. */
export const FAB_CLEARANCE = size.fab + size.fabInset * 2;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: size.fabInset,
    bottom: size.fabInset,
    width: size.fab,
    height: size.fab,
    borderRadius: radii.fab,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
