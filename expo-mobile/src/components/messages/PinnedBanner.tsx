import { Pressable, Text, StyleSheet } from 'react-native';
import { ChevronRight, Pin } from 'lucide-react-native';
import { markupToDisplay } from './mentions';
import { metrics, radii, size, space, tabular, type, useColors, type Theme } from '../../theme';
import type { Message } from './types';

// Slim banner under the thread header showing the most recently pinned message
// (GET /api/channels/:channelId/pinned, ordered by pinnedAt desc — so index 0 is
// the most recent). Tapping scrolls to the message when it's loaded, otherwise
// the screen opens its text in a Sheet.

interface PinnedBannerProps {
  message: Message;
  /** Shown as "1 of N" affordance when several messages are pinned. */
  count: number;
  theme: Theme;
  onPress: () => void;
}

export function PinnedBanner({ message, count, theme, onPress }: PinnedBannerProps) {
  const c = useColors();
  void theme;
  const preview = markupToDisplay(message.content || '').trim();
  const hasImages = (message.attachments || []).length > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Pinned message: ${preview || 'photo'}`}
      style={({ pressed }) => [styles.wrap, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? metrics.pressedOpacity : 1 }]}
    >
      <Pin size={size.icon.meta} color={c.icon} strokeWidth={metrics.iconStroke} />
      <Text style={[type.metaSemi, tabular, { color: c.text }]}>{count > 1 ? `Pinned · ${count}` : 'Pinned'}</Text>
      <Text style={[type.meta, styles.preview, { color: c.muted }]} numberOfLines={1}>
        {preview || (hasImages ? 'Photo' : 'Message')}
      </Text>
      <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    marginHorizontal: space.screenX,
    marginBottom: space.inline,
    paddingHorizontal: space.cardX,
    paddingVertical: space.inline,
    borderRadius: radii.lg,
    borderWidth: size.border,
  },
  preview: { flex: 1 },
});
