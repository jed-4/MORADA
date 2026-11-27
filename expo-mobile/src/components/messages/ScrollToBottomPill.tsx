import { Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { ArrowDown } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { metrics, radii, shadow, size, space, type, useColors, type Theme } from '../../theme';

// Floating "jump to newest" pill. Appears once the user scrolls away from the
// newest message; upgrades to a highlighted "New messages" state when messages
// land while they're reading history. Absolutely positioned over the list so it
// never reflows the inverted FlatList.

interface ScrollToBottomPillProps {
  visible: boolean;
  /** True when messages arrived while scrolled away — changes copy + colour. */
  hasNew: boolean;
  theme: Theme;
  onPress: () => void;
  /** Lifted above the typing row when one is showing. */
  bottomOffset: number;
}

export function ScrollToBottomPill({
  visible,
  hasNew,
  theme,
  onPress,
  bottomOffset,
}: ScrollToBottomPillProps) {
  const c = useColors();
  void theme;
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      style={[styles.wrap, { bottom: bottomOffset }]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={hasNew ? 'New messages, scroll to newest' : 'Scroll to newest'}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: hasNew ? c.accent : c.surface, borderColor: hasNew ? c.accent : c.border, opacity: pressed ? metrics.pressedOpacity : 1 },
        ]}
      >
        {hasNew ? <Text style={[type.metaSemi, { color: c.onAccent }]}>New messages</Text> : null}
        <ArrowDown size={size.icon.row} color={hasNew ? c.onAccent : c.icon} strokeWidth={metrics.iconStroke} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center' },
  // Floats over the list like the FAB, so it carries the sheet shadow.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    paddingHorizontal: space.rowGap,
    paddingVertical: space.inline,
    borderRadius: radii.pill,
    borderWidth: size.border,
    ...shadow.sheet,
  },
});
