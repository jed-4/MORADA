import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';

/** Selection detail: one full-width secondary button on `bg` ("Post to project chat"). */
export function SecondaryActionBar({ icon: Glyph, label, onPress, disabled }: { icon?: LucideIcon; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const m = metrics.actionBar;
  return (
    <View style={{ backgroundColor: c.bg, borderTopWidth: size.border, borderTopColor: c.border, paddingTop: m.padY, paddingHorizontal: m.padX, paddingBottom: Math.max(m.padY, insets.bottom) }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        style={({ pressed }) => ({
          minHeight: m.buttonHeight,
          borderRadius: radii.lg,
          backgroundColor: c.surface,
          borderWidth: size.border,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: metrics.inlineGap,
          opacity: disabled ? metrics.disabledOpacity : pressed ? metrics.pressedOpacity : 1,
        })}
      >
        {Glyph ? <Glyph size={m.icon} color={c.accent} strokeWidth={metrics.iconStroke} /> : null}
        <Text style={[type.body, { color: c.accent }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

/** Add-defect style: plain "Done" + primary "Save & next →". */
export function SaveActionBar({
  onDone,
  doneLabel = 'Done',
  onPrimary,
  primaryLabel,
  primaryDisabled,
  primaryArrow = true,
}: {
  onDone?: () => void;
  doneLabel?: string;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryArrow?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const m = metrics.actionBar;
  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderTopWidth: size.border,
        borderTopColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.gap,
        paddingTop: m.padY,
        paddingLeft: m.savePadLeft,
        paddingRight: m.padX,
        paddingBottom: Math.max(m.padY, insets.bottom),
      }}
    >
      {onDone ? (
        <Pressable onPress={onDone} hitSlop={metrics.hitSlop} accessibilityRole="button">
          <Text style={[type.rowTitle, { color: c.text }]}>{doneLabel}</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={onPrimary}
        disabled={primaryDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryDisabled }}
        style={({ pressed }) => ({
          minWidth: m.primaryWidth,
          minHeight: m.primaryHeight,
          borderRadius: radii.lg,
          backgroundColor: primaryDisabled ? c.accentDisabled : c.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: metrics.inlineGap,
          paddingHorizontal: m.padX,
          opacity: pressed ? metrics.solidPressedOpacity : 1,
        })}
      >
        <Text style={[type.rowTitle, { color: c.onAccent }]}>{primaryLabel}</Text>
        {primaryArrow ? <ArrowRight size={m.icon} color={c.onAccent} strokeWidth={metrics.iconStrokeActive} /> : null}
      </Pressable>
    </View>
  );
}
