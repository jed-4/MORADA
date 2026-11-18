import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { goBackOrHome } from '../../navigation/back';
import { useTheme } from '../../theme';

/**
 * Back chevron for screens with their own header. 44pt target (gloves), and
 * goBackOrHome so it still works when the screen is the first route of its
 * stack (opened from More, a dashboard card or a notification).
 */
export default function BackButton({
  color,
  onPress,
  style,
}: {
  color?: string;
  /** Override (e.g. to run a dirty-guard first). Defaults to goBackOrHome. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const navigation = useNavigation<any>();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress ?? (() => goBackOrHome(navigation))}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Back"
      style={({ pressed }) => [styles.btn, pressed && { opacity: 0.5 }, style]}
    >
      <Ionicons name="chevron-back" size={26} color={color ?? theme.textPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 44,
    height: 44,
    marginLeft: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
