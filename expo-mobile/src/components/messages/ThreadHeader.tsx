import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import { PresenceDot } from './PresenceDot';
import { ClientBadge } from './ClientBadge';
import { getInitials } from '../../lib/format';
import type { Theme } from '../../theme';

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
  return (
    <View style={[styles.header, { paddingTop }]}>
      <PressableScale haptics onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={theme.primary} />
      </PressableScale>
      <View style={styles.headerCenter}>
        {isDm && (
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '30' }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>
                {getInitials(formatThreadTitle(channelName, isDm))}
              </Text>
            </View>
            {showPresence && <PresenceDot theme={theme} ringColor={theme.card} size={9} />}
          </View>
        )}
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]} numberOfLines={1}>
          {formatThreadTitle(channelName, isDm)}
        </Text>
        {isClientFacing && !isDm && <ClientBadge theme={theme} showIcon />}
      </View>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  avatarWrap: { width: 26, height: 26 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
});
