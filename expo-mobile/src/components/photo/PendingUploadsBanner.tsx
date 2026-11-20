import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { usePendingUploads, type QueuedAction } from '../../services/offlineQueue';
import { haptic } from '../../lib/haptics';

// "2 receipts waiting to send" strip for the top of a screen. Renders nothing
// when the offline queue holds no matching uploads.
//
//   <PendingUploadsBanner projectId={projectId} types={['create-receipt']} noun="receipt" />

interface PendingUploadsBannerProps {
  projectId?: string;
  types?: QueuedAction['type'][];
  /** Singular noun for the count, e.g. "receipt". Default "upload". */
  noun?: string;
  style?: StyleProp<ViewStyle>;
}

export function PendingUploadsBanner({ projectId, types, noun = 'upload', style }: PendingUploadsBannerProps) {
  const theme = useTheme();
  const { waiting, failed, sending, retry } = usePendingUploads({ projectId, types });
  if (!waiting && !failed) return null;

  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`;
  const isFailed = failed > 0;
  const tint = isFailed ? theme.statusDanger : theme.statusWarning;
  const bg = isFailed ? theme.statusDangerBg : theme.statusWarningBg;
  const parts: string[] = [];
  if (waiting) parts.push(`${plural(waiting)} ${sending ? 'sending…' : 'waiting to send'}`);
  if (failed) parts.push(`${plural(failed)} couldn't send`);

  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: tint + '40' }, style]}>
      {sending ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Ionicons name={isFailed ? 'alert-circle-outline' : 'cloud-offline-outline'} size={18} color={tint} />
      )}
      <Text style={[styles.text, { color: tint }]}>{parts.join(' · ')}</Text>
      {!sending && (
        <TouchableOpacity
          onPress={() => { haptic.light(); retry().catch(() => {}); }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isFailed ? 'Retry sending' : 'Send now'}
        >
          <Text style={[styles.action, { color: theme.primary }]}>{isFailed ? 'Retry' : 'Send now'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '500' },
  action: { fontSize: 13, fontWeight: '700' },
});
