import { Image, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { UploadProgress } from '../photo/UploadProgress';
import type { PhotoUploadItem } from '../../lib/photosUpload';

/** Edge of a photo thumbnail in the diary entry form (also the "Add" tile). */
export const DIARY_FORM_THUMB = 104;

/**
 * One photo in the diary entry form: the thumbnail, its upload state
 * (progress ring, Retry, "Waiting to send", tick), a Mark up button for
 * photos still on this device and the remove button.
 *
 * Stateless — the upload state comes from useDiaryPhotos, so nothing is lost
 * when the form re-lays out on a fold.
 */
export function DiaryFormPhoto({
  imageUri,
  item,
  onRemove,
  onMarkup,
  onRetry,
  busy,
  dangerColor,
  index,
}: {
  /** Resolved URI to display (local file or server URL). */
  imageUri: string;
  /** Upload state, for a local photo being tracked. */
  item?: PhotoUploadItem;
  onRemove: () => void;
  /** Omit to hide Mark up (server photo, or a build without the editor). */
  onMarkup?: () => void;
  onRetry: () => void;
  /** Saving: hide the edit buttons so a photo can't change mid-upload. */
  busy?: boolean;
  dangerColor: string;
  index: number;
}) {
  const uploading = item?.status === 'uploading';
  const locked = busy || uploading;
  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        <Image source={{ uri: imageUri }} style={styles.image} />
        {item && (
          <UploadProgress
            status={item.status}
            progress={item.progress}
            size={34}
            onRetry={busy ? undefined : onRetry}
            style={item.status === 'queued' ? styles.queuedChip : undefined}
          />
        )}
        {onMarkup && !locked && item?.status !== 'failed' && (
          <TouchableOpacity
            style={styles.markupBtn}
            onPress={onMarkup}
            hitSlop={6}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Mark up photo ${index + 1}`}
          >
            <Ionicons name="brush-outline" size={15} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
      {!locked && (
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove photo ${index + 1}`}
        >
          <Ionicons name="close-circle" size={24} color={dangerColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginRight: 10, position: 'relative', paddingTop: 6 },
  frame: {
    width: DIARY_FORM_THUMB,
    height: DIARY_FORM_THUMB,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  // The chip is wider than a thumbnail: let it wrap inside the photo.
  queuedChip: { left: 4, right: 4, bottom: 4 },
  markupBtn: {
    position: 'absolute',
    left: 6,
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  removeBtn: { position: 'absolute', top: 0, right: -6 },
});
