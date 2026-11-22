import { Pressable, StyleSheet, Text, View } from 'react-native';
import { metrics, radii, size, space, tabular, type, useColors } from '../../theme';
import CroppedImage from './CroppedImage';
import StatusPill from './StatusPill';
import { SmartImage } from '../kit';
import {
  firstImage,
  formatQuantity,
  getChosenOption,
  getSelectionState,
  isSettled,
  type Selection,
} from '../../lib/selections';

/**
 * One line of the spec sheet (revamp v1, inside a list Card).
 *
 * Title = the PRODUCT going in ("Avi Pop-Up Waste"); the muted line under it
 * names the slot, then brand and code ("Basin plug waste · ABI · 14275-LF").
 * Someone standing in the room already knows the slot — what they need is the
 * thing going into it.
 */
export default function SpecRow({
  selection,
  onPress,
  selected = false,
}: {
  selection: Selection;
  onPress: (selection: Selection) => void;
  /** Open in the right panel (Duo unfolded only). */
  selected?: boolean;
}) {
  const c = useColors();
  const state = getSelectionState(selection);
  const settled = isSettled(state);
  const chosen = settled ? getChosenOption(selection) : undefined;
  const image = firstImage(chosen);
  const quantity = formatQuantity(chosen);

  // Nothing decided yet: the row says so plainly instead of naming a product,
  // so nobody orders against a choice that isn't final.
  const productName = chosen?.name ?? (state === 'open' ? 'Not selected yet' : 'Not approved yet');
  const meta = [selection.name, chosen?.brand, chosen?.sku].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => onPress(selection)}
      accessibilityRole="button"
      accessibilityLabel={`${selection.name}: ${productName}`}
      style={({ pressed }) => [
        styles.row,
        selected && { backgroundColor: c.tint },
        pressed && { opacity: metrics.pressedOpacity },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: c.thumbFill, borderColor: c.hairline }]}>
        {image ? (
          <CroppedImage
            filePath={image.filePath}
            x={image.thumbnailX}
            y={image.thumbnailY}
            zoom={image.thumbnailZoom}
            style={styles.thumbImage}
          />
        ) : (
          <SmartImage uri={null} width="100%" height="100%" radius={0} />
        )}
      </View>

      <View style={styles.main}>
        <Text style={[type.rowTitle, { color: settled ? c.text : c.muted }]} numberOfLines={2}>
          {productName}
        </Text>
        {!!meta && (
          <Text style={[type.caption, { color: c.muted }]} numberOfLines={1}>
            {meta}
          </Text>
        )}
      </View>

      <View style={styles.trailing}>
        {!!quantity && <Text style={[type.meta, tabular, { color: c.muted }]}>{quantity}</Text>}
        <StatusPill state={state} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingVertical: metrics.selections.rowPadY },
  thumb: {
    width: size.thumb,
    height: size.thumb,
    borderRadius: radii.md,
    borderWidth: size.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImage: { width: '100%', height: '100%' },
  main: { flex: 1, minWidth: 0, gap: metrics.selections.rowBodyGap },
  trailing: { alignItems: 'flex-end', gap: metrics.selections.trailingGap },
});
