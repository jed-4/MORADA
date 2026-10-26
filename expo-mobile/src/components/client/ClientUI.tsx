import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontSize, fontWeight, radius, type Theme } from '../../theme';
import type { ClientTone } from '../../lib/clientPortal';

/**
 * Shared furniture for client mode — the phone counterpart of the web's
 * components/client/ClientPage + ClientListPage, so every client screen has
 * the same header, cards and status pills.
 */

export function toneColors(theme: Theme, tone: ClientTone): { fg: string; bg: string } {
  switch (tone) {
    case 'done':
      return { fg: theme.statusSuccess, bg: theme.statusSuccessBg };
    case 'info':
      return { fg: theme.statusInfo, bg: theme.statusInfoBg };
    case 'attention':
      return { fg: theme.statusDanger, bg: theme.statusDangerBg };
    case 'waiting':
    default:
      return { fg: theme.statusWarning, bg: theme.statusWarningBg };
  }
}

export function ClientStatusPill({ label, tone }: { label: string; tone: ClientTone }) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme, tone);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Title bar used at the top of every client tab. */
export function ClientHeader({ title, subtitle, right }: { title: string; subtitle?: string | null; right?: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: theme.background }]}>
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
        )}
      </View>
      {right}
    </View>
  );
}

export function ClientCard({ children, style }: { children: ReactNode; style?: any }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function ClientEmpty({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primaryLight }]}>
        <Ionicons name={icon} size={24} color={theme.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>{body}</Text>
    </View>
  );
}

export function ClientLoading() {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** Small banner shown when the last refresh failed but older data is on screen. */
export function ClientOfflineNote({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.offline, { backgroundColor: theme.statusWarningBg }]}>
      <Ionicons name="cloud-offline-outline" size={14} color={theme.statusWarning} />
      <Text style={[styles.offlineText, { color: theme.statusWarning }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: fontSize.xs, fontWeight: fontWeight.semibold },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  subtitle: { fontSize: fontSize.bodySm, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: radius.xl, padding: 14 },
  empty: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold, marginBottom: 6, textAlign: 'center' },
  emptyBody: { fontSize: fontSize.sm, lineHeight: 20, textAlign: 'center' },
  loading: { paddingVertical: 48, alignItems: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.lg },
  offlineText: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, flex: 1 },
});
