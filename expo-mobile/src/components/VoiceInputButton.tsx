import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { haptic } from '../lib/haptics';
import { appendDictation, claimSpeech, ownsSpeech, releaseSpeech, speechBusyElsewhere, speechModule } from '../lib/speech';

/**
 * Mic button for a text field (#56). Tap to start / tap to stop, or hold to
 * talk and let go to stop. The words are transcribed ON THE PHONE (Apple's
 * speech recogniser, on-device where the phone supports it) and appended to
 * the field as you speak. No audio is stored.
 *
 * Controlled like the field it sits next to: pass the same `value` and
 * `onChangeText` the TextInput has. Text typed while listening is kept — the
 * dictation is joined onto whatever the field held when the mic started.
 *
 * On a binary without the speech module (older build, Expo Go) the button
 * explains the keyboard's own dictation mic instead.
 */
export function VoiceInputButton({
  value,
  onChangeText,
  label = 'Dictate',
  compact = false,
  style,
}: {
  value: string;
  onChangeText: (next: string) => void;
  /** Accessibility label, e.g. "Dictate notes". */
  label?: string;
  /** Icon only (no "Listening…" text) — for tight spots. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const [listening, setListening] = useState(false);
  const owner = useRef(Symbol('voice-input')).current;
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChangeText);
  onChangeRef.current = onChangeText;
  const baseRef = useRef('');
  const holdRef = useRef(false);
  // Set by our session's 'start' event: an 'end' from a session we aborted
  // (another field's) must not switch this one off.
  const startedRef = useRef(false);
  const subsRef = useRef<Array<{ remove: () => void }>>([]);

  const cleanup = useCallback(() => {
    subsRef.current.forEach(s => s.remove());
    subsRef.current = [];
    releaseSpeech(owner);
    setListening(false);
  }, [owner]);

  const stop = useCallback(() => {
    const mod = speechModule();
    if (mod && ownsSpeech(owner)) {
      try { mod.stop(); } catch { cleanup(); }
    } else {
      cleanup();
    }
  }, [owner, cleanup]);

  // Leaving the screen mid-sentence: stop listening.
  useEffect(() => () => {
    if (ownsSpeech(owner)) {
      try { speechModule()?.abort(); } catch { /* already stopped */ }
    }
    subsRef.current.forEach(s => s.remove());
    releaseSpeech(owner);
  }, [owner]);

  const start = useCallback(async (viaHold = false) => {
    const mod = speechModule();
    if (!mod) {
      Alert.alert(
        'Dictate with the keyboard',
        'Tap in the box, then tap the 🎤 on the keyboard and speak. (Morada\'s own mic needs the latest version of the app.)',
      );
      return;
    }
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Microphone access needed',
          'Allow Microphone and Speech Recognition for Morada in Settings to dictate notes.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
          ],
        );
        return;
      }
      // Held, but let go while the permission prompt was up: don't start.
      if (viaHold && !holdRef.current) return;
      if (!mod.isRecognitionAvailable()) {
        Alert.alert('Dictation unavailable', "Speech recognition isn't available on this phone right now. You can use the 🎤 on the keyboard.");
        return;
      }

      // Another field's mic is on: stop it first (one recogniser at a time).
      if (speechBusyElsewhere(owner)) {
        try { mod.abort(); } catch { /* already stopped */ }
      }
      claimSpeech(owner, cleanup);
      baseRef.current = valueRef.current;
      startedRef.current = false;
      subsRef.current = [
        mod.addListener('start', () => {
          if (ownsSpeech(owner)) startedRef.current = true;
        }),
        mod.addListener('result', (e) => {
          if (!ownsSpeech(owner)) return;
          const spoken = e.results?.[0]?.transcript ?? '';
          const next = appendDictation(baseRef.current, spoken);
          onChangeRef.current(next);
          // A finished phrase becomes the new base, so the next phrase adds on.
          if (e.isFinal) baseRef.current = next;
        }),
        mod.addListener('error', (e) => {
          if (!ownsSpeech(owner)) return;
          if (e.error !== 'aborted' && e.error !== 'no-speech') {
            haptic.error();
            console.warn('Dictation error:', e.error, e.message);
          }
          // Failed before it began (no 'end' will follow for us): reset.
          if (!startedRef.current && e.error !== 'aborted') cleanup();
        }),
        mod.addListener('end', () => {
          if (!ownsSpeech(owner) || !startedRef.current) return;
          haptic.light();
          cleanup();
        }),
      ];

      setListening(true);
      haptic.medium();
      mod.start({
        lang: 'en-AU',
        interimResults: true,
        continuous: true,
        addsPunctuation: true,
        // On the phone where it can be (no audio leaves the device).
        requiresOnDeviceRecognition: mod.supportsOnDeviceRecognition(),
        iosTaskHint: 'dictation',
      });
    } catch (e) {
      console.warn('Dictation failed to start:', e);
      haptic.error();
      cleanup();
    }
  }, [owner, cleanup]);

  const onPress = () => {
    if (listening) stop();
    else start();
  };
  // Hold to talk: starts on a long press, stops when the finger lifts.
  const onLongPress = () => {
    if (listening) return;
    holdRef.current = true;
    start(true);
  };
  const onPressOut = () => {
    if (!holdRef.current) return;
    holdRef.current = false;
    stop();
  };

  const color = listening ? theme.statusDanger : theme.primary;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={350}
      hitSlop={8}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: listening ? theme.statusDangerBg : theme.primaryLight, opacity: pressed ? 0.7 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop dictating' : label}
      accessibilityHint="Tap to start and stop, or hold to talk"
      accessibilityState={{ busy: listening }}
    >
      <View style={styles.inner}>
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={18} color={color} />
        {listening && !compact && <Text style={[styles.text, { color }]}>Listening…</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minWidth: 36, height: 32, borderRadius: 16, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12, fontWeight: '600' },
});
