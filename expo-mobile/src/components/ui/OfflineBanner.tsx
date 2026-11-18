import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { addSyncListener, getQueue, syncQueue } from '../../services/offlineQueue';
import { useTheme } from '../../theme';

/**
 * App-wide offline state, mounted ONCE around the navigator (AppNavigator).
 *
 * - Offline: a slim amber bar under the status bar — "Offline — changes will
 *   send when you're back", plus how many changes are waiting.
 * - Back online with changes waiting: it drains the offline queue and shows
 *   "N waiting to send" while that runs, then "All sent" for a moment.
 *
 * Layout: the bar sits in the status-bar area and PUSHES the app down (no
 * overlay, so it never covers a header). While it shows, the app below gets
 * a top safe-area inset of 0 — the bar has already used it — so screens that
 * pad their headers by insets.top don't add a second gap. Native-stack
 * headers lay out from the native safe area, which is 0 below the bar too.
 *
 * Fold-safe: the children are always rendered at the same place in the tree
 * (only the bar and the inset value change), so showing or hiding the bar, or
 * the Duo folding, never remounts a screen.
 */

type Phase = 'hidden' | 'offline' | 'sending' | 'sent' | 'stuck';

/** Changes in the queue that will still be sent (not given up on). */
async function waitingCount(): Promise<number> {
  const queue = await getQueue();
  return queue.filter(a => a.status !== 'failed').length;
}

function useOfflineStatus() {
  const [phase, setPhase] = useState<Phase>('hidden');
  const [waiting, setWaiting] = useState(0);
  const wasOffline = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live queue length.
  useEffect(() => {
    let alive = true;
    const load = () => { waitingCount().then(n => { if (alive) setWaiting(n); }).catch(() => {}); };
    load();
    const off = addSyncListener(load);
    return () => { alive = false; off(); };
  }, []);

  useEffect(() => {
    const clearHide = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
    const hideAfter = (ms: number) => {
      clearHide();
      hideTimer.current = setTimeout(() => setPhase('hidden'), ms);
    };

    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable is null while unknown — only a definite false counts.
      const online = !!state.isConnected && state.isInternetReachable !== false;
      if (!online) {
        clearHide();
        wasOffline.current = true;
        setPhase('offline');
        return;
      }
      if (!wasOffline.current) return;
      wasOffline.current = false;
      waitingCount().then(n => {
        if (n === 0) { setPhase('hidden'); return; }
        setPhase('sending');
        // Shared with any screen-level sync (syncQueue dedupes concurrent drains).
        syncQueue()
          .catch(() => ({ synced: 0, failed: 0 }))
          .then(async () => {
            const left = await waitingCount().catch(() => 0);
            if (wasOffline.current) return; // dropped again mid-send
            setWaiting(left);
            setPhase(left === 0 ? 'sent' : 'stuck');
            hideAfter(left === 0 ? 2000 : 4000);
          });
      }).catch(() => setPhase('hidden'));
    });
    return () => { unsubscribe(); clearHide(); };
  }, []);

  return { phase, waiting };
}

export default function OfflineFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { phase, waiting } = useOfflineStatus();
  const visible = phase !== 'hidden';

  let bg = theme.statusWarningBg;
  let fg = theme.statusWarning;
  let icon: keyof typeof Ionicons.glyphMap = 'cloud-offline-outline';
  let text = '';
  switch (phase) {
    case 'offline':
      text = 'Offline — changes will send when you’re back'
        + (waiting > 0 ? ` · ${waiting} waiting` : '');
      break;
    case 'sending':
      bg = theme.statusInfoBg; fg = theme.statusInfo; icon = 'cloud-upload-outline';
      text = `Back online · ${waiting} waiting to send`;
      break;
    case 'sent':
      bg = theme.statusSuccessBg; fg = theme.statusSuccess; icon = 'checkmark-circle-outline';
      text = 'Back online · all changes sent';
      break;
    case 'stuck':
      icon = 'alert-circle-outline';
      text = `${waiting} still waiting to send — will retry`;
      break;
  }

  return (
    <View style={styles.root}>
      {visible && (
        <View
          style={[styles.bar, { backgroundColor: bg, paddingTop: insets.top + 4, borderBottomColor: fg + '33' }]}
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
        >
          <Ionicons name={icon} size={16} color={fg} />
          <Text style={[styles.text, { color: fg }]} maxFontSizeMultiplier={1.3} numberOfLines={2}>
            {text}
          </Text>
        </View>
      )}
      {/* Always the same element, so toggling the bar never remounts the app. */}
      <SafeAreaInsetsContext.Provider value={visible ? { ...insets, top: 0 } : insets}>
        <View style={styles.root}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, fontSize: 13, fontWeight: '600' },
});
