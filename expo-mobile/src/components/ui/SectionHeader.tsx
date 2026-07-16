import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';

// Uppercase section header row used above every dashboard/list section.
// Optional count badge, right accessory node, and onPress (adds a chevron
// and makes the whole row tappable — navigate to the full screen).

interface SectionHeaderProps {
  title: string;
  count?: number;
  right?: ReactNode;
  onPress?: () => void;
}

export function SectionHeader({ title, count, right, onPress }: SectionHeaderProps) {
  const theme = useTheme();

  const content = (
    <>
      <View style={styles.titleWrap}>
        <Text style={[styles.title, { color: theme.textSecondary }]}>{title}</Text>
        {count !== undefined && (
          <View style={[styles.countBadge, { backgroundColor: theme.subtle }]}>
            <Text style={[styles.countText, { color: theme.textSecondary }]}>{count}</Text>
          </View>
        )}
      </View>
      <View style={styles.right}>
        {right}
        {onPress && <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8} style={styles.row}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  countBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  countText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
