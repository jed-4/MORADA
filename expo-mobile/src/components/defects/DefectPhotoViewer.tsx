import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuthedImageSource } from '../../services/api';
import type { DefectAttachment } from '../../lib/defects';

const KIND_LABEL = { before: 'Before', after: 'After', trade: 'From trade' } as const;

/** Full-screen swipeable photo viewer. Open while `index` is non-null. */
export function DefectPhotoViewer({
  photos,
  index,
  onClose,
}: {
  photos: DefectAttachment[];
  index: number | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(index ?? 0);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (index == null) return;
    setPage(index);
    // Wait a frame for the modal's ScrollView to lay out.
    const t = setTimeout(() => scroll.current?.scrollTo({ x: index * width, animated: false }), 0);
    return () => clearTimeout(t);
  }, [index, width]);

  const current = photos[page];

  return (
    <Modal
      visible={index != null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View style={styles.backdrop}>
        <ScrollView
          ref={scroll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {photos.map((p, i) => (
            <Pressable key={`${p.url}-${i}`} onPress={onClose} style={{ width, height }}>
              <Image source={getAuthedImageSource(p.url)} style={{ width, height }} resizeMode="contain" />
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { top: insets.top + 8 }]}
          accessibilityRole="button"
          accessibilityLabel="Close photo"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {current ? (
          <View style={[styles.caption, { bottom: insets.bottom + 16 }]}>
            <Text style={styles.captionText}>
              {KIND_LABEL[current.kind ?? 'before']} · {page + 1} of {photos.length}
            </Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  close: {
    position: 'absolute',
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  caption: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  captionText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
