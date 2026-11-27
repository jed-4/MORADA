import type { ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { metrics, size, tabular, type, useColors } from '../../theme';

interface ListRowProps {
  lead?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Status / qty / hours / date. A string renders 13 muted tabular. */
  trailing?: ReactNode;
  /** Draw a muted › at the far right. */
  chevron?: boolean;
  /** Done/complete: title goes muted. */
  done?: boolean;
  /** Checklist items: done also strikes through. */
  strike?: boolean;
  /** Default 2. Titles wrap; never one-line-ellipsis unless the spec says so. */
  titleLines?: number;
  titleStyle?: 'regular' | 'strong' | 'medium';
  selected?: boolean;
  /** Destructive action row (Delete): red title. */
  danger?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** The row inside a `Card variant="list"` (the card draws the dividers). */
export function ListRow({
  lead,
  title,
  subtitle,
  trailing,
  chevron,
  done,
  strike,
  titleLines = 2,
  titleStyle = 'regular',
  selected,
  danger,
  onPress,
  onLongPress,
  accessibilityLabel,
  style,
}: ListRowProps) {
  const c = useColors();
  const titleType = titleStyle === 'strong' ? type.rowTitleStrong : titleStyle === 'medium' ? type.rowTitleMedium : type.rowTitle;
  const body = (
    <>
      {lead ? <View>{lead}</View> : null}
      <View style={{ flex: 1, gap: metrics.listRow.bodyGap }}>
        <Text
          numberOfLines={titleLines}
          style={[
            titleType,
            { color: danger ? c.danger : done ? c.muted : c.text },
            done && strike ? { textDecorationLine: 'line-through' } : null,
          ]}
        >
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text numberOfLines={2} style={[type.caption, { color: c.muted }]}>
            {subtitle}
          </Text>
        ) : (
          subtitle ?? null
        )}
      </View>
      {typeof trailing === 'string' || typeof trailing === 'number' ? (
        <Text style={[type.meta, tabular, { color: c.muted }]}>{trailing}</Text>
      ) : (
        trailing ?? null
      )}
      {chevron ? <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
    </>
  );
  const rowStyle: StyleProp<ViewStyle> = [
    { flexDirection: 'row', alignItems: 'center', gap: metrics.listRow.gap, paddingVertical: metrics.listRow.padY },
    selected ? { backgroundColor: c.tint } : null,
    style,
  ];
  if (!onPress && !onLongPress) return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [rowStyle, pressed ? { opacity: metrics.pressedOpacity } : null]}
    >
      {body}
    </Pressable>
  );
}
