import { useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '../../lib/useLayout';

/**
 * Photos on a site diary entry (SiteDiaryScreen + SiteDiaryListScreen only).
 *
 * Phone: the same horizontal strip of 100pt thumbnails as before, now tappable
 * to open the full-size viewer.
 * Wide (Duo unfolded): a wrapping grid of tappable thumbnails, 3 or 4 across depending on the room
 * the grid actually has — it may sit in the narrow right pane or a full-width
 * modal, so it measures itself rather than guessing from the screen width.
 *
 * Swapping strip ↔ grid on fold remounts only these stateless thumbnails;
 * the viewer's open/index state lives in the screen, not here.
 */
const GRID_GAP = 8;

export function DiaryPhotoGallery({
  uris,
  getUrl,
  onOpen,
  thumbStyle,
  scrollStyle,
}: {
  uris: string[];
  getUrl: (path: string) => string;
  onOpen: (index: number) => void;
  /** The phone thumbnail style (unchanged from before). */
  thumbStyle: StyleProp<ImageStyle>;
  scrollStyle?: StyleProp<ViewStyle>;
}) {
  const { isWide } = useLayout();
  const [gridWidth, setGridWidth] = useState(0);

  if (!isWide) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={scrollStyle}>
        {/* Phone: the same strip and thumbnail style as before; a tap opens
            the viewer. The screens render the phone copy of the viewer inside
            the entry's detail modal (iOS can't present a root modal over it).
            Only used on read-only detail views — the edit forms' thumbnails
            (with their remove buttons) are their own markup and unchanged.
            A horizontal drag still scrolls the strip; only a tap opens. */}
        {uris.map((uri, idx) => (
          <TouchableOpacity
            key={idx}
            activeOpacity={0.8}
            onPress={() => onOpen(idx)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Open photo ${idx + 1} of ${uris.length}`}
          >
            <Image source={{ uri: getUrl(uri) }} style={thumbStyle} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  const cols = gridWidth >= 520 ? 4 : 3;
  const tile = gridWidth > 0 ? Math.floor((gridWidth - GRID_GAP * (cols - 1)) / cols) : 100;
  return (
    <View style={[styles.grid, scrollStyle]} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
      {uris.map((uri, idx) => (
        <TouchableOpacity key={idx} activeOpacity={0.8} onPress={() => onOpen(idx)}>
          <Image source={{ uri: getUrl(uri) }} style={[styles.tile, { width: tile, height: tile }]} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Full-screen photo viewer: swipe between photos, pinch to zoom (iOS
 * ScrollView zoom — no extra library), close button. Same approach as the
 * selection photo viewer.
 *
 * The pager is keyed on the window width so a fold/unfold while it is open
 * re-lays the pages at the new width and lands back on the same photo
 * (contentOffset only applies on mount). Nothing else in it holds state.
 */
export function DiaryPhotoViewer({
  visible,
  uris,
  index,
  getUrl,
  onIndexChange,
  onClose,
}: {
  visible: boolean;
  uris: string[];
  index: number;
  getUrl: (path: string) => string;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const { width, height } = useLayout();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          key={width}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * width, y: 0 }}
          onMomentumScrollEnd={e => onIndexChange(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {uris.map((uri, idx) => (
            <ScrollView
              key={idx}
              style={{ width }}
              contentContainerStyle={styles.page}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              centerContent
            >
              <Image source={{ uri: getUrl(uri) }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
            </ScrollView>
          ))}
        </ScrollView>

        <TouchableOpacity
          onPress={onClose}
          hitSlop={12}
          style={[styles.close, { top: insets.top + 8 }]}
          accessibilityLabel="Close photo"
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        {uris.length > 1 && (
          <View style={[styles.count, { bottom: insets.bottom + 16 }]}>
            <Text style={styles.countText}>{index + 1} / {uris.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tile: { borderRadius: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  close: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  countText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
