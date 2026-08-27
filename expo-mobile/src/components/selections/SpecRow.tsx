import { Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { getAuthedImageSource } from '../../services/api';
import { PressableScale } from '../ui/PressableScale';
import StatusPill from './StatusPill';
import {
  firstImage,
  formatQuantity,
  getChosenOption,
  getSelectionState,
  isSettled,
  specLine,
  type Selection,
} from '../../lib/selections';

/**
 * One line of the spec sheet.
 *
 * The layout inverts the web list on purpose: the small grey label on top is
 * the SLOT ("Splashback tiles") and the bold line is the PRODUCT ("Zellige
 * Lily"). Someone standing in the room already knows which slot they're
 * looking at — what they need is the thing going into it.
 */
export default function SpecRow({
  selection,
  onPress,
}: {
  selection: Selection;
  onPress: (selection: Selection) => void;
}) {
  const theme = useTheme();
  const state = getSelectionState(selection);
  const settled = isSettled(state);
  const chosen = settled ? getChosenOption(selection) : undefined;
  const image = firstImage(chosen);
  const spec = specLine(chosen);
  const quantity = formatQuantity(chosen);

  // Nothing decided yet: the row states that plainly instead of showing a
  // product, so nobody orders against a choice that isn't final.
  const productName = chosen?.name ?? (state === 'open' ? 'Not selected yet' : 'Not approved yet');
  const subtitle = spec || (settled ? '' : 'Don’t order — decision outstanding');

  return (
    <PressableScale
      onPress={() => onPress(selection)}
      style={[
        styles.row,
        {
          backgroundColor: settled ? theme.card : 'transparent',
          borderColor: settled ? theme.border : theme.borderStrong,
          borderStyle: settled ? 'solid' : 'dashed',
        },
      ]}
      accessibilityLabel={`${selection.name}: ${productName}`}
    >
      <View style={[styles.thumb, { backgroundColor: theme.subtle }]}>
        {image ? (
          <Image
            source={getAuthedImageSource(image.filePath)}
            style={styles.thumbImage}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name="image-outline" size={20} color={theme.textMuted} />
        )}
      </View>

      <View style={styles.main}>
        <Text style={[styles.slot, { color: theme.textMuted }]} numberOfLines={1}>
          {selection.name}
        </Text>
        <Text
          style={[styles.product, { color: settled ? theme.textPrimary : theme.textMuted }]}
          numberOfLines={2}
        >
          {productName}
        </Text>
        {!!subtitle && (
          <Text style={[styles.spec, { color: theme.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      <View style={styles.trailing}>
        {!!quantity && (
          <Text style={[styles.qty, { color: theme.textSecondary }]}>{quantity}</Text>
        )}
        <StatusPill state={state} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 10,
  },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  main: { flex: 1, minWidth: 0, gap: 1 },
  slot: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  product: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    lineHeight: 18,
  },
  spec: { fontSize: fontSize.xs },
  trailing: { alignItems: 'flex-end', gap: 5 },
  qty: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    fontVariant: ['tabular-nums'],
  },
});
