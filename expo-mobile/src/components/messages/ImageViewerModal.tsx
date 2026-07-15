import { Modal, StyleSheet, View, Image, Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuthedImageSource } from '../../services/api';
import type { MessageAttachment } from './types';

// Simple full-screen image viewer for message attachments — tap anywhere (or
// the close button) to dismiss. Pinch-zoom intentionally out of scope.

export function ImageViewerModal({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!attachment} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {attachment && (
          <Image
            source={getAuthedImageSource(attachment.fileUrl)}
            style={styles.image}
            resizeMode="contain"
          />
        )}
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeBtn, { top: insets.top + 12 }]}
        >
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
        {attachment?.fileName ? (
          <View style={[styles.caption, { bottom: insets.bottom + 16 }]}>
            <Text style={styles.captionText} numberOfLines={1}>
              {attachment.fileName}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { position: 'absolute', paddingHorizontal: 24 },
  captionText: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
});
