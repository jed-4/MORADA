import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, Linking, AppState, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, MAX_FONT_SCALE } from '../theme';
import {
  isGeofenceOptedIn, enableGeofence, disableGeofence, locationPermissionStatus, refreshSiteFences,
  type AlwaysStatus,
} from '../services/siteGeofence';

/**
 * Settings → "Arriving on site" (#46). Opt-in per person, with the notice of
 * exactly what is recorded and who sees it.
 */
export default function ArrivingOnSiteSetting() {
  const theme = useTheme();
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<AlwaysStatus>('denied');
  const [companyOff, setCompanyOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const load = useCallback(async () => {
    const [opted, perm] = await Promise.all([isGeofenceOptedIn(), locationPermissionStatus()]);
    setOn(opted);
    setStatus(perm);
    if (opted) {
      const res = await refreshSiteFences().catch(() => null);
      if (res) setCompanyOff(!res.settings?.enabled);
    }
  }, []);

  useEffect(() => {
    load();
    // Coming back from iPhone Settings after changing the permission.
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    return () => sub.remove();
  }, [load]);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        const perm = await enableGeofence();
        if (perm === 'denied') {
          Alert.alert('Location is off for Morada', 'Turn on location for Morada in iPhone Settings to use arrival alerts.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      } else {
        await disableGeofence();
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const colors = { card: theme.card, border: theme.border, text: theme.textPrimary, secondary: theme.textSecondary, accent: theme.primary, muted: theme.textMuted };

  return (
    <View style={styles.block}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: colors.text }]}>Arriving on site</Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.subtitle, { color: colors.secondary }]}>
        When you arrive at one of your company's job sites, Morada asks if you want to clock in. It never clocks you in by itself.
      </Text>

      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconWrap, { backgroundColor: colors.accent + '15' }]}>
          <Ionicons name="location-outline" size={18} color={colors.accent} />
        </View>
        <View style={styles.rowText}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.label, { color: colors.text }]}>Arrival alerts</Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.desc, { color: colors.secondary }]}>
            Records only when you arrive at and leave company job sites — never a trail of where you go. Seen only by you and your timesheet approvers.
          </Text>
        </View>
        <Switch
          value={on}
          disabled={busy}
          onValueChange={toggle}
          trackColor={{ false: colors.muted, true: colors.accent + '80' }}
          thumbColor={on ? colors.accent : '#f4f3f4'}
          accessibilityLabel="Arrival alerts"
        />
      </View>

      {on && status !== 'granted' && (
        <TouchableOpacity
          style={[styles.warn, { backgroundColor: theme.statusDangerBg }]}
          onPress={() => Linking.openSettings()}
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle-outline" size={18} color={theme.statusDanger} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.warnText, { color: theme.statusDanger }]}>
            Arrival alerts are off — turn on Always location in iPhone Settings. Tap to open Settings (Location → Always).
          </Text>
        </TouchableOpacity>
      )}

      {on && status === 'granted' && companyOff && (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.note, { color: colors.secondary }]}>
          Your company hasn't switched arrival alerts on yet, so nothing is being watched.
        </Text>
      )}

      <TouchableOpacity onPress={() => setShowMore(v => !v)} accessibilityRole="button" hitSlop={8}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.link, { color: colors.accent }]}>
          {showMore ? 'Hide details' : 'Learn more'}
        </Text>
      </TouchableOpacity>
      {showMore && (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.note, { color: colors.secondary }]}>
          {'• Your phone watches up to 20 of your company\'s job sites (the jobs in construction that you work on). It does not follow you around — iPhone just tells Morada when you cross a site boundary.\n'}
          {'• Each arrival and departure is saved as a site visit: which job, and the time. No map position is saved. Your company may switch storing off, in which case you only get the prompts.\n'}
          {'• Your timesheet is never changed by a visit. Approvers see "arrived on site about 6:42" next to your timesheet.\n'}
          {'• Prompts only come in working hours, at most once per site per day. Site visits are deleted after 12 months.\n'}
          {'• Turn this off any time here, or remove Morada\'s location access in iPhone Settings.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: 16, paddingTop: 24 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, marginBottom: 8 },
  iconWrap: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowText: { flex: 1, paddingRight: 8 },
  label: { fontSize: 15, fontWeight: '500' },
  desc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 8 },
  warnText: { flex: 1, fontSize: 13, lineHeight: 18 },
  note: { fontSize: 12, lineHeight: 18, marginBottom: 8 },
  link: { fontSize: 13, fontWeight: '600', paddingVertical: 6 },
});
