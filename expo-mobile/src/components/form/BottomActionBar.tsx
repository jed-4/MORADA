import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, radii, size, space, type, useColors } from '../../theme';
import { SHEET_MAX_WIDTH } from '../ui/Sheet';
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
}: {
  label: string;
  busyLabel?: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** Kept for callers; the revamp button is text only (one accent button). */
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const c = useColors();
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
          backgroundColor: c.bg,
          borderTopColor: c.border,
          // Over the keyboard there's no home indicator to clear.
          paddingBottom: keyboardUp ? metrics.actionBar.padY : Math.max(insets.bottom, metrics.actionBar.padY),
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: disabled ? c.accentDisabled : c.accent, opacity: busy ? metrics.solidPressedOpacity : pressed ? metrics.solidPressedOpacity : 1 },
        ]}
        onPress={() => { haptic.light(); onPress(); }}
        disabled={off}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!off, busy: !!busy }}
      >
        {busy ? <ActivityIndicator color={c.onAccent} size="small" /> : null}
        <Text style={[type.rowTitleMedium, { color: c.onAccent }]}>{busy ? busyLabel || label : label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: size.border,
    paddingHorizontal: space.screenX,
    paddingTop: metrics.actionBar.padY,
    alignItems: 'center',
  },
  btn: {
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    minHeight: metrics.actionBar.primaryHeight + space.inline,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.inline,
  },
});
