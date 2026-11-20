import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme';
import { ProgressRing } from '../ui/ProgressRing';
import type { PhotoUploadStatus } from '../../lib/photosUpload';

// Upload state for one photo.
//
//   variant="overlay" (default): lay it over a thumbnail — the parent must be
//     position:relative with overflow hidden. Uploading dims the photo under
//     a ring + %, failed shows Retry, queued shows a "Waiting to send" chip,
//     done shows a small tick. Idle renders nothing.
//   variant="inline": a one-line row (ring + label) for lists.
//
// Pair it with usePhotoUploads() (src/lib/photosUpload.ts), whose items carry
// `status` and `progress`.

interface UploadProgressProps {
  status: PhotoUploadStatus;
  /** 0..1 */
  progress?: number;
  /** Shown on 'failed'. Omit to show the failure without a button. */
  onRetry?: () => void;
  variant?: 'overlay' | 'inline';
  /** Ring diameter. Default 40 (overlay) / 18 (inline). */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const SCRIM = 'rgba(0,0,0,0.45)';

export function UploadProgress({
  status,
  progress = 0,
  onRetry,
  variant = 'overlay',
  size,
  style,
}: UploadProgressProps) {
  const theme = useTheme();
  if (status === 'idle') return null;
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  if (variant === 'inline') {
    const ring = size ?? 18;
    return (
      <View style={[styles.inline, style]}>
        {status === 'uploading' && (
          <>
            <ProgressRing size={ring} strokeWidth={2.5} progress={progress} color={theme.primary} />
            <Text style={[styles.inlineText, { color: theme.textSecondary }]}>Uploading {pct}%</Text>
          </>
        )}
        {status === 'done' && (
          <>
            <Ionicons name="checkmark-circle" size={ring} color={theme.statusSuccess} />
            <Text style={[styles.inlineText, { color: theme.statusSuccess }]}>Uploaded</Text>
          </>
        )}
        {status === 'queued' && (
          <>
            <Ionicons name="cloud-offline-outline" size={ring} color={theme.statusWarning} />
            <Text style={[styles.inlineText, { color: theme.statusWarning }]}>Waiting to send</Text>
          </>
        )}
        {status === 'failed' && (
          <>
            <Ionicons name="alert-circle" size={ring} color={theme.statusDanger} />
            <Text style={[styles.inlineText, { color: theme.statusDanger }]}>Upload failed</Text>
            {onRetry && (
              <TouchableOpacity onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry upload">
                <Text style={[styles.inlineRetry, { color: theme.primary }]}>Retry</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    );
  }

  const ring = size ?? 40;

  if (status === 'done') {
    return (
      <View pointerEvents="none" style={[styles.cornerBadge, { backgroundColor: theme.statusSuccessSolid }, style]}>
        <Ionicons name="checkmark" size={14} color="#fff" />
      </View>
    );
  }

  if (status === 'queued') {
    return (
      <View pointerEvents="none" style={[styles.chip, style]}>
        <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
        <Text style={styles.chipText}>Waiting to send</Text>
      </View>
    );
  }

  if (status === 'uploading') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, style]}
        accessibilityLabel={`Uploading, ${pct} percent`}
      >
        <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
          <View style={StyleSheet.absoluteFill}>
            <ProgressRing size={ring} strokeWidth={4} progress={progress} color="#fff" trackColor="rgba(255,255,255,0.3)" />
          </View>
          <Text style={[styles.pct, { fontSize: ring >= 36 ? 11 : 9 }]}>{pct}%</Text>
        </View>
      </View>
    );
  }

  // failed
  return (
    <View style={[StyleSheet.absoluteFill, styles.scrim, style]}>
      <Ionicons name="alert-circle" size={26} color="#fff" />
      <Text style={styles.failedText}>Upload failed</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.retryBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Retry upload"
        >
          <Ionicons name="refresh" size={14} color={theme.textPrimary} />
          <Text style={[styles.retryText, { color: theme.textPrimary }]}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineText: { fontSize: 12, fontWeight: '500' },
  inlineRetry: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  scrim: { backgroundColor: SCRIM, alignItems: 'center', justifyContent: 'center', gap: 6 },
  pct: { color: '#fff', fontWeight: '700' },
  failedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2,
  },
  retryText: { fontSize: 12, fontWeight: '700' },
  cornerBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SCRIM,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
