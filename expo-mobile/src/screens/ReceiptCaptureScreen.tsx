import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  type TextInputInstance,
} from 'react-native';
import { BottomActionBar } from '../components/form/BottomActionBar';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { apiFetch, uploadFileFromUri, isPermanentError } from '../services/api';
import { addToQueue, sendReceipt, type ReceiptPayload } from '../services/offlineQueue';
import { useTheme } from '../theme';
import { readableFrame } from '../components/ui/ReadableColumn';
import { UploadProgress } from '../components/photo/UploadProgress';
import { PendingUploadsBanner } from '../components/photo/PendingUploadsBanner';
import { usePhotoMarkup } from '../components/photo/PhotoMarkup';
import { usePhotoUploads, PhotoUploadError, type PhotoUploader, type PhotoUploadItem } from '../lib/photosUpload';
import { isDocumentScannerAvailable, isPhotoMarkupAvailable, persistPhoto, scanDocument } from '../lib/photos';
import { useLayout } from '../lib/useLayout';
import { haptic } from '../lib/haptics';

interface CostCode {
  id: string;
  name: string;
  code?: string;
}

interface Contact {
  id: string;
  name: string;
}

// Each page goes up as its own JPEG; the bill gets page 1 inline and the rest
// as extra attachments (see sendReceipt in offlineQueue).
const uploadReceiptPage: PhotoUploader = (uri, onProgress) =>
  uploadFileFromUri(uri, `receipt_${Date.now()}.jpg`, 'image/jpeg', onProgress);

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

  const { isWide } = useLayout();
  const photos = usePhotoUploads({ uploader: uploadReceiptPage });
  const { markupPhoto, markupElement } = usePhotoMarkup();
  // Native modules a build might not have yet (an OTA update on an older
  // binary): hide the actions rather than crash.
  const canScan = useMemo(() => isDocumentScannerAvailable(), []);
  const canMarkup = useMemo(() => isPhotoMarkupAvailable(), []);
  // Set once a submit has started sending, so a retry resumes the same bill
  // instead of creating a second one.
  const sentRef = useRef<ReceiptPayload | null>(null);
  const descriptionRef = useRef<TextInputInstance>(null);
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

  // With one photo, the camera and library REPLACE it (Retake), as before
  // multi-page receipts. With several pages (a scan), they add another page.
  const addOrReplacePhoto = useCallback((uri: string) => {
    const current = photos.snapshot();
    if (current.length === 1) photos.replace(current[0].id, uri);
    else photos.add([uri]);
  }, [photos.snapshot, photos.replace, photos.add]);

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
        addOrReplacePhoto(result.assets[0].uri);
      }
    } catch (e) {
      console.warn('Camera launch failed:', e);
      Alert.alert('Camera Unavailable', 'Could not open the camera. You can choose a photo from your library instead.');
    }
  }, [addOrReplacePhoto]);

  const handleScan = useCallback(async () => {
    try {
      const pages = await scanDocument();
      if (pages?.length) {
        photos.add(pages);
        haptic.success();
      }
    } catch (e) {
      console.warn('Document scan failed:', e);
      Alert.alert('Scanner Unavailable', 'Could not open the scanner. You can take a photo instead.');
    }
  }, [photos.add]);

  const handleMarkup = useCallback(async (item: PhotoUploadItem) => {
    const edited = await markupPhoto(item.uri);
    if (edited) photos.replace(item.id, edited);
  }, [markupPhoto, photos.replace]);

  const handleRemovePage = useCallback((item: PhotoUploadItem) => {
    haptic.warning();
    Alert.alert('Remove photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => photos.remove(item.id) },
    ]);
  }, [photos.remove]);

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
      addOrReplacePhoto(result.assets[0].uri);
    }
  }, [addOrReplacePhoto]);

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

    // Amount entered is inc GST — split into ex-GST subtotal + GST (10%).
    const totalCents = Math.round(amountNum * 100);
    const subtotal = Math.round(totalCents / 1.1);
    const tax = totalCents - subtotal;
    const bill = {
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
    };
    const label = `Receipt · $${(totalCents / 100).toFixed(2)}${supplierName.trim() ? ` · ${supplierName.trim()}` : ''}`;

    setSubmitting(true);
    try {
      // Pages upload one by one, each with its own progress ring. A page that
      // already went up on an earlier attempt isn't sent again.
      const objectPaths = await photos.uploadAll();

      // Resume a bill an earlier attempt already created; otherwise start one.
      const payload: ReceiptPayload = sentRef.current?.billId
        ? sentRef.current
        : { bill, label, photos: [] };
      payload.photos = photos.snapshot().map((p, i) => ({ uri: p.uri, objectPath: objectPaths[i] }));
      sentRef.current = payload;
      await sendReceipt(payload);

      haptic.success();
      Alert.alert('Receipt Submitted', 'Your receipt has been submitted successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const cause = err instanceof PhotoUploadError ? err.cause : err;
      haptic.error();
      if (isPermanentError(cause)) {
        // The server said no — saving it for later won't change that.
        Alert.alert('Error', (cause as Error)?.message || 'Failed to submit receipt. Please try again.');
      } else {
        // Most likely no signal on site: offer to keep it and send later.
        Alert.alert(
          "Couldn't Send",
          `${err instanceof PhotoUploadError ? err.message : 'The receipt could not be sent.'} Check your connection, or save it and it will send by itself when you're back online.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => { handleSubmit(); } },
            { text: 'Send Later', onPress: () => { queueForLater(bill, label); } },
          ],
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Hand the receipt to the offline queue, which sends it when the phone is
  // back online (sendReceipt again — so pages that already uploaded, or a
  // bill that already exists, are not repeated).
  const queueForLater = async (bill: Record<string, any>, label: string) => {
    try {
      const base: ReceiptPayload = sentRef.current?.billId
        ? sentRef.current
        : { bill, label, photos: [] };
      // Cache files can be cleared while the app is closed; keep a copy.
      const queuedPhotos = await Promise.all(photos.snapshot().map(async p => ({
        uri: p.objectPath ? p.uri : await persistPhoto(p.uri),
        objectPath: p.objectPath,
      })));
      await addToQueue({ type: 'create-receipt', payload: { ...base, photos: queuedPhotos } });
      photos.markQueued();
      haptic.success();
      Alert.alert('Saved', "Your receipt will send by itself when you're back online.", [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      haptic.error();
      Alert.alert('Error', e?.message || 'Could not save the receipt for later.');
    }
  };

  const retryPage = (item: PhotoUploadItem) => {
    haptic.light();
    photos.upload(item.id).catch(() => {});
  };

  const renderPageActions = (item: PhotoUploadItem, compact: boolean) => {
    const busy = submitting || item.status === 'uploading';
    return (
      <View style={styles.pageActions} pointerEvents={busy ? 'none' : 'auto'}>
        {canMarkup && (
          <TouchableOpacity
            style={[styles.pageActionBtn, busy && styles.pageActionBusy]}
            onPress={() => handleMarkup(item)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Mark up photo"
          >
            <Ionicons name="brush-outline" size={15} color="#fff" />
            {!compact && <Text style={styles.pageActionText}>Mark up</Text>}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.pageActionBtn, busy && styles.pageActionBusy]}
          onPress={() => handleRemovePage(item)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
        >
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    );
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
    photo: { width: '100%', height: '100%', resizeMode: 'cover' },
    singlePage: { width: '100%', position: 'relative', overflow: 'hidden' },
    pageStrip: { padding: 12, gap: 10 },
    pageThumb: {
      width: 120,
      height: 160,
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.background,
    },
    pageNumber: {
      position: 'absolute',
      left: 6,
      top: 6,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    pageNumberText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    pageActions: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', gap: 6 },
    pageActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minWidth: 28,
      height: 28,
      paddingHorizontal: 7,
      borderRadius: 14,
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    pageActionBusy: { opacity: 0.4 },
    pageActionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    scanBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 12,
      marginTop: 12,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    scanBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
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
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, readableFrame]} keyboardShouldPersistTaps="handled">

        <PendingUploadsBanner projectId={projectId} types={['create-receipt']} noun="receipt" />

        {/* Photo section — one or more pages (a scan can return several) */}
        <View style={styles.photoContainer}>
          {photos.items.length === 1 ? (
            <View style={[styles.singlePage, { height: isWide ? 320 : 200 }]}>
              <Image source={{ uri: photos.items[0].uri }} style={styles.photo} />
              <UploadProgress
                status={photos.items[0].status}
                progress={photos.items[0].progress}
                onRetry={() => retryPage(photos.items[0])}
              />
              {renderPageActions(photos.items[0], false)}
            </View>
          ) : photos.items.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageStrip}>
              {photos.items.map((item, i) => (
                <View key={item.id} style={styles.pageThumb}>
                  <Image source={{ uri: item.uri }} style={styles.photo} />
                  <UploadProgress status={item.status} progress={item.progress} size={34} onRetry={() => retryPage(item)} />
                  <View style={styles.pageNumber} pointerEvents="none">
                    <Text style={styles.pageNumberText}>{i + 1}</Text>
                  </View>
                  {renderPageActions(item, true)}
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="receipt-outline" size={40} color={colors.muted} />
              <Text style={styles.photoPlaceholderText}>No photo taken yet</Text>
            </View>
          )}
          {canScan && (
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={handleScan}
              disabled={submitting}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityHint="Opens the document scanner, which crops and straightens the receipt"
            >
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.scanBtnText}>{photos.items.length ? 'Scan More Pages' : 'Scan Receipt'}</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.photoButtons, { borderTopWidth: photos.items.length && !canScan ? 1 : 0 }]}>
            <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto} disabled={submitting} activeOpacity={0.7}>
              <Ionicons name="camera-outline" size={16} color={colors.accent} />
              <Text style={styles.photoBtnText}>{photos.items.length === 1 ? 'Retake' : photos.items.length ? 'Add Photo' : 'Take Photo'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={handlePickFromLibrary} disabled={submitting} activeOpacity={0.7}>
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
                returnKeyType="next"
                autoCorrect={false}
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>Description <Text style={styles.required}>*</Text></Text>
            <TextInput
              ref={descriptionRef}
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              placeholder={"What did you buy and what is it for?\ne.g. 'Sand and cement for slab patch — Level 1 bathroom'"}
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              returnKeyType="default"
              autoCapitalize="sentences"
              autoCorrect
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
              autoCapitalize="words"
              textContentType="organizationName"
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

      </ScrollView>
      {/* Submit in thumb reach, riding above the keyboard. */}
      <BottomActionBar
        label="Submit Receipt"
        busyLabel={photos.isUploading ? 'Uploading photos…' : 'Submitting…'}
        onPress={handleSubmit}
        busy={submitting}
      />
      {markupElement}
    </KeyboardAvoidingView>
  );
}
