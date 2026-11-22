import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Copy } from 'lucide-react-native';
import { metrics, size, type, useColors } from '../../theme';

interface PropertyRowProps {
  label: string;
  /** Plain text value. Use `children` for a custom value (dot+word, avatar+name…). */
  value?: string | null;
  children?: ReactNode;
  /** Muted text shown when there is no value ("No due date", "Choose"). */
  placeholder?: string;
  /** Value rendered in `link` colour (email, phone, product code). */
  link?: boolean;
  /** Show a Copy icon after a link value. */
  onCopy?: () => void;
  labelWidth?: number;
  /** Add-defect style form row: 15 label, value muted, trailing ›. */
  form?: boolean;
  onPress?: () => void;
}

/** Notion-style label/value row inside a `Card variant="list"`. */
export function PropertyRow({ label, value, children, placeholder, link, onCopy, labelWidth = metrics.propertyRow.labelWidth, form, onPress }: PropertyRowProps) {
  const c = useColors();
  const hasValue = children != null || (value != null && value !== '');
  const valueNode =
    children ??
    (hasValue ? (
      <Text style={[form ? type.rowTitle : type.body, { color: link ? c.link : c.text }]}>{value}</Text>
    ) : placeholder ? (
      <Text style={[form ? type.rowTitle : type.body, { color: c.muted }]}>{placeholder}</Text>
    ) : null);

  const row = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.propertyRow.gap, paddingVertical: form ? metrics.propertyRow.formPadY : metrics.propertyRow.padY }}>
      <Text style={[form ? type.rowTitle : type.body, { color: form ? c.text : c.muted, width: form ? undefined : labelWidth, flex: form ? 1 : undefined }]}>
        {label}
      </Text>
      <View style={{ flex: form ? undefined : 1, flexDirection: 'row', alignItems: 'center', gap: metrics.propertyRow.gap, justifyContent: form ? 'flex-end' : 'flex-start' }}>
        {valueNode}
        {onCopy && hasValue ? (
          <Pressable onPress={onCopy} hitSlop={metrics.hitSlop} accessibilityLabel={`Copy ${label}`}>
            <Copy size={metrics.propertyRow.copyIcon} color={c.muted} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ) : null}
      </View>
      {form ? <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
    </View>
  );
  if (!onPress) return row;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => (pressed ? { opacity: metrics.pressedOpacity } : null)}>
      {row}
    </Pressable>
  );
}
