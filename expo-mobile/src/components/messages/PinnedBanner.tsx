import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import { markupToDisplay } from './mentions';
import type { Theme } from '../../theme';
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
  const preview = markupToDisplay(message.content || '').trim();
  const hasImages = (message.attachments || []).length > 0;
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.wrap, { backgroundColor: theme.primaryLight, borderBottomColor: theme.border }]}
    >
      <Ionicons name="pin" size={13} color={theme.primary} />
      <View style={styles.body}>
        <Text style={[styles.label, { color: theme.primary }]}>
          {count > 1 ? `Pinned · ${count}` : 'Pinned'}
        </Text>
        <Text style={[styles.preview, { color: theme.textSecondary }]} numberOfLines={1}>
          {preview || (hasImages ? 'Photo' : 'Message')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  label: { fontSize: 11, fontWeight: '700' },
  preview: { fontSize: 12, flexShrink: 1 },
});
