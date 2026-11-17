import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { downloadToCache, FileNotFoundError } from '../services/api';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { useLayout } from '../lib/useLayout';

/**
 * Opens a document that lives behind the login — a selection spec sheet, a
 * variation's PDF or attachment — inside the app.
 *
 * The file is downloaded with the session (a plain browser link can't carry
 * it), then shown in a WebView, which on iOS renders PDFs and images
 * natively. Share hands the same local file to the system sheet: save to
 * Files, print, AirDrop, mail. Android's WebView can't draw a PDF, so there
 * the document goes straight to the share sheet, which offers a PDF app.
 *
 * Big screen (iPhone Duo unfolded): a pageSheet there is a narrow card in the
 * middle of the screen, the wrong shape for a plan or a spec sheet, so it
 * opens full screen instead. With `inline`, it opens over its parent view
 * only (e.g. the right panel of a list + detail screen), with a button to go
 * full screen. Phones are unchanged: a pageSheet, as before.
 */

export interface ViewableDocument {
  /** An /objects/... path or an /api/... route that streams the file. */
  path: string;
  /** Shown in the header and used as the saved file's name. */
  name: string;
  /** What to say when the server has no such file (404). */
  notFoundMessage?: string;
}

export default function DocumentViewer({
  document,
  onClose,
  inline = false,
}: {
  document: ViewableDocument | null;
  onClose: () => void;
  /** On a big screen, open over the parent view instead of in a modal. The parent must fill the area to cover. */
  inline?: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  /** Inline viewer blown up to full screen by its expand button. */
  const [expanded, setExpanded] = useState(false);
  // The presentation is fixed when the document opens: iOS reads a Modal's
  // presentationStyle when presenting it, so following a fold or unfold
  // mid-read would leave the top padding out of step with the sheet.
  const wideAtOpen = useRef<boolean | null>(null);
  if (!document) wideAtOpen.current = null;
  else if (wideAtOpen.current === null) wideAtOpen.current = isWide;

  useEffect(() => {
    if (!document) setExpanded(false);
  }, [document]);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    setLocalUri(null);
    setError(null);
    downloadToCache(document.path, document.name)
      .then(async (uri) => {
        if (cancelled) return;
        if (Platform.OS === 'android') {
          // No in-app PDF rendering on Android: hand it to the system instead.
          await Sharing.shareAsync(uri).catch(() => {});
          onClose();
          return;
        }
        setLocalUri(uri);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof FileNotFoundError
            ? document.notFoundMessage ?? err.message
            : err?.message || "Couldn't open the document.",
        );
      });
    return () => {
      cancelled = true;
    };
    // `attempt` re-runs the download on "Try again".
  }, [document?.path, document?.name, attempt]);

  const share = async () => {
    if (!localUri) return;
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', "This device can't share files.");
        return;
      }
      await Sharing.shareAsync(localUri, { dialogTitle: document?.name });
    } catch {
      // Dismissing the share sheet is not an error.
    }
  };

  // The WebView may only read the folder this one file was downloaded into.
  const readAccess = localUri ? localUri.slice(0, localUri.lastIndexOf('/') + 1) : undefined;

  const inPanel = inline && isWide && !expanded;
  // pageSheet has its own top margin; full screen and the right panel (which
  // runs up to the top of the screen) have to clear the status bar.
  const fullScreen = expanded || wideAtOpen.current === true;

  const content = (
      <View style={[styles.container, { backgroundColor: theme.background }, (fullScreen || inPanel) && { paddingTop: insets.top }]}>
        <View style={[styles.bar, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Text style={[styles.action, { color: theme.primary }]}>Done</Text>
          </Pressable>
          <Text style={[styles.title, { color: theme.textPrimary }]} numberOfLines={1}>{document?.name}</Text>
          {inPanel && (
            <Pressable onPress={() => setExpanded(true)} hitSlop={10} accessibilityLabel="Full screen">
              <Ionicons name="expand-outline" size={22} color={theme.primary} />
            </Pressable>
          )}
          <Pressable onPress={share} disabled={!localUri} hitSlop={10} accessibilityLabel="Share or save">
            <Ionicons name="share-outline" size={22} color={localUri ? theme.primary : theme.textMuted} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.center}>
            <Ionicons name="document-outline" size={36} color={theme.textMuted} />
            <Text style={[styles.message, { color: theme.textSecondary }]}>{error}</Text>
            <Pressable onPress={() => setAttempt((n) => n + 1)} style={[styles.retry, { borderColor: theme.border }]}>
              <Text style={[styles.retryText, { color: theme.primary }]}>Try again</Text>
            </Pressable>
          </View>
        ) : !localUri ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
            <Text style={[styles.message, { color: theme.textSecondary }]}>Opening document…</Text>
          </View>
        ) : (
          <WebView
            source={{ uri: localUri }}
            originWhitelist={['file://*']}
            allowFileAccess
            allowingReadAccessToURL={readAccess}
            style={{ flex: 1, backgroundColor: theme.background }}
            containerStyle={{ paddingBottom: insets.bottom }}
            // Pinch to zoom into a plan or spec sheet. iOS WKWebView already
            // zooms PDFs and images; these make Android's WebView do the same
            // (without its +/- buttons) should it ever render one here.
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            onError={() => setError("This document couldn't be displayed. Use Share to open it in another app.")}
          />
        )}
      </View>
  );

  if (inPanel) {
    return document ? <View style={[StyleSheet.absoluteFill, styles.panel]}>{content}</View> : null;
  }

  return (
    <Modal
      visible={!!document}
      animationType="slide"
      presentationStyle={fullScreen ? 'fullScreen' : 'pageSheet'}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  panel: { zIndex: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, textAlign: 'center' },
  action: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  message: { fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  retry: { borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
