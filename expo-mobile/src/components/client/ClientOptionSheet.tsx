import { useEffect, useState } from 'react';
import DocumentViewer, { type ViewableDocument } from '../DocumentViewer';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { formatMoney, prettifySpecKey, type SelectionOption } from '../../lib/selections';
import { selectionPhotoSource } from '../../services/selectionsOffline';
import { ClientStatusPill } from './ClientUI';

/**
 * Everything the builder attached to one option, for a client choosing
 * between them — the phone twin of the web's ClientOptionDialog. Every photo
 * (swipe), the description, the spec table, the product link, and the one
 * action: "Select this option" (wording kept from the web: it's a pick, the
 * builder confirms it).
 *
 * Documents (spec sheets, brochures) open in the in-app DocumentViewer,
 * fetched with the client's session — clientObjectAccess serves a client only
 * the files of options the builder made visible.
 */

const prettyUrl = (url: string) => {
  const trimmed = url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
};

export default function ClientOptionSheet({
  option,
  onClose,
  showPrice,
  isChosen,
  canChoose,
  choosing,
  onChoose,
  onOpenLink,
}: {
  option: (SelectionOption & { clientSuggested?: boolean | null }) | null;
  onClose: () => void;
  showPrice: boolean;
  isChosen: boolean;
  canChoose: boolean;
  choosing: boolean;
  onChoose: () => void;
  onOpenLink: (url: string) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [openDoc, setOpenDoc] = useState<ViewableDocument | null>(null);

  useEffect(() => setPage(0), [option?.id]);

  const attachments = option?.attachments ?? [];
  const images = attachments.filter((a) => a.fileType?.toLowerCase() === 'image');
  const documents = attachments.filter((a) => a.fileType?.toLowerCase() !== 'image');
  const specs = Object.entries(option?.specifications ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== '',
  );

  return (
    <Modal visible={!!option} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {option && (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.grabRow}>
            <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
            <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
            {images.length > 0 ? (
              <View>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
                >
                  {images.map((img) => (
                    <Image
                      key={img.id}
                      source={selectionPhotoSource(img.filePath)}
                      style={{ width, height: width, backgroundColor: theme.subtle }}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
                {images.length > 1 && (
                  <View style={styles.dots}>
                    {images.map((img, i) => (
                      <View key={img.id} style={[styles.dot, { backgroundColor: i === page ? theme.primary : theme.borderStrong }]} />
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.noPhoto, { backgroundColor: theme.subtle }]}>
                <Ionicons name="image-outline" size={32} color={theme.textMuted} />
              </View>
            )}

            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.textPrimary }]}>{option.name}</Text>
                {showPrice && option.totalCost != null && (
                  <Text style={[styles.price, { color: theme.primary }]}>{formatMoney(option.totalCost)}</Text>
                )}
              </View>
              {!!(option.brand || option.sku) && (
                <Text style={[styles.meta, { color: theme.textSecondary }]}>{[option.brand, option.sku].filter(Boolean).join(' · ')}</Text>
              )}
              <View style={styles.tags}>
                {option.approvedAt ? (
                  <ClientStatusPill label="Confirmed" tone="done" />
                ) : isChosen ? (
                  <ClientStatusPill label="Your choice" tone="info" />
                ) : null}
              </View>

              {!!option.description && <Text style={[styles.description, { color: theme.textPrimary }]}>{option.description}</Text>}

              {specs.length > 0 && (
                <View style={[styles.specs, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  {specs.map(([key, value], i) => (
                    <View key={key} style={[styles.specRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                      <Text style={[styles.specKey, { color: theme.textSecondary }]}>{prettifySpecKey(key)}</Text>
                      <Text style={[styles.specValue, { color: theme.textPrimary }]}>{String(value)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {!!option.url && (
                <Pressable onPress={() => onOpenLink(option.url!)} style={styles.link}>
                  <Ionicons name="open-outline" size={16} color={theme.primary} />
                  <Text style={[styles.linkText, { color: theme.primary }]} numberOfLines={1}>{prettyUrl(option.url)}</Text>
                </Pressable>
              )}

              {documents.length > 0 && (
                <View style={styles.docs}>
                  <Text style={[styles.docsTitle, { color: theme.textMuted }]}>DOCUMENTS</Text>
                  {documents.map((doc) => (
                    <Pressable
                      key={doc.id}
                      onPress={() => setOpenDoc({ path: doc.filePath, name: doc.fileName || 'Specification' })}
                      style={({ pressed }) => [styles.doc, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="document-text-outline" size={18} color={theme.primary} />
                      <Text style={[styles.docName, { color: theme.primary }]} numberOfLines={1}>{doc.fileName || 'Specification'}</Text>
                      <Ionicons name="chevron-forward" size={14} color={theme.textMuted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {canChoose && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.card, borderTopColor: theme.border }]}>
              {isChosen ? (
                <View style={styles.chosenNote}>
                  <Ionicons name="checkmark-circle" size={18} color={theme.statusInfo} />
                  <Text style={[styles.chosenText, { color: theme.textSecondary }]}>
                    This is your choice. Your builder will confirm it.
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={onChoose}
                  disabled={choosing}
                  style={({ pressed }) => [styles.choose, { backgroundColor: theme.primary, opacity: pressed || choosing ? 0.8 : 1 }]}
                >
                  {choosing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.chooseText}>Select this option</Text>}
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
      {/* Inside this Modal: iOS only presents a second modal from within the first. */}
      <DocumentViewer document={openDoc} onClose={() => setOpenDoc(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  grabRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  grabber: { width: 36, height: 5, borderRadius: 3 },
  close: { position: 'absolute', right: 14, top: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  noPhoto: { height: 180, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  price: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  meta: { fontSize: fontSize.sm },
  tags: { flexDirection: 'row', gap: 6 },
  description: { fontSize: fontSize.sm, lineHeight: 21, marginTop: 4 },
  specs: { borderWidth: 1, borderRadius: radius.lg, marginTop: 4 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingHorizontal: 12, paddingVertical: 9 },
  specKey: { fontSize: fontSize.bodySm, flexShrink: 0 },
  specValue: { fontSize: fontSize.bodySm, flex: 1, textAlign: 'right' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  linkText: { fontSize: fontSize.sm, fontWeight: fontWeight.medium, flex: 1 },
  docs: { gap: 6, marginTop: 4 },
  docsTitle: { fontSize: 11, fontWeight: fontWeight.semibold, letterSpacing: 0.5 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  docName: { fontSize: fontSize.sm, flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  choose: { borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center' },
  chooseText: { color: '#FFFFFF', fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  chosenNote: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, justifyContent: 'center' },
  chosenText: { fontSize: fontSize.sm },
});
