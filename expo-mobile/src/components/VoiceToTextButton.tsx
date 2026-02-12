import { useState, useRef } from 'react';
import {
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { API_BASE_URL, getSessionId } from '../services/api';

interface VoiceToTextButtonProps {
  onTranscription: (text: string) => void;
  style?: ViewStyle;
}

export default function VoiceToTextButton({ onTranscription, style }: VoiceToTextButtonProps) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const startPulse = () => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();
  };

  const stopPulse = () => {
    if (pulseLoopRef.current) {
      pulseLoopRef.current.stop();
      pulseLoopRef.current = null;
    }
    pulseAnim.setValue(1);
  };

  const handlePress = async () => {
    if (state === 'transcribing') return;

    if (state === 'recording') {
      await stopAndTranscribe();
    } else {
      await startRecording();
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed for voice-to-text.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setState('recording');
      startPulse();
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Could not start recording.');
    }
  };

  const stopAndTranscribe = async () => {
    try {
      stopPulse();
      setState('transcribing');

      if (!recordingRef.current) {
        setState('idle');
        return;
      }

      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) {
        setState('idle');
        return;
      }

      const formData = new FormData();
      formData.append('audio', {
        uri,
        type: 'audio/mp4',
        name: `voice-transcribe-${Date.now()}.m4a`,
      } as any);

      const headers: Record<string, string> = {
        'X-Client': 'mobile',
      };
      const sid = getSessionId();
      if (sid) {
        headers['X-Session-ID'] = sid;
      }

      const response = await fetch(`${API_BASE_URL}/api/transcribe-audio`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Transcription failed');
      }

      const data = await response.json();
      if (data.text && data.text.trim()) {
        onTranscription(data.text.trim());
      } else {
        Alert.alert('No Speech Detected', 'Could not detect any speech in the recording.');
      }
    } catch (err: any) {
      console.error('Transcription error:', err);
      Alert.alert('Transcription Failed', err.message || 'Could not transcribe the audio.');
    } finally {
      setState('idle');
    }
  };

  if (state === 'transcribing') {
    return (
      <TouchableOpacity style={[styles.button, style]} disabled>
        <ActivityIndicator size={16} color="#3b82f6" />
      </TouchableOpacity>
    );
  }

  if (state === 'recording') {
    return (
      <Animated.View style={[styles.button, style, { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.7} style={styles.innerButton}>
          <Ionicons name="mic" size={18} color="#ef4444" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity style={[styles.button, style]} onPress={handlePress} activeOpacity={0.7}>
      <Ionicons name="mic-outline" size={18} color="#3b82f6" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
