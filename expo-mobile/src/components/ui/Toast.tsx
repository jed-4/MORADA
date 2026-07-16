import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import Animated, { FadeOutDown, SlideInDown, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, lightTheme, darkTheme, fontSize, fontWeight, radius } from '../../theme';
import { haptic } from '../../lib/haptics';

// Toast system — replaces Alert.alert for non-blocking feedback.
//
//   const toast = useToast();
//   toast.success('Task completed');
//   toast.error(e.message);
//   toast.show({ message: 'Task deleted', action: { label: 'Undo', onPress: restore } });
//
// Rules of use: system Alert is ONLY for irreversible destructive confirms.
// Successes, errors, and reversible actions (with an Undo action) go here.

type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** Optional action button (e.g. Undo). Extends visible duration to 6s. */
  action?: { label: string; onPress: () => void };
  /** Override auto-dismiss in ms. */
  durationMs?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, 'message'>> {
  id: number;
  variant: ToastVariant;
  action?: { label: string; onPress: () => void };
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const theme = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId++;
      const item: ToastItem = {
        id,
        message: opts.message,
        variant: opts.variant || 'info',
        action: opts.action,
      };
      if (item.variant === 'error') haptic.error();
      // Keep at most 3 visible; drop the oldest.
      setToasts((prev) => [...prev.slice(-2), item]);
      const duration = opts.durationMs ?? (opts.action ? 6000 : 3500);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show({ message, variant: 'success' }),
      error: (message) => show({ message, variant: 'error' }),
      info: (message) => show({ message, variant: 'info' }),
    }),
    [show],
  );

  // The toast surface is inverted (bg = textPrimary: near-black in light mode,
  // near-white in dark), so its status icons need the OPPOSITE theme's tokens
  // to stay legible — the current theme's would sit on a same-value ground.
  const inverse = scheme === 'dark' ? lightTheme : darkTheme;
  const variantColor: Record<ToastVariant, string> = {
    success: inverse.statusSuccess,
    error: inverse.statusDanger,
    info: theme.background,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toasts.length > 0 && (
        <View
          pointerEvents="box-none"
          style={[styles.host, { bottom: insets.bottom + 84 }]}
        >
          {toasts.map((t) => (
            <Animated.View
              key={t.id}
              entering={SlideInDown.springify().damping(18)}
              exiting={FadeOutDown.duration(150)}
              layout={LinearTransition.springify().damping(18)}
              style={[
                styles.toast,
                {
                  backgroundColor: theme.textPrimary,
                  shadowColor: '#000',
                },
              ]}
            >
              <Ionicons
                name={ICONS[t.variant]}
                size={18}
                color={t.variant === 'info' ? theme.background : variantColor[t.variant]}
                style={t.variant !== 'info' && { opacity: 0.95 }}
              />
              <Text numberOfLines={2} style={[styles.message, { color: theme.background }]}>
                {t.message}
              </Text>
              {t.action && (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    dismiss(t.id);
                    haptic.light();
                    t.action!.onPress();
                  }}
                >
                  <Text style={[styles.action, { color: theme.lavender }]}>{t.action.label}</Text>
                </Pressable>
              )}
              <Pressable hitSlop={8} onPress={() => dismiss(t.id)}>
                <Ionicons name="close" size={16} color={theme.background} style={{ opacity: 0.6 }} />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 16,
    right: 16,
    gap: 8,
    alignItems: 'stretch',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.xl,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  message: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 19,
  },
  action: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    paddingHorizontal: 4,
  },
});
