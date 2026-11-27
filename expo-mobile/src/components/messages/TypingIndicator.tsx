import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { space, type, useColors, type Theme } from '../../theme';

// "Sarah is typing…" row. Rendered as an absolutely-positioned overlay pinned to
// the bottom of the list area (see MessageThreadScreen) so that showing it never
// reflows the FlatList — a layout shift under an inverted list would jump the
// user's scroll position. pointerEvents is disabled so it can't eat taps meant
// for the newest bubble underneath.

/** "Sarah", "Sarah and Dave", "Several people" — capped to avoid a wrapping row. */
export function formatTypingLabel(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}

interface TypingIndicatorProps {
  names: string[];
  theme: Theme;
}

export function TypingIndicator({ names, theme }: TypingIndicatorProps) {
  const c = useColors();
  void theme;
  if (names.length === 0) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      style={[styles.wrap, { backgroundColor: c.bg }]}
    >
      <View style={styles.dots}>
        {[0, 1, 2].map(i => (
          <View key={i} style={[styles.dot, { backgroundColor: c.faint }]} />
        ))}
      </View>
      <Text style={[type.caption, styles.text, { color: c.muted }]} numberOfLines={1}>
        {formatTypingLabel(names)}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    paddingHorizontal: space.screenX,
    paddingVertical: space.inlineSm,
  },
  dots: { flexDirection: 'row', gap: space.inlineSm / 2 + 1 },
  dot: { width: space.inlineSm, height: space.inlineSm, borderRadius: space.inlineSm / 2 },
  text: { flexShrink: 1 },
});
