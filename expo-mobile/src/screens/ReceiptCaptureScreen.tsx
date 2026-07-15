import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, apiRequest, uploadFileFromUri } from '../services/api';
import { useTheme } from '../theme';

interface CostCode {
  id: string;
  name: string;
  code?: string;
}

interface Contact {
  id: string;
  name: string;
}

export default function ReceiptCaptureScreen({ route, navigation }: any) {
  const { projectId, projectName } = route.params as { projectId: string; projectName: string };
  const theme = useTheme();
  const colors = useMemo(() => ({
    background: theme.background,
    card: theme.card,
    border: theme.border,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    muted: theme.textMuted,
    accent: theme.primary,
    danger: theme.statusDanger,
    amber: '#F59E0B',
  }), [theme]);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [costCodeId, setCostCodeId] = useState('');
  const [paidByMe, setPaidByMe] = useState(false);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [costCodePickerOpen, setCostCodePickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: 'Capture Receipt' });
    apiFetch<CostCode[]>(`/api/projects/${projectId}/cost-codes`)
      .then(data => setCostCodes(data || []))
      .catch(() => {});
    // Launch camera immediately on open
    handleTakePhoto().catch(e => console.warn('Auto camera launch failed:', e));
  }, []);

  const handleTakePhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to capture receipts.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (e) {
      console.warn('Camera launch failed:', e);
      Alert.alert('Camera Unavailable', 'Could not open the camera. You can choose a photo from your library instead.');
    }
  }, []);

  const handlePickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  }, []);

  const selectedCostCode = costCodes.find(c => c.id === costCodeId);

  const handleSubmit = async () => {
    // Normalise comma decimal separators (e.g. "12,50" → "12.50")
    const amountNum = parseFloat(amount.replace(',', '.'));
    if (!amount.trim() || isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid receipt amount greater than zero.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Missing Description', 'Please enter a description for this receipt.');
      return;
    }
    if (!costCodeId) {
      Alert.alert('Missing Cost Code', 'Please select a cost code.');
      return;
    }

    setSubmitting(true);
    try {
      let objectPath: string | undefined;
      if (photoUri) {
        const fileName = `receipt_${Date.now()}.jpg`;
        const uploadResult = await uploadFileFromUri(photoUri, fileName, 'image/jpeg');
        objectPath = uploadResult.objectPath;
      }

      // Amount entered is inc GST — split into ex-GST subtotal + GST (10%).
      const totalCents = Math.round(amountNum * 100);
      const subtotal = Math.round(totalCents / 1.1);
      const tax = totalCents - subtotal;
      await apiRequest('/api/bills', 'POST', {
        projectId,
        billType: 'receipt',
        billDate: new Date().toISOString(),
        status: 'draft',
        total: totalCents,
        subtotal,
        tax,
        notes: description.trim(),
        costCodeId,
        supplierName: supplierName.trim() || undefined,
        paidByEmployee: paidByMe,
        ...(objectPath ? { objectPath } : {}),
      });

      Alert.alert('Receipt Submitted', 'Your receipt has been submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to submit receipt. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Memoised on theme — recreating a StyleSheet on every keystroke is wasteful.
  // The single state-dependent property (photo divider border) is inlined at
  // the usage site below.
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 32 },
    photoContainer: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      overflow: 'hidden',
    },
    photo: { width: '100%', height: 200, resizeMode: 'cover' },
    photoPlaceholder: {
      height: 160,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    photoPlaceholderText: { fontSize: 14, color: colors.secondary },
    photoButtons: {
      flexDirection: 'row',
      padding: 12,
      gap: 8,
      borderTopColor: colors.border,
    },
    photoBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    photoBtnText: { fontSize: 13, color: colors.accent, fontWeight: '500' },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
      gap: 14,
    },
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text },
    required: { color: colors.danger },
    amountWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
    },
    currencyPrefix: { fontSize: 18, color: colors.text, marginRight: 4 },
    amountInput: {
      flex: 1,
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      paddingVertical: 10,
    },
    textInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    inlineInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: colors.text,
    },
    pickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    pickerBtnText: { fontSize: 14, color: colors.text },
    pickerBtnPlaceholder: { fontSize: 14, color: colors.muted },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggleInfo: { flex: 1, marginRight: 12 },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
    toggleDesc: { fontSize: 12, color: colors.secondary, marginTop: 2 },
    amberBanner: {
      backgroundColor: colors.amber + '18',
      borderWidth: 1,
      borderColor: colors.amber + '40',
      borderRadius: 8,
      padding: 10,
      marginTop: 8,
    },
    amberBannerText: { fontSize: 12, color: colors.amber, fontWeight: '500' },
    submitBtn: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    submitBtnDisabled: { opacity: 0.6 },
    submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    pickerList: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.card,
      marginTop: 4,
      maxHeight: 200,
      overflow: 'hidden',
    },
    pickerItem: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    pickerItemText: { fontSize: 14, color: colors.text },
  }), [colors]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* Photo section */}
        <View style={styles.photoContainer}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="receipt-outline" size={40} color={colors.muted} />
              <Text style={styles.photoPlaceholderText}>No photo taken yet</Text>
            </View>
          )}
          <View style={[styles.photoButtons, { borderTopWidth: photoUri ? 1 : 0 }]}>
            <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={16} color={colors.accent} />
              <Text style={styles.photoBtnText}>{photoUri ? 'Retake' : 'Take Photo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={handlePickFromLibrary} activeOpacity={0.7}>
              <Ionicons name="images-outline" size={16} color={colors.accent} />
              <Text style={styles.photoBtnText}>Choose Photo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form fields */}
        <View style={styles.card}>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.label}>Amount (inc. GST) <Text style={styles.required}>*</Text></Text>
            <View style={styles.amountWrapper}>
              <Text style={styles.currencyPrefix}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder={"What did you buy and what is it for?\ne.g. 'Sand and cement for slab patch — Level 1 bathroom'"}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              returnKeyType="default"
            />
          </View>

          {/* Cost Code */}
          <View style={styles.field}>
            <Text style={styles.label}>Cost Code <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setCostCodePickerOpen(v => !v)}
              activeOpacity={0.7}
            >
              {selectedCostCode ? (
                <Text style={styles.pickerBtnText}>
                  {selectedCostCode.code ? `${selectedCostCode.code} — ` : ''}{selectedCostCode.name}
                </Text>
              ) : (
                <Text style={styles.pickerBtnPlaceholder}>Select a cost code…</Text>
              )}
              <Ionicons name={costCodePickerOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
            </TouchableOpacity>
            {costCodePickerOpen && (
              <ScrollView style={styles.pickerList} nestedScrollEnabled>
                {costCodes.map(cc => (
                  <TouchableOpacity
                    key={cc.id}
                    style={styles.pickerItem}
                    onPress={() => { setCostCodeId(cc.id); setCostCodePickerOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerItemText}>
                      {cc.code ? `${cc.code} — ` : ''}{cc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* Supplier */}
          <View style={styles.field}>
            <Text style={styles.label}>Supplier <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text></Text>
            <TextInput
              style={styles.inlineInput}
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="e.g. Bunnings Kiama"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Paid by me toggle */}
          <View style={styles.field}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleLabel}>Paid by me — need reimbursement</Text>
                <Text style={styles.toggleDesc}>I paid for this out of my own pocket</Text>
              </View>
              <Switch
                value={paidByMe}
                onValueChange={setPaidByMe}
                trackColor={{ false: colors.border, true: colors.amber }}
                thumbColor="#fff"
              />
            </View>
            {paidByMe && (
              <View style={styles.amberBanner}>
                <Text style={styles.amberBannerText}>
                  This receipt will be sent to your manager for reimbursement approval.
                </Text>
              </View>
            )}
          </View>

        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          )}
          <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Receipt'}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
