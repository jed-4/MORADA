import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiFetch, apiRequest, isPermanentError, uploadPhoto } from '../services/api';
import { addToQueue, isOnline } from '../services/offlineQueue';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ui/Toast';
import { haptic } from '../lib/haptics';
import { useTheme, fontSize, fontWeight, radius } from '../theme';

type Result = 'ok' | 'fault' | 'na';

interface TemplateItem {
  key: string;
  label: string;
  hint?: string;
  critical?: boolean;
}

interface PrestartContext {
  id: string;
  name: string;
  assetType: string;
  rego: string | null;
  status: string;
  meterType: 'km' | 'hours' | 'none';
  currentMeter: number | null;
  template: { label: string; items: TemplateItem[] };
  lastPrestart: { checkedAt: string; date: string; hasDefect: boolean; signedName: string } | null;
}

const MAX_PHOTOS = 4;

/**
 * One pre-start: tick every item OK, Fault or N/A, enter the odometer, sign.
 * A fault on a critical item (brakes, tyres, steering...) means "do not use" —
 * the server takes the asset off the road and raises a task for the office.
 * No signal on site? It queues and sends when the phone is back online.
 */
export default function PrestartScreen({ route, navigation }: { route: any; navigation: NativeStackNavigationProp<any> }) {
  const { assetId } = route.params as { assetId: string };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();

  const [ctx, setCtx] = useState<PrestartContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Result>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [meter, setMeter] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [unsafeToggle, setUnsafeToggle] = useState(false);
  const [generalNotes, setGeneralNotes] = useState('');
  const [signedName, setSignedName] = useState([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<PrestartContext>(`/api/asset-prestarts/assets/${assetId}`)
      .then(setCtx)
      .catch((e) => setLoadError(e?.message || 'Could not load this vehicle.'));
  }, [assetId]);

  const items = ctx?.template.items ?? [];
  const criticalFault = items.some((i) => i.critical && answers[i.key] === 'fault');
  const anyFault = items.some((i) => answers[i.key] === 'fault');
  const unsafe = unsafeToggle || criticalFault;
  const answered = items.filter((i) => answers[i.key]).length;
  const needsMeter = ctx?.meterType !== 'none';
  const meterNum = meter.trim() === '' ? null : Number(meter.replace(/[^\d]/g, ''));

  const setAnswer = (key: string, result: Result) => {
    haptic.select();
    setAnswers((prev) => ({ ...prev, [key]: result }));
  };
  const allOk = () => {
    haptic.select();
    setAnswers((prev) => {
      const next = { ...prev };
      for (const i of items) if (!next[i.key]) next[i.key] = 'ok';
      return next;
    });
  };

  const addPhoto = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera access needed', 'Allow camera access to photograph the fault.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
      if (!result.canceled && result.assets[0]) setPhotos((p) => [...p, result.assets[0].uri].slice(0, MAX_PHOTOS));
    } catch {
      toast.error('Could not open the camera.');
    }
  }, [toast]);

  const submit = async () => {
    if (!ctx) return;
    const missing = items.filter((i) => !answers[i.key]);
    if (missing.length) {
      toast.error(`Answer every item — ${missing.length} left`);
      return;
    }
    const faultWithoutNote = items.find((i) => answers[i.key] === 'fault' && !(notes[i.key] ?? '').trim());
    if (faultWithoutNote) {
      toast.error(`Say what's wrong with "${faultWithoutNote.label}"`);
      return;
    }
    if (needsMeter && (meterNum == null || Number.isNaN(meterNum))) {
      toast.error(ctx.meterType === 'hours' ? 'Enter the engine hours' : 'Enter the odometer');
      return;
    }
    if (!signedName.trim()) {
      toast.error('Sign with your name');
      return;
    }

    const payload = {
      results: items.map((i) => ({ key: i.key, result: answers[i.key], note: answers[i.key] === 'fault' ? notes[i.key]?.trim() || null : null })),
      meter: needsMeter ? meterNum : null,
      unsafe,
      notes: generalNotes.trim() || null,
      signedName: signedName.trim(),
      checkedAt: new Date().toISOString(),
    };

    setSubmitting(true);
    const queueIt = async () => {
      await addToQueue({ type: 'submit-prestart', payload: { assetId, photos, ...payload } });
      toast.show({ message: 'No signal — saved, and it will send when you are back online.' });
      navigation.goBack();
    };
    try {
      if (!(await isOnline())) {
        await queueIt();
        return;
      }
      const uploaded: string[] = [];
      for (const uri of photos) uploaded.push((await uploadPhoto(uri)).objectPath);
      const res = await apiRequest(`/api/assets/${assetId}/prestarts`, 'POST', { ...payload, photos: uploaded });
      const body = await res.json();
      haptic.success();
      if (body?.offRoad || unsafe) {
        Alert.alert('Do not use', `${ctx.name} has been marked off the road and the office has a task to get it fixed.`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        toast.success(anyFault ? 'Saved — the fault has been reported' : 'Pre-start done');
        navigation.goBack();
      }
    } catch (err: any) {
      if (isPermanentError(err)) {
        toast.error(err?.message || 'Could not save the pre-start.');
      } else {
        // Dropped signal mid-send: keep it rather than lose the check.
        await queueIt();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (loadError) {
    return (
      <View style={[styles.screen, styles.centre, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>{loadError}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.primary, fontWeight: fontWeight.semibold }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!ctx) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const choice = (item: TemplateItem, value: Result, label: string) => {
    const selected = answers[item.key] === value;
    const tone =
      value === 'ok' ? { bg: theme.statusSuccessBg, fg: theme.statusSuccess }
      : value === 'fault' ? { bg: theme.statusDangerBg, fg: theme.statusDanger }
      : { bg: theme.subtle, fg: theme.textSecondary };
    return (
      <TouchableOpacity
        key={value}
        onPress={() => setAnswer(item.key, value)}
        style={[styles.choice, { borderColor: selected ? tone.fg : theme.border, backgroundColor: selected ? tone.bg : theme.card }]}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`${item.label}: ${label}`}
      >
        <Text style={[styles.choiceText, { color: selected ? tone.fg : theme.textSecondary }]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{ctx.name}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[ctx.rego, ctx.template.label].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={styles.progress}>{answered}/{items.length}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 120, gap: 12 }} keyboardShouldPersistTaps="handled">
        {ctx.status === 'off_road' && (
          <View style={[styles.banner, { backgroundColor: theme.statusDangerBg, borderColor: theme.statusDanger }]}>
            <Ionicons name="warning" size={18} color={theme.statusDanger} />
            <Text style={[styles.bannerText, { color: theme.statusDanger }]}>
              This is marked OFF ROAD. Don't use it until the office clears the fault.
            </Text>
          </View>
        )}
        {ctx.lastPrestart && (
          <Text style={styles.muted}>
            Last check {new Date(ctx.lastPrestart.checkedAt).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            {' '}by {ctx.lastPrestart.signedName}{ctx.lastPrestart.hasDefect ? ' — faults found' : ''}
          </Text>
        )}

        {needsMeter && (
          <View style={styles.card}>
            <Text style={styles.label}>{ctx.meterType === 'hours' ? 'Engine hours' : 'Odometer (km)'}</Text>
            <TextInput
              value={meter}
              onChangeText={setMeter}
              keyboardType="number-pad"
              placeholder={ctx.currentMeter != null ? `Last: ${ctx.currentMeter.toLocaleString('en-AU')}` : 'Reading'}
              placeholderTextColor={theme.textMuted}
              style={styles.input}
              accessibilityLabel="Meter reading"
            />
          </View>
        )}

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          <TouchableOpacity onPress={allOk} hitSlop={8} accessibilityLabel="Mark the rest OK">
            <Text style={{ color: theme.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>Rest all OK</Text>
          </TouchableOpacity>
        </View>

        {items.map((item) => (
          <View key={item.key} style={[styles.card, answers[item.key] === 'fault' && { borderColor: theme.statusDanger }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              {item.critical && <Ionicons name="alert-circle-outline" size={14} color={theme.textMuted} accessibilityLabel="Critical item" />}
            </View>
            {!!item.hint && <Text style={styles.hint}>{item.hint}</Text>}
            <View style={styles.choices}>
              {choice(item, 'ok', 'OK')}
              {choice(item, 'fault', 'Fault')}
              {choice(item, 'na', 'N/A')}
            </View>
            {answers[item.key] === 'fault' && (
              <TextInput
                value={notes[item.key] ?? ''}
                onChangeText={(t) => setNotes((prev) => ({ ...prev, [item.key]: t }))}
                placeholder="What's wrong?"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, { marginTop: 8 }]}
                multiline
              />
            )}
          </View>
        ))}

        <View style={styles.card}>
          <Text style={styles.label}>Photos {anyFault ? '(recommended for faults)' : ''}</Text>
          <View style={styles.photoRow}>
            {photos.map((uri) => (
              <TouchableOpacity key={uri} onLongPress={() => setPhotos((p) => p.filter((x) => x !== uri))} accessibilityLabel="Photo, long-press to remove">
                <Image source={{ uri }} style={styles.photo} />
              </TouchableOpacity>
            ))}
            {photos.length < MAX_PHOTOS && (
              <TouchableOpacity onPress={addPhoto} style={[styles.photo, styles.addPhoto]} accessibilityLabel="Take a photo">
                <Ionicons name="camera-outline" size={22} color={theme.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={[styles.card, unsafe && { borderColor: theme.statusDanger, backgroundColor: theme.statusDangerBg }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, unsafe && { color: theme.statusDanger }]}>Not safe to use</Text>
              <Text style={styles.hint}>
                {criticalFault ? 'A critical item failed, so this is on.' : 'Turn on to take it off the road.'}
              </Text>
            </View>
            <Switch
              value={unsafe}
              onValueChange={setUnsafeToggle}
              disabled={criticalFault}
              trackColor={{ true: theme.statusDanger, false: theme.border }}
              accessibilityLabel="Not safe to use"
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Anything else</Text>
          <TextInput
            value={generalNotes}
            onChangeText={setGeneralNotes}
            placeholder="Optional"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            multiline
          />
          <Text style={[styles.label, { marginTop: 12 }]}>Signed</Text>
          <TextInput
            value={signedName}
            onChangeText={setSignedName}
            placeholder="Your name"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            accessibilityLabel="Your name"
          />
          <Text style={styles.hint}>By signing you confirm you've done this check yourself.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
        <TouchableOpacity
          onPress={submit}
          disabled={submitting}
          style={[styles.submit, { backgroundColor: unsafe ? theme.statusDanger : theme.primary, opacity: submitting ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{unsafe ? 'Report — do not use' : anyFault ? 'Submit with faults' : 'Submit pre-start'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    centre: { alignItems: 'center', justifyContent: 'center', padding: 24 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 8 },
    title: { fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: theme.textPrimary },
    subtitle: { fontSize: fontSize.xs, color: theme.textSecondary, marginTop: 1 },
    progress: { fontSize: fontSize.sm, color: theme.textSecondary, fontWeight: fontWeight.semibold },
    muted: { fontSize: fontSize.xs, color: theme.textMuted },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.xl, padding: 12 },
    bannerText: { flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    card: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1, borderRadius: radius.xl, padding: 14 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    sectionTitle: { fontSize: fontSize.base, fontWeight: fontWeight.bold, color: theme.textPrimary },
    label: { fontSize: fontSize.xs, color: theme.textSecondary, fontWeight: fontWeight.semibold, marginBottom: 6 },
    itemLabel: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: theme.textPrimary },
    hint: { fontSize: fontSize.xs, color: theme.textMuted, marginTop: 2 },
    choices: { flexDirection: 'row', gap: 8, marginTop: 10 },
    choice: { flex: 1, borderWidth: 1.5, borderRadius: radius.lg, paddingVertical: 10, alignItems: 'center' },
    choiceText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: fontSize.base,
      color: theme.textPrimary,
      backgroundColor: theme.background,
    },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    photo: { width: 72, height: 72, borderRadius: radius.lg },
    addPhoto: { borderWidth: 1, borderStyle: 'dashed', borderColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 10, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border },
    submit: { borderRadius: radius.xl, paddingVertical: 15, alignItems: 'center' },
    submitText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.bold },
  });
}
