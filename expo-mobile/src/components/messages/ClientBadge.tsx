import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../../theme';
import type { Theme } from '../../theme';

// Amber "CLIENT" pill for client-facing channels (channels.isClientFacing).
// Amber — not red — deliberately: statusDanger means error/over-budget in this
// palette, statusWarning means caution. Mirrors the web's "Eye · Client" badge.
// Shared by the channel list row and the thread header so the two can never
// drift apart.

interface ClientBadgeProps {
  theme: Theme;
  /** Header uses the eye + label; list rows already carry an eye in the avatar. */
  showIcon?: boolean;
}

export function ClientBadge({ theme, showIcon }: ClientBadgeProps) {
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.statusWarningBg }]}
      // Grouped so the label is announced as one phrase rather than a bare
      // "CLIENT", which isn't self-explanatory out of context.
      accessible
      accessibilityLabel="Client-facing channel, visible to the client"
    >
      {showIcon && <Ionicons name="eye" size={10} color={theme.statusWarning} />}
      <Text style={[styles.text, { color: theme.statusWarning }]}>CLIENT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    // Never let a long channel name squeeze the pill into an ellipsis.
    flexShrink: 0,
  },
  text: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});
