import { forwardRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import type { LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';

// Form pieces for pop-ups and forms (Phase 4). Same language as Add defect:
// plain fields on `bg`, white cards for choices, one accent button, and no
// filled or outlined red buttons — destructive actions are plain red text.

const F = metrics.form;

/** Sheet content frame: 16 side padding, 14 gap (COMPONENTS §24). */
export function SheetBody({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: metrics.sheet.padX, gap: metrics.sheet.gap }, style]}>{children}</View>;
}

/** Small muted label above a field or a group of rows. */
export function FieldLabel({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[type.meta, { color: c.muted }]}>{children}</Text>;
}

/** Helper / hint line under a field. */
export function FieldHint({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'warning' | 'danger' }) {
  const c = useColors();
  const color = tone === 'danger' ? c.danger : tone === 'warning' ? c.status.pendingText : c.muted;
  return <Text style={[type.caption, { color }]}>{children}</Text>;
}

type TextFieldProps = TextInputProps & {
  /** Inside a bottom sheet the keyboard handling needs the sheet's own input. */
  inSheet?: boolean;
  /** Taller box for notes / descriptions. */
  multilineBox?: boolean;
};

/** White field with a 1dp border. `inSheet` swaps in the bottom-sheet input. */
// `any` ref: RN 0.88's TextInput instance type and the sheet input's don't line up.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TextField = forwardRef<any, TextFieldProps>(function TextField(
  { inSheet, multilineBox, style, placeholderTextColor, ...rest },
  ref,
) {
  const c = useColors();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Input: any = inSheet ? BottomSheetTextInput : TextInput;
  return (
    <Input
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? c.faint}
      multiline={multilineBox || rest.multiline}
      textAlignVertical={multilineBox ? 'top' : rest.textAlignVertical}
      style={[
        type.rowTitle,
        {
          color: c.text,
          backgroundColor: c.surface,
          borderWidth: size.border,
          borderColor: c.border,
          borderRadius: radii.lg,
          paddingHorizontal: F.inputPadX,
          paddingTop: F.inputPadY,
          paddingBottom: F.inputPadY,
          minHeight: multilineBox ? F.multilineHeight : F.inputHeight,
        },
        style,
      ]}
      {...rest}
    />
  );
});

/** One accent button. Full width unless `inline`. */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Glyph,
  inline,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  inline?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({
        flex: inline ? undefined : 1,
        alignSelf: inline ? 'flex-start' : undefined,
        minHeight: metrics.actionBar.primaryHeight,
        paddingHorizontal: metrics.actionBar.padX,
        borderRadius: radii.lg,
        backgroundColor: disabled ? c.accentDisabled : c.accent,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: metrics.inlineGap,
        opacity: pressed ? metrics.solidPressedOpacity : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.onAccent} />
      ) : (
        <>
          {Glyph ? <Glyph size={metrics.actionBar.icon} color={c.onAccent} strokeWidth={metrics.iconStrokeActive} /> : null}
          <Text style={[type.rowTitleMedium, { color: c.onAccent }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** White button with a border and accent label (Cancel, secondary actions). */
export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  icon: Glyph,
  inline,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  inline?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => ({
        flex: inline ? undefined : 1,
        alignSelf: inline ? 'flex-start' : undefined,
        minHeight: metrics.actionBar.primaryHeight,
        paddingHorizontal: metrics.actionBar.padX,
        borderRadius: radii.lg,
        backgroundColor: c.surface,
        borderWidth: size.border,
        borderColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: metrics.inlineGap,
        opacity: off ? metrics.disabledOpacity : pressed ? metrics.pressedOpacity : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={c.accent} />
      ) : (
        <>
          {Glyph ? <Glyph size={metrics.actionBar.icon} color={c.accent} strokeWidth={metrics.iconStroke} /> : null}
          <Text style={[type.body, { color: c.accent }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Plain text action (Delete, Remove, Clear). Red only for destructive. */
export function TextButton({
  label,
  onPress,
  tone = 'accent',
  disabled,
  icon: Glyph,
  center,
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent' | 'muted' | 'danger';
  disabled?: boolean;
  icon?: LucideIcon;
  center?: boolean;
}) {
  const c = useColors();
  const color = tone === 'danger' ? c.danger : tone === 'muted' ? c.muted : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={metrics.hitSlop}
      accessibilityRole="button"
      style={({ pressed }) => ({
        minHeight: metrics.minHit,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
        gap: metrics.inlineGap,
        opacity: disabled ? metrics.disabledOpacity : pressed ? metrics.pressedOpacity : 1,
      })}
    >
      {Glyph ? <Glyph size={size.icon.row} color={color} strokeWidth={metrics.iconStroke} /> : null}
      <Text style={[type.body, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Two buttons side by side (Cancel · Save) for a sheet footer or form foot. */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', gap: metrics.actionBar.gap }}>{children}</View>;
}

/** Label + optional helper with a theme-coloured switch on the right. */
export function ToggleRow({
  label,
  helper,
  value,
  onValueChange,
  icon: Glyph,
  disabled,
}: {
  label: string;
  helper?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.listRow.gap, paddingVertical: metrics.listRow.padY }}>
      {Glyph ? <Glyph size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} /> : null}
      <View style={{ flex: 1, gap: metrics.listRow.bodyGap }}>
        <Text style={[type.rowTitle, { color: c.text }]}>{label}</Text>
        {helper ? <Text style={[type.meta, { color: c.muted }]}>{helper}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: c.track, true: c.accent }}
        thumbColor={c.surface}
        ios_backgroundColor={c.track}
        accessibilityLabel={label}
      />
    </View>
  );
}
