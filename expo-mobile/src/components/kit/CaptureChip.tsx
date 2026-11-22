import { Pressable, Text } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';

type ChipVariant = 'workspace' | 'sheet' | 'duo';

/** Quick-capture / create chip: Workspace (85×40), More sheet (114×34), Duo tile (99×76). */
export function CaptureChip({ icon: Glyph, label, onPress, variant = 'workspace' }: { icon: LucideIcon; label: string; onPress: () => void; variant?: ChipVariant }) {
  const c = useColors();
  const m = metrics.captureChip[variant];
  const duo = variant === 'duo';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: m.width,
        minHeight: m.height,
        borderRadius: variant === 'sheet' ? radii.lg : radii.card,
        backgroundColor: duo ? c.surface : c.tint,
        borderWidth: duo ? size.border : 0,
        borderColor: c.border,
        flexDirection: duo ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: m.gap,
        paddingVertical: variant === 'sheet' ? metrics.captureChip.sheet.padY : 0,
        paddingHorizontal: variant === 'sheet' ? metrics.captureChip.sheet.padX : 0,
        opacity: pressed ? metrics.pressedOpacity : 1,
      })}
    >
      <Glyph size={m.icon} color={duo ? c.icon : c.link} strokeWidth={metrics.iconStroke} />
      <Text numberOfLines={1} style={[variant === 'workspace' ? type.metaSemi : duo ? type.caption : type.meta, { color: duo ? c.text : c.link }]}>
        {label}
      </Text>
    </Pressable>
  );
}
