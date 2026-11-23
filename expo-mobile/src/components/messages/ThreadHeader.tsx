import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ChevronLeft, Eye, Hash } from 'lucide-react-native';
import { PresenceDot } from './PresenceDot';
import { Avatar } from '../kit';
import { metrics, radii, size, space, type, useColors, type Theme } from '../../theme';

// Thread header: back button + channel/DM title, with a presence dot on the
// counterpart's avatar for DMs. Channels get no dot — presence is per-person.
// Client-facing channels also carry a persistent amber CLIENT badge: this is
// the one signal that stays on screen while you compose, so a supervisor can
// always tell whether the client is reading along.

interface ThreadHeaderProps {
  channelName: string;
  isDm: boolean;
  /** Only ever true for the *other* participant; never for yourself. */
  showPresence: boolean;
  /** Resolved from the fetched channel, never from route params — see screen. */
  isClientFacing?: boolean;
  theme: Theme;
  paddingTop: number;
  onBack: () => void;
}

/** Preserves the Phase-2 title rules: `#channel`, or a humanised dm- fallback. */
export function formatThreadTitle(channelName: string, isDm: boolean): string {
  if (!channelName) return 'Messages';
  if (channelName.startsWith('dm-')) return channelName.replace(/^dm-/, '').replace(/-/g, ' ');
  return isDm ? channelName : `#${channelName}`;
}

export function ThreadHeader({
  channelName,
  isDm,
  showPresence,
  isClientFacing,
  theme,
  paddingTop,
  onBack,
}: ThreadHeaderProps) {
  const c = useColors();
  const title = formatThreadTitle(channelName, isDm).replace(/^#/, '');
  return (
    <View style={[styles.header, { paddingTop, borderBottomColor: c.border }]}>
      <Pressable onPress={onBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
        <ChevronLeft size={metrics.pageHeader.back} color={c.accent} strokeWidth={metrics.iconStroke} />
      </Pressable>
      {isDm ? (
        <View>
          <Avatar name={title} />
          {showPresence ? <PresenceDot theme={theme} ringColor={c.bg} size={9} /> : null}
        </View>
      ) : (
        <View style={[styles.hash, { backgroundColor: c.greyFill }]}>
          <Hash size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />
        </View>
      )}
      <Text style={[type.sectionTitle, styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {isClientFacing && !isDm ? <Eye size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.messages.threadHeaderGap,
    paddingHorizontal: space.screenX,
    paddingBottom: space.inline + space.inlineSm,
    borderBottomWidth: size.border,
  },
  hash: {
    width: metrics.avatar.row.size,
    height: metrics.avatar.row.size,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1 },
});
