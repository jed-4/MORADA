import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { haptic } from '../../lib/haptics';

/** Height the bar takes above the keyboard / home indicator (for scroll padding). */
export const BOTTOM_ACTION_BAR_HEIGHT = 76;

/**
 * The form's main action (Save / Submit) pinned to the bottom, in thumb
 * reach. Render it as the LAST child of the screen's KeyboardAvoidingView,
 * after the ScrollView: the KAV then lifts it above the keyboard, and with the
 * keyboard down it clears the home indicator.
 *
 * Its width follows the screen; the button is capped so it doesn't stretch
 * across the unfolded Duo. Nothing here holds state, so a fold changes styles only.
 */
export function BottomActionBar({
  label,
  busyLabel,
  onPress,
  busy,
  disabled,
  icon = 'checkmark-circle-outline',
}: {
  label: string;
  busyLabel?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setKeyboardUp(true));
    const b = Keyboard.addListener(hideEvt, () => setKeyboardUp(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  const off = busy || disabled;
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          // Over the keyboard there's no home indicator to clear.
          paddingBottom: keyboardUp ? 10 : Math.max(insets.bottom, 12),
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: theme.primary }, off && styles.btnOff]}
        onPress={() => { haptic.light(); onPress(); }}
        disabled={off}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!off, busy: !!busy }}
      >
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name={icon} size={20} color="#fff" />}
        <Text style={styles.btnText}>{busy ? busyLabel || label : label}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    alignItems: 'center',
  },
  btn: {
    width: '100%',
    maxWidth: 560,
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnOff: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
