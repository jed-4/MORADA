import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getAuthedImageSource } from '../../services/api';

/**
 * A selection photo cropped the way the office set it up on the web: a focal
 * point (thumbnailX / thumbnailY, 0–100) and a zoom (thumbnailZoom, percent of
 * "cover" — 100 fills the frame, below shows more of the photo, above crops
 * in). Same maths as the web's CroppedImage, so a thumbnail looks the same on
 * the phone as it does on the desk.
 *
 * React Native's `resizeMode="cover"` always centres, so the image is laid out
 * by hand once its size and the frame's are known. Until then it shows as a
 * plain centred cover, which is also what an un-cropped photo looks like.
 */
export default function CroppedImage({
  filePath,
  x,
  y,
  zoom,
  style,
}: {
  filePath: string;
  x?: number | null;
  y?: number | null;
  zoom?: number | null;
  style?: StyleProp<ViewStyle>;
}) {
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const fx = x ?? 50;
  const fy = y ?? 50;
  const fz = (zoom ?? 100) / 100;
  const untouched = fx === 50 && fy === 50 && fz === 1;
  const source = getAuthedImageSource(filePath);

  let placed: { left: number; top: number; width: number; height: number } | null = null;
  if (!untouched && frame && natural && natural.w > 0 && natural.h > 0) {
    const scale = Math.max(frame.w / natural.w, frame.h / natural.h) * fz;
    const width = natural.w * scale;
    const height = natural.h * scale;
    placed = {
      width,
      height,
      left: (frame.w - width) * (fx / 100),
      top: (frame.h - height) * (fy / 100),
    };
  }

  return (
    <View
      style={[styles.frame, fz < 1 && styles.letterbox, style]}
      onLayout={(e) => setFrame({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Image
        source={source}
        resizeMode={placed ? 'stretch' : 'cover'}
        style={placed ? [styles.placed, placed] : StyleSheet.absoluteFill}
        onLoad={(e) => {
          const src = e.nativeEvent?.source;
          if (src?.width && src?.height) setNatural({ w: src.width, h: src.height });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  letterbox: { backgroundColor: '#FFFFFF' },
  placed: { position: 'absolute' },
});
