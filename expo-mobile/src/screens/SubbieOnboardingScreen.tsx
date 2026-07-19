import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, saveSession } from '../services/api';
import { navigateToLogHours } from '../navigation/navigationRef';
import { useTheme, fontSize, fontWeight, radius, type Theme } from '../theme';

// Subbie onboarding — a single self-contained flow so it survives the auth gate:
// it registers + logs in (saving the session for API calls) WITHOUT entering the
// app, walks through profile + first job, then calls refreshUser() at the end to
// drop the now-set-up subbie into the app. ~2 minutes, email signup.
//
// Steps: 0 sign up · 1 profile (ABN/GST/rate) · 2 add builder + job · 3 done.

type RateType = 'hourly' | 'day';

export default function SubbieOnboardingScreen({ navigation }: { navigation: any }) {
  const theme = useTheme();
  const { refreshUser } = useAuth();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 0 — signup
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trade, setTrade] = useState('Carpenter');

  // Step 1 — profile
  const [abn, setAbn] = useState('');
  const [gstRegistered, setGstRegistered] = useState(true);
  const [rateType, setRateType] = useState<RateType>('hourly');
  const [rate, setRate] = useState('');

  // Step 2 — first job
  const [builder, setBuilder] = useState('');
  const [jobName, setJobName] = useState('');
  const [jobAddress, setJobAddress] = useState('');

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitSignup = () =>
    run(async () => {
      if (!name.trim()) throw new Error('Enter your name');
      if (!email.trim() || !password) throw new Error('Enter your email and a password');
      const [firstName, ...rest] = name.trim().split(' ');
      const lastName = rest.join(' ') || null;

      // Create the account (also creates the company), then log in to get a
      // mobile session. We deliberately don't setUser yet — that would enter the app.
      await apiRequest('/api/auth/register', 'POST', {
        email: email.trim(),
        password,
        firstName,
        lastName,
      });
      const loginRes = await apiRequest('/api/auth/login', 'POST', {
        email: email.trim(),
        password,
      });
      const data = await loginRes.json();
      if (!data.sessionId) throw new Error('Could not start your session. Please try again.');
      await saveSession(data.sessionId);
      setStep(1);
    });

  const submitProfile = () =>
    run(async () => {
      const amount = rate.trim() ? Number(rate) : null;
      if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
        throw new Error('Enter a valid rate');
      }
      await apiRequest('/api/subbie/profile', 'POST', {
        abn: abn.trim() || null,
        isGstRegistered: gstRegistered,
        chargeRate: rateType === 'hourly' && amount != null ? amount.toFixed(2) : null,
        dayRate: rateType === 'day' && amount != null ? amount.toFixed(2) : null,
      });
      setStep(2);
    });

  const submitJob = () =>
    run(async () => {
      if (!builder.trim()) throw new Error('Who are you working for?');
      if (!jobName.trim()) throw new Error('Give the job a name');
      await apiRequest('/api/projects', 'POST', {
        name: jobName.trim(),
        location: jobAddress.trim() || undefined,
        projectSubStatus: 'lead_new',
      });
      setStep(3);
    });

  const enterApp = () => run(async () => {
    await refreshUser();      // swaps in the Main tree
    navigateToLogHours();     // then lands on Timesheets once it's mounted
  });

  const progress = ['Sign up', 'Your details', 'First job', 'All set'];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Progress */}
          <View style={styles.progressRow}>
            {progress.map((label, i) => (
              <View key={label} style={styles.progressItem}>
                <View style={[styles.dot, i <= step && styles.dotActive]} />
                <Text style={[styles.dotLabel, i === step && styles.dotLabelActive]}>{label}</Text>
              </View>
            ))}
          </View>

          {step === 0 && (
            <View style={styles.card}>
              <Text style={styles.h1}>Set up in minutes</Text>
              <Text style={styles.sub}>Timesheets, site diary and invoices — start today.</Text>
              <Field label="Your name">
                <TextInput style={styles.input} value={name} onChangeText={setName}
                  placeholder="Jed Smith" placeholderTextColor={theme.textMuted} autoCapitalize="words" />
              </Field>
              <Field label="Trade">
                <TextInput style={styles.input} value={trade} onChangeText={setTrade}
                  placeholderTextColor={theme.textMuted} />
              </Field>
              <Field label="Email">
                <TextInput style={styles.input} value={email} onChangeText={setEmail}
                  placeholder="you@example.com" placeholderTextColor={theme.textMuted}
                  keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </Field>
              <Field label="Password">
                <TextInput style={styles.input} value={password} onChangeText={setPassword}
                  placeholder="At least 8 characters" placeholderTextColor={theme.textMuted}
                  secureTextEntry />
              </Field>
              <PrimaryButton label="Create account" onPress={submitSignup} busy={busy} styles={styles} />
            </View>
          )}

          {step === 1 && (
            <View style={styles.card}>
              <Text style={styles.h1}>Your details</Text>
              <Text style={styles.sub}>This makes your invoices correct from day one.</Text>
              <Field label="ABN (optional)">
                <TextInput style={styles.input} value={abn} onChangeText={setAbn}
                  placeholder="12 345 678 901" placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad" />
              </Field>
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.switchLabel}>Registered for GST</Text>
                  <Text style={styles.switchHint}>
                    {gstRegistered ? 'Invoices add 10% GST and show "Tax Invoice".' : 'No GST added — invoices are not tax invoices.'}
                  </Text>
                </View>
                <Switch value={gstRegistered} onValueChange={setGstRegistered}
                  trackColor={{ true: theme.primary, false: theme.borderStrong }} />
              </View>
              <Field label="How do you charge?">
                <View style={styles.segment}>
                  {(['hourly', 'day'] as RateType[]).map((t) => (
                    <TouchableOpacity key={t} onPress={() => setRateType(t)}
                      style={[styles.segmentBtn, rateType === t && styles.segmentBtnActive]}>
                      <Text style={[styles.segmentText, rateType === t && styles.segmentTextActive]}>
                        {t === 'hourly' ? 'Hourly' : 'Day rate'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
              <Field label={rateType === 'hourly' ? 'Hourly rate (ex GST)' : 'Day rate (ex GST)'}>
                <TextInput style={styles.input} value={rate} onChangeText={setRate}
                  placeholder={rateType === 'hourly' ? '85' : '600'} placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad" />
              </Field>
              <PrimaryButton label="Continue" onPress={submitProfile} busy={busy} styles={styles} />
            </View>
          )}

          {step === 2 && (
            <View style={styles.card}>
              <Text style={styles.h1}>Your first job</Text>
              <Text style={styles.sub}>Add who you're working for, then log hours against it.</Text>
              <Field label="Builder / client">
                <TextInput style={styles.input} value={builder} onChangeText={setBuilder}
                  placeholder="BuildCo Pty Ltd" placeholderTextColor={theme.textMuted} autoCapitalize="words" />
              </Field>
              <Field label="Job name">
                <TextInput style={styles.input} value={jobName} onChangeText={setJobName}
                  placeholder="12 Site Rd — new build" placeholderTextColor={theme.textMuted} />
              </Field>
              <Field label="Site address (optional)">
                <TextInput style={styles.input} value={jobAddress} onChangeText={setJobAddress}
                  placeholder="12 Site Rd, Sydney" placeholderTextColor={theme.textMuted} />
              </Field>
              <PrimaryButton label="Create job" onPress={submitJob} busy={busy} styles={styles} />
            </View>
          )}

          {step === 3 && (
            <View style={styles.card}>
              <Text style={styles.h1}>You're all set 🎉</Text>
              <Text style={styles.sub}>
                Log your hours as you work. Send an invoice within 3 days and your first month is free.
              </Text>
              <PrimaryButton label="Start logging hours" onPress={enterApp} busy={busy} styles={styles} />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {step === 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.linkBtn}>
              <Text style={styles.link}>Already have an account? Log in</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function PrimaryButton({
  label, onPress, busy, styles,
}: { label: string; onPress: () => void; busy: boolean; styles: ReturnType<typeof makeStyles> }) {
  return (
    <TouchableOpacity style={[styles.primary, busy && styles.primaryBusy]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function makeStyles(theme: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    flex: { flex: 1 },
    scroll: { padding: 20, paddingBottom: 40 },
    progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    progressItem: { flex: 1, alignItems: 'center' },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.borderStrong, marginBottom: 6 },
    dotActive: { backgroundColor: theme.primary },
    dotLabel: { fontSize: fontSize.xxs, color: theme.textMuted },
    dotLabelActive: { color: theme.primary, fontWeight: fontWeight.semibold },
    card: { backgroundColor: theme.card, borderRadius: radius.xxl, padding: 20, borderWidth: 1, borderColor: theme.border },
    h1: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, color: theme.textPrimary, marginBottom: 4 },
    sub: { fontSize: fontSize.sm, color: theme.textSecondary, marginBottom: 18, lineHeight: 20 },
    field: { marginBottom: 14 },
    fieldLabel: { fontSize: fontSize.xs, color: theme.textSecondary, marginBottom: 6, fontWeight: fontWeight.medium },
    input: {
      backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg,
      paddingHorizontal: 14, paddingVertical: 12, fontSize: fontSize.base, color: theme.textPrimary,
    },
    switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    switchLabel: { fontSize: fontSize.bodyLg, color: theme.textPrimary, fontWeight: fontWeight.medium },
    switchHint: { fontSize: fontSize.xs, color: theme.textMuted, marginTop: 2, lineHeight: 16 },
    segment: { flexDirection: 'row', backgroundColor: theme.background, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, padding: 3 },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radius.md },
    segmentBtnActive: { backgroundColor: theme.primary },
    segmentText: { fontSize: fontSize.sm, color: theme.textSecondary, fontWeight: fontWeight.medium },
    segmentTextActive: { color: '#fff', fontWeight: fontWeight.semibold },
    primary: { backgroundColor: theme.primary, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
    primaryBusy: { opacity: 0.7 },
    primaryText: { color: '#fff', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
    error: { color: theme.statusDanger, fontSize: fontSize.sm, textAlign: 'center', marginTop: 14 },
    linkBtn: { alignItems: 'center', marginTop: 18 },
    link: { color: theme.primary, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  });
}
