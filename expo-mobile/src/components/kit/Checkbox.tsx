import { Pressable, View } from 'react-native';
import { Check, Circle, CircleCheck } from 'lucide-react-native';
import { metrics, radii, size, useColors } from '../../theme';

interface CheckboxProps {
  checked: boolean;
  onPress?: () => void;
  /** Round task checkbox (Tasks, Workspace, Project detail). */
  round?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Soft square 18 (or a round task circle). Hit area ≥ 44dp. */
export function Checkbox({ checked, onPress, round, disabled, accessibilityLabel }: CheckboxProps) {
  const c = useColors();
  const slop = (metrics.minHit - size.checkbox) / 2;
  const box = round ? (
    checked ? (
      <CircleCheck size={size.taskCircle} color={c.accent} strokeWidth={metrics.iconStroke} />
    ) : (
      <Circle size={size.taskCircle} color={c.faint} strokeWidth={metrics.iconStroke} />
    )
  ) : (
    <View
      style={{
        width: size.checkbox,
        height: size.checkbox,
        borderRadius: radii.sm,
        borderWidth: checked ? 0 : metrics.checkbox.borderWidth,
        borderColor: c.placeholderLarge,
        backgroundColor: checked ? c.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Check size={metrics.checkbox.check} color={c.onAccent} strokeWidth={metrics.checkStroke} /> : null}
    </View>
  );
  if (!onPress) return box;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={slop}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      style={{ opacity: disabled ? metrics.disabledOpacity : 1 }}
    >
      {box}
    </Pressable>
  );
}
