import { View, Text, StyleSheet } from 'react-native';
import { Eye } from 'lucide-react-native';
import { metrics, radii, type, useTheme } from '../../theme';

// Amber "CLIENT" pill for client-facing channels (channels.isClientFacing).
// Amber, not red: danger means error/over-budget here, warning means caution.
// Mirrors the web's "Eye · Client" badge. Shared by the channel list row and
// the thread header so the two can't drift apart. Restored after the revamp
// swapped it for a muted eye that was too easy to miss.

const B = metrics.messages.clientBadge;

export function ClientBadge({ showIcon = true }: { showIcon?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.badge, { backgroundColor: theme.statusWarningBg }]}
      accessible
      accessibilityLabel="Client-facing channel, visible to the client"
    >
      {showIcon ? <Eye size={B.icon} color={theme.statusWarning} strokeWidth={metrics.iconStroke} /> : null}
      <Text style={[type.badgeLabel, { color: theme.statusWarning }]}>CLIENT</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: B.gap,
    paddingHorizontal: B.padX,
    paddingVertical: B.padY,
    borderRadius: radii.pill,
    // Never let a long channel name squeeze the pill into an ellipsis.
    flexShrink: 0,
  },
});
