import { View, Text, StyleSheet, Pressable } from 'react-native';
import { ChevronLeft, Eye, Hash, type LucideIcon } from 'lucide-react-native';
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
  /** Omitted in the Duo right pane: there's nothing to go back to. */
  onBack?: () => void;
  /** D07 Duo pane header: big channel icon, name + member count, actions. */
  wide?: boolean;
  /** Channel emoji (set on the web); replaces the # when present. */
  emoji?: string | null;
  memberCount?: number;
  actions?: { icon: LucideIcon; label: string; onPress: () => void }[];
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
  wide,
  emoji,
  memberCount,
  actions,
}: ThreadHeaderProps) {
  const c = useColors();
  const title = formatThreadTitle(channelName, isDm).replace(/^#/, '');
  if (wide) {
    return (
      <View style={[styles.wideHeader, { paddingTop: paddingTop + M.duoHeaderPadY, borderBottomColor: c.border }]}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={metrics.pageHeader.back} color={c.accent} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ) : null}
        {isDm ? (
          <View>
            <Avatar name={title} size="duo" />
            {showPresence ? <PresenceDot theme={theme} ringColor={c.bg} size={9} /> : null}
          </View>
        ) : (
          <View style={[styles.wideHash, { backgroundColor: c.greyFill }]}>
            {emoji ? <Text style={{ fontSize: M.emojiDuo }}>{emoji}</Text> : <Hash size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
          </View>
        )}
        <View style={styles.title}>
          <View style={styles.nameLine}>
            <Text style={[type.sheetTitle, styles.shrink, { color: c.text }]} numberOfLines={1} accessibilityRole="header">
              {title}
            </Text>
            {isClientFacing && !isDm ? <Eye size={size.icon.meta} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
          </View>
          {memberCount ? (
            <Text style={[type.caption, { color: c.muted }]}>{`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}</Text>
          ) : null}
        </View>
        {actions?.map(a => (
          <Pressable key={a.label} onPress={a.onPress} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={a.label}>
            <a.icon size={M.duoActionIcon} color={c.accent} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ))}
      </View>
    );
  }
  return (
    <View style={[styles.header, { paddingTop, borderBottomColor: c.border }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={metrics.pageHeader.back} color={c.accent} strokeWidth={metrics.iconStroke} />
        </Pressable>
      ) : null}
      {isDm ? (
        <View>
          <Avatar name={title} />
          {showPresence ? <PresenceDot theme={theme} ringColor={c.bg} size={9} /> : null}
        </View>
      ) : (
        <View style={[styles.hash, { backgroundColor: c.greyFill }]}>
          {emoji ? <Text style={{ fontSize: M.emojiHeader }}>{emoji}</Text> : <Hash size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
        </View>
      )}
      <Text style={[type.sectionTitle, styles.title, { color: c.text }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {isClientFacing && !isDm ? <Eye size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
    </View>
  );
}

const M = metrics.messages;

const styles = StyleSheet.create({
  wideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.listRow.gap,
    minHeight: M.duoHeaderHeight,
    paddingHorizontal: M.duoPadX,
    paddingBottom: M.duoHeaderPadY,
    borderBottomWidth: size.border,
  },
  wideHash: { width: M.duoIcon, height: M.duoIcon, borderRadius: M.duoIconRadius, alignItems: 'center', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  shrink: { flexShrink: 1 },
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
