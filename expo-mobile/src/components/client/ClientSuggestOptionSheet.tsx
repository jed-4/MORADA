import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';

/**
 * A client suggests a product they found, on a selection where the builder
 * switched suggestions on. No price — that's the builder's to add. Same
 * payload as the web's SuggestOptionDialog: the photo travels as a data URL,
 * which the server caps at 10 MB and stores as the option's first photo.
 */

export interface SuggestedOption {
  name: string;
  url?: string;
  description?: string;
  photo?: string;
  photoName?: string;
}

// Base64 inflates by a third; stay well under the server's 10 MB image cap.
const MAX_PHOTO_BASE64 = 9 * 1024 * 1024;

export default function ClientSuggestOptionSheet({
  visible,
  submitting,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (value: SuggestedOption) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; dataUrl: string; name: string } | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setUrl('');
      setDescription('');
      setPhoto(null);
    }
  }, [visible]);

  const pick = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', source === 'camera'
        ? 'Allow camera access in Settings to take a photo.'
        : 'Allow photo access in Settings to choose a photo.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    if (asset.base64.length > MAX_PHOTO_BASE64) {
      Alert.alert('That photo is too large', 'Choose a smaller photo (under about 7 MB).');
      return;
    }
    const mime = asset.mimeType?.startsWith('image/') ? asset.mimeType : 'image/jpeg';
    setPhoto({
      uri: asset.uri,
      dataUrl: `data:${mime};base64,${asset.base64}`,
      name: asset.fileName || `suggestion-${Date.now()}.jpg`,
    });
  };

  const trimmedUrl = url.trim();
  const urlInvalid = !!trimmedUrl && !/^https?:\/\//i.test(trimmedUrl);
  const ready = !!name.trim() && !urlInvalid && !submitting;

  const submit = () => {
    if (!ready) return;
    onSubmit({
      name: name.trim(),
      ...(trimmedUrl ? { url: trimmedUrl } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(photo ? { photo: photo.dataUrl, photoName: photo.name } : {}),
    });
  };

  const inputStyle = [styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.textPrimary }];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.bar, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.barAction, { color: theme.textSecondary }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.barTitle, { color: theme.textPrimary }]}>Suggest an option</Text>
          <Pressable onPress={submit} disabled={!ready} hitSlop={10}>
            {submitting ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.barAction, { color: ready ? theme.primary : theme.textMuted, fontWeight: fontWeight.semibold }]}>Send</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[styles.intro, { color: theme.textSecondary }]}>
            Found something you'd prefer? Tell your builder about it and they'll price it.
          </Text>

          <Text style={[styles.label, { color: theme.textSecondary }]}>What is it?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Phoenix Vivid basin mixer, brushed nickel"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
            maxLength={200}
            autoFocus
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>Link (optional)</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {urlInvalid && (
            <Text style={[styles.error, { color: theme.statusDanger }]}>The link must start with http:// or https://</Text>
          )}

          <Text style={[styles.label, { color: theme.textSecondary }]}>Notes (optional)</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Colour, size, where you saw it…"
            placeholderTextColor={theme.textMuted}
            style={[inputStyle, styles.multiline]}
            multiline
            maxLength={2000}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>Photo (optional)</Text>
          {photo ? (
            <View style={styles.photoRow}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <Pressable onPress={() => setPhoto(null)} style={styles.remove} hitSlop={8}>
                <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
                <Text style={[styles.removeText, { color: theme.textSecondary }]}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.photoButtons}>
              <Pressable onPress={() => pick('camera')} style={[styles.photoButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Ionicons name="camera-outline" size={18} color={theme.primary} />
                <Text style={[styles.photoButtonText, { color: theme.textPrimary }]}>Take photo</Text>
              </Pressable>
              <Pressable onPress={() => pick('library')} style={[styles.photoButton, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Ionicons name="images-outline" size={18} color={theme.primary} />
                <Text style={[styles.photoButtonText, { color: theme.textPrimary }]}>Choose photo</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  barTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  barAction: { fontSize: fontSize.base },
  content: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: fontSize.sm, lineHeight: 20, marginBottom: 8 },
  label: { fontSize: fontSize.bodySm, fontWeight: fontWeight.medium, marginTop: 14, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 11, fontSize: fontSize.base },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: fontSize.xs, marginTop: 4 },
  photoButtons: { flexDirection: 'row', gap: 10 },
  photoButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 12 },
  photoButtonText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  photo: { width: 96, height: 96, borderRadius: radius.lg },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeText: { fontSize: fontSize.sm },
});
