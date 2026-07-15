import { View, StyleSheet } from 'react-native';
import type { Theme } from '../../theme';

// Small green "online" dot, overlaid on the bottom-right of an avatar.
// The ring is drawn in the surrounding surface colour so the dot reads as a
// cutout rather than a floating blob.

interface PresenceDotProps {
  theme: Theme;
  /** Surface the dot sits on — the ring colour. Defaults to the card colour. */
  ringColor?: string;
  size?: number;
}

export function PresenceDot({ theme, ringColor, size = 10 }: PresenceDotProps) {
  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.sage,
          borderColor: ringColor ?? theme.card,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderWidth: 2,
  },
});
