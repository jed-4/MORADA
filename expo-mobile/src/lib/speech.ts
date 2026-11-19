import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Voice notes (#56): on-phone speech-to-text via expo-speech-recognition
// (iOS SFSpeechRecognizer / Android SpeechRecognizer). No audio is kept.
//
// expo-speech-recognition is a NATIVE module and its import calls
// requireNativeModule, which throws on a binary built before it was added (or
// Expo Go). So it is required only once the native half is known to be there;
// without it VoiceInputButton falls back to pointing at the keyboard's mic.

type SpeechLib = typeof import('expo-speech-recognition');
export type SpeechModule = SpeechLib['ExpoSpeechRecognitionModule'];

let cached: SpeechModule | null | undefined;

export function speechModule(): SpeechModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS === 'web') return null;
  try {
    if (requireOptionalNativeModule('ExpoSpeechRecognition')) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      cached = (require('expo-speech-recognition') as SpeechLib).ExpoSpeechRecognitionModule;
    }
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Only one field listens at a time: the recogniser is shared, and its events
 * carry no owner. Starting a second field stops the first.
 */
let activeOwner: symbol | null = null;
const stopHandlers = new Map<symbol, () => void>();

export function claimSpeech(owner: symbol, onTakenAway: () => void) {
  if (activeOwner && activeOwner !== owner) stopHandlers.get(activeOwner)?.();
  activeOwner = owner;
  stopHandlers.set(owner, onTakenAway);
}

export function releaseSpeech(owner: symbol) {
  if (activeOwner === owner) activeOwner = null;
  stopHandlers.delete(owner);
}

export function speechBusyElsewhere(owner: symbol) {
  return activeOwner !== null && activeOwner !== owner;
}

export function ownsSpeech(owner: symbol) {
  return activeOwner === owner;
}

/** Join dictated text onto what's already in the field. */
export function appendDictation(base: string, spoken: string): string {
  const text = spoken.trim();
  if (!text) return base;
  if (!base) return text.charAt(0).toUpperCase() + text.slice(1);
  const sep = /\s$/.test(base) ? '' : ' ';
  const startsSentence = /[.!?]\s*$/.test(base.trim()) || /\n\s*$/.test(base);
  return base + sep + (startsSentence ? text.charAt(0).toUpperCase() + text.slice(1) : text);
}
