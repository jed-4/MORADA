import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, CloudOff } from 'lucide-react-native';
import { metrics, size, space, type, useColors, type Theme } from '../../theme';
import { Card, StatusDot, type DotStatus } from '../kit';
import type { ClientTone } from '../../lib/clientPortal';

/**
 * Shared furniture for client mode — the phone counterpart of the web's
 * components/client/ClientPage + ClientListPage, so every client screen has
 * the same header, cards and status. Revamp: the portal inherits the team
 * app's theme (Phase 0): bg pages, white 1dp cards, dot + word status.
 */

const TONE_DOT: Record<ClientTone, DotStatus> = {
  done: 'done',
  info: 'sent',
  attention: 'rejected',
  waiting: 'pending',
};

/** Kept for callers that colour other things by tone. */
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

/** Status as a 7dp dot + word (never a filled pill). */
export function ClientStatusPill({ label, tone }: { label: string; tone: ClientTone }) {
  return <StatusDot status={TONE_DOT[tone] ?? 'pending'} label={label} />;
}

/** Title bar used at the top of every client tab. */
export function ClientHeader({
  title,
  subtitle,
  right,
  onBack,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  /** Shown as a back chevron — for screens pushed on top of the tabs. */
  onBack?: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + metrics.schedule.top + space.inline, backgroundColor: c.bg }]}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={metrics.pageHeader.back} color={c.accent} strokeWidth={metrics.iconStroke} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={[onBack ? type.pageTitle : type.display, { color: c.text }]} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[type.meta, { color: c.muted }]} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function ClientCard({ children, style }: { children: ReactNode; style?: any }) {
  return <Card style={style}>{children}</Card>;
}

export function ClientEmpty({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.greyFill }]}>
        <Ionicons name={icon} size={metrics.emptyState.icon} color={c.muted} />
      </View>
      <Text style={[type.emptyTitle, styles.center, { color: c.text }]}>{title}</Text>
      <Text style={[type.meta, styles.center, { color: c.muted }]}>{body}</Text>
    </View>
  );
}

export function ClientLoading() {
  const c = useColors();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

/** Small note shown when the last refresh failed but older data is on screen. */
export function ClientOfflineNote({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={styles.offline}>
      <CloudOff size={size.icon.meta} color={c.status.pendingText} strokeWidth={metrics.iconStroke} />
      <Text style={[type.caption, styles.flex, { color: c.status.pendingText }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.screenX, paddingBottom: space.rowGap, gap: space.inline },
  headerText: { flex: 1, gap: metrics.listRow.bodyGap },
  empty: { alignItems: 'center', paddingVertical: metrics.emptyState.padBottom / 2, paddingHorizontal: space.screenBottom, gap: metrics.emptyState.gap },
  emptyIcon: { width: metrics.emptyState.circle, height: metrics.emptyState.circle, borderRadius: metrics.emptyState.circle / 2, alignItems: 'center', justifyContent: 'center' },
  loading: { paddingVertical: metrics.emptyState.padBottom / 2, alignItems: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm, marginHorizontal: space.screenX, marginBottom: space.inline },
});
