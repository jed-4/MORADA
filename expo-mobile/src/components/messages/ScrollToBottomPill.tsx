import { Text, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import type { Theme } from '../../theme';

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
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(150)}
      style={[styles.wrap, { bottom: bottomOffset }]}
    >
      <PressableScale
        onPress={onPress}
        style={[
          styles.pill,
          hasNew
            ? { backgroundColor: theme.primary, borderColor: theme.primary }
            : { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {hasNew && <Text style={styles.pillTextNew}>New messages</Text>}
        <Ionicons
          name="arrow-down"
          size={15}
          color={hasNew ? '#FFFFFF' : theme.textSecondary}
        />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignSelf: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    // Keeps the pill legible over message bubbles on both themes.
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pillTextNew: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
