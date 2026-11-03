import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  TextInput,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useAuth } from '../contexts/AuthContext';
import { apiFetch, apiRequest } from '../services/api';
import { readCachedSelections, selectionPhotoSource } from '../services/selectionsOffline';
import { usePermission } from '../lib/usePermission';
import { useTheme, fontSize, fontWeight, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { useToast } from '../components/ui/Toast';
import StatusPill from '../components/selections/StatusPill';
import CroppedImage from '../components/selections/CroppedImage';
import DocumentViewer, { type ViewableDocument } from '../components/DocumentViewer';
import {
  clientPriceCents,
  formatMoney,
  formatQuantity,
  firstImage,
  getChosenOption,
  specLine,
  getSelectionState,
  isSettled,
  prettifySpecKey,
  type OptionAttachment,
  type Selection,
  type SelectionOption,
} from '../lib/selections';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

interface SelectionComment {
  id: string;
  content: string;
  createdByName?: string | null;
  isClientComment: boolean;
  createdAt: string;
}

interface ProjectChannel {
  id: string;
  name: string;
  projectId?: string | null;
}

/**
 * "What's going in" — the product, its numbers, and the note about how to lay
 * it.
 *
 * Deliberately shows ONLY the chosen option. Presenting a trade with three
 * tiles when one goes on the wall is a mistake waiting to happen, so the
 * rejected options never render here; the client-facing choose screen is where
 * alternatives belong.
 */
export default function SelectionDetailScreen({ navigation, route }: Props) {
  const { selectionId, projectId, projectName } = (route.params ?? {}) as {
    selectionId: string;
    projectId: string;
    projectName?: string;
  };
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user } = useAuth();
  const { width, height } = useWindowDimensions();

  const [selection, setSelection] = useState<Selection | null>(null);
  const [comments, setComments] = useState<SelectionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  // The photos open full screen (the chosen product's, or one option's), and
  // which one; null when the viewer is closed.
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [viewerPage, setViewerPage] = useState(0);
  const [viewerPhotos, setViewerPhotos] = useState<OptionAttachment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // Spec sheets for the chosen product — what a trade on site actually needs.
  const [openDoc, setOpenDoc] = useState<ViewableDocument | null>(null);
  const [uploading, setUploading] = useState(false);

  // What this person may DO here. The server enforces the same rules; these
  // only decide which controls are offered.
  const canApprove = usePermission('projects.selections', 'approve');
  const canEdit = usePermission('projects.selections', 'edit');

  // Comments are requireTeamMember on the server, and channels are team-or-
  // client — a subcontractor account gets a 403 on both. Rather than show
  // controls that fail, those sections simply don't render for them.
  // (Note: requireTeamMember is bypassed in development, so this only bites in
  // production.)
  const isTeam = user?.userCategory === 'team';

  const load = useCallback(async () => {
    try {
      const fresh = await apiFetch<Selection>(`/api/selections/${selectionId}`);
      setSelection(fresh);
      if (isTeam) {
        const rows = await apiFetch<SelectionComment[]>(
          `/api/selections/${selectionId}/comments`,
        ).catch(() => []);
        setComments(rows ?? []);
      }
    } catch {
      // Offline or gone: whatever the cache seeded stays on screen.
    } finally {
      setLoading(false);
    }
  }, [selectionId, isTeam]);

  // Seed from the cached list first so the screen paints with no signal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCachedSelections(user?.id, projectId);
      const seed = cached?.selections.find((s) => s.id === selectionId);
      if (seed && !cancelled) {
        setSelection(seed);
        setLoading(false);
      }
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load, projectId, selectionId, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const state = selection ? getSelectionState(selection) : 'open';
  const settled = isSettled(state);
  const chosen = selection ? getChosenOption(selection) : undefined;

  const photos = useMemo(
    () => (chosen?.attachments ?? []).filter((a) => a.fileType?.toLowerCase() === 'image'),
    [chosen],
  );

  const price = useMemo(() => clientPriceCents(chosen), [chosen]);

  const specRows = useMemo(() => {
    if (!chosen) return [] as { label: string; value: string; copyable?: boolean }[];
    const rows: { label: string; value: string; copyable?: boolean }[] = [];
    if (chosen.brand) rows.push({ label: 'Brand', value: chosen.brand });
    if (chosen.sku) rows.push({ label: 'Product code', value: chosen.sku, copyable: true });
    const qty = formatQuantity(chosen);
    if (qty) rows.push({ label: 'Quantity', value: qty });
    // specifications is free-form JSON off the product library / URL scrape,
    // so render whatever is in it rather than guessing at fixed fields.
    const specs = chosen.specifications ?? {};
    for (const [key, value] of Object.entries(specs)) {
      if (value === null || value === undefined || value === '') continue;
      if (typeof value === 'object') continue;
      rows.push({ label: prettifySpecKey(key), value: String(value) });
    }
    return rows;
  }, [chosen]);

  const copyCode = async (value: string) => {
    await Clipboard.setStringAsync(value);
    haptic.light();
    toast.success('Copied');
  };

  const openViewer = (list: OptionAttachment[], index: number) => {
    setViewerPhotos(list);
    setViewerPage(index);
    setViewerIndex(index);
  };

  /** Approving an option makes it THE choice and locks it — same as the web. */
  const approve = (option: SelectionOption) => {
    Alert.alert(
      'Approve this option?',
      `${option.name} becomes the approved choice for ${selection?.name ?? 'this selection'} and is locked in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setApprovingId(option.id);
            try {
              await apiRequest(`/api/selection-options/${option.id}/approve`, 'PATCH');
              haptic.success();
              toast.success('Approved');
              await load();
            } catch (err: any) {
              toast.error(err?.message || 'Could not approve it.');
            } finally {
              setApprovingId(null);
            }
          },
        },
      ],
    );
  };

  const sendComment = async () => {
    const content = commentText.trim();
    if (!content || sendingComment) return;
    setSendingComment(true);
    try {
      await apiRequest(`/api/selections/${selectionId}/comments`, 'POST', { content });
      setCommentText('');
      haptic.light();
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Could not post the comment.');
    } finally {
      setSendingComment(false);
    }
  };

  /** A photo from site (camera or library) onto the chosen product. */
  const addPhoto = () => {
    if (!chosen) return;
    const upload = async (assets: ImagePicker.ImagePickerAsset[]) => {
      setUploading(true);
      try {
        for (const asset of assets) {
          if (!asset.base64) continue;
          const mime = asset.mimeType || 'image/jpeg';
          await apiRequest(`/api/selection-options/${chosen.id}/attachments`, 'POST', {
            fileName: asset.fileName || `site-photo-${Date.now()}.jpg`,
            fileType: 'image',
            mimeType: mime,
            fileData: `data:${mime};base64,${asset.base64}`,
          });
        }
        toast.success(assets.length > 1 ? 'Photos added' : 'Photo added');
        await load();
      } catch (err: any) {
        toast.error(err?.message || 'Could not upload the photo.');
      } finally {
        setUploading(false);
      }
    };
    Alert.alert('Add photo', `To ${chosen.name}`, [
      {
        text: 'Take Photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Camera access is needed to take photos.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6, base64: true });
          if (!result.canceled && result.assets.length) upload(result.assets);
        },
      },
      {
        text: 'Choose from Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Required', 'Photo library access is needed.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.6,
            base64: true,
            allowsMultipleSelection: true,
            selectionLimit: 5,
          });
          if (!result.canceled && result.assets.length) upload(result.assets);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const postToChat = async () => {
    if (!selection || posting) return;
    setPosting(true);
    try {
      const channels = await apiFetch<ProjectChannel[]>(`/api/channels?projectId=${projectId}`);
      const channel = channels?.[0];
      if (!channel) {
        toast.error('This project has no message channel yet.');
        return;
      }
      const lines = [
        `📋 ${selection.name}${selection.room ? ` — ${selection.room}` : ''}`,
        chosen ? `Selected: ${chosen.name}` : 'No option approved yet',
        [chosen?.brand, chosen?.sku].filter(Boolean).join(' · '),
        formatQuantity(chosen),
      ].filter(Boolean);
      await apiRequest(`/api/channels/${channel.id}/messages`, 'POST', {
        content: lines.join('\n'),
      });
      haptic.light();
      toast.success(`Posted to ${channel.name}`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not post to the project chat.');
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!selection) {
    return (
      <View style={[styles.centre, { backgroundColor: theme.background, paddingHorizontal: 40 }]}>
        <Ionicons name="alert-circle-outline" size={34} color={theme.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Selection unavailable</Text>
        <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
          It may have been removed, or you may not have access to it.
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={[styles.backLinkText, { color: theme.primary }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const heroHeight = 250;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + (isTeam ? 96 : 32) }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* Hero */}
        <View style={[styles.hero, { height: heroHeight, backgroundColor: theme.subtle }]}>
          {photos.length > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) =>
                setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / width))
              }
            >
              {photos.map((photo, i) => (
                <Pressable
                  key={photo.id}
                  onPress={() => openViewer(photos, i)}
                  accessibilityLabel="View photo full screen"
                >
                  <CroppedImage
                    filePath={photo.filePath}
                    x={photo.thumbnailX}
                    y={photo.thumbnailY}
                    zoom={photo.thumbnailZoom}
                    style={{ width, height: heroHeight }}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.heroEmpty}>
              <Ionicons name="image-outline" size={38} color={theme.textMuted} />
            </View>
          )}

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={10}
            style={[styles.backFloat, { top: insets.top + 6 }]}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((photo, i) => (
                <View
                  key={photo.id}
                  style={[styles.dot, i === photoIndex && styles.dotActive]}
                />
              ))}
            </View>
          )}

          <View style={styles.heroFoot}>
            <View style={styles.heroText}>
              <Text style={styles.heroName} numberOfLines={2}>
                {settled && chosen ? chosen.name : selection.name}
              </Text>
              <Text style={styles.heroMeta} numberOfLines={1}>
                {[selection.room, selection.name !== chosen?.name ? selection.name : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <StatusPill state={state} />
          </View>
        </View>

        <View style={styles.body}>
          {/* Nothing approved: say so plainly instead of showing a spec. */}
          {!settled && (
            <View style={[styles.notice, { backgroundColor: theme.statusWarningBg }]}>
              <Ionicons name="hourglass-outline" size={16} color={theme.statusWarning} />
              <Text style={[styles.noticeText, { color: theme.statusWarning }]}>
                No option is approved yet — don’t order against this.
              </Text>
            </View>
          )}

          {specRows.length > 0 && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {specRows.map((row, i) => (
                <Pressable
                  key={`${row.label}-${i}`}
                  disabled={!row.copyable}
                  onPress={() => row.copyable && copyCode(row.value)}
                  style={[
                    styles.specRow,
                    i < specRows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
                  ]}
                >
                  <Text style={[styles.specLabel, { color: theme.textMuted }]}>{row.label}</Text>
                  <Text
                    style={[styles.specValue, { color: row.copyable ? theme.primary : theme.textPrimary }]}
                    numberOfLines={2}
                  >
                    {row.value}
                    {row.copyable ? '  ⧉' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* A client's pick waiting on sign-off: approve it from site. */}
          {chosen && !chosen.approvedAt && canApprove && (
            <TouchableOpacity
              onPress={() => approve(chosen)}
              disabled={approvingId !== null}
              style={[styles.approveBtn, { backgroundColor: theme.statusSuccess, opacity: approvingId ? 0.6 : 1 }]}
              accessibilityLabel={`Approve ${chosen.name}`}
            >
              {approvingId === chosen.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.actionText}>Approve this choice</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Nothing chosen yet: the options on offer. These only arrive for
              roles allowed to see undecided selections — a trade gets a stub
              and never sees this list. */}
          {!chosen && (selection.options?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Options to choose from</Text>
              {(selection.options ?? []).map((option) => {
                const img = firstImage(option);
                const optionPhotos = (option.attachments ?? []).filter((a) => a.fileType?.toLowerCase() === 'image');
                const optionPrice = clientPriceCents(option);
                return (
                  <View key={option.id} style={[styles.optionRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Pressable
                      onPress={() => optionPhotos.length > 0 && openViewer(optionPhotos, 0)}
                      style={[styles.optionThumb, { backgroundColor: theme.subtle }]}
                      accessibilityLabel={`View ${option.name} photos`}
                    >
                      {img ? (
                        <CroppedImage
                          filePath={img.filePath}
                          x={img.thumbnailX}
                          y={img.thumbnailY}
                          zoom={img.thumbnailZoom}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : (
                        <Ionicons name="image-outline" size={18} color={theme.textMuted} />
                      )}
                    </Pressable>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.optionName, { color: theme.textPrimary }]} numberOfLines={2}>{option.name}</Text>
                      {!!specLine(option) && (
                        <Text style={[styles.optionMeta, { color: theme.textSecondary }]} numberOfLines={1}>{specLine(option)}</Text>
                      )}
                      {optionPrice !== null && (
                        <Text style={[styles.optionMeta, { color: theme.textPrimary }]}>{formatMoney(optionPrice)}</Text>
                      )}
                    </View>
                    {canApprove && (
                      <TouchableOpacity
                        onPress={() => approve(option)}
                        disabled={approvingId !== null}
                        style={[styles.optionApprove, { borderColor: theme.statusSuccess, opacity: approvingId && approvingId !== option.id ? 0.5 : 1 }]}
                        accessibilityLabel={`Approve ${option.name}`}
                      >
                        {approvingId === option.id ? (
                          <ActivityIndicator size="small" color={theme.statusSuccess} />
                        ) : (
                          <Text style={[styles.optionApproveText, { color: theme.statusSuccess }]}>Approve</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Money only arrives for roles with selections pricing access — the
              server strips it for everyone else, so this simply doesn't render.
              It is the CLIENT'S price; cost and markup are never shown here. */}
          {price !== null && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={[styles.specRow, selection.allowance != null && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
                <Text style={[styles.specLabel, { color: theme.textMuted }]}>Client price</Text>
                <Text style={[styles.specValue, { color: theme.textPrimary }]}>{formatMoney(price)}</Text>
              </View>
              {selection.allowance != null && (
                <View style={styles.specRow}>
                  <Text style={[styles.specLabel, { color: theme.textMuted }]}>Allowance</Text>
                  <Text style={[styles.specValue, { color: theme.textPrimary }]}>{formatMoney(selection.allowance)}</Text>
                </View>
              )}
            </View>
          )}

          {!!chosen?.description && (
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {chosen.description}
            </Text>
          )}

          {/* Trades notes — the field the web app lets you write and no read
              surface has ever shown. */}
          {!!selection.notes?.trim() && (
            <View style={[styles.tradeNote, { backgroundColor: theme.amberLight, borderColor: theme.amber }]}>
              <View style={styles.tradeNoteHead}>
                <Ionicons name="flag" size={13} color={theme.statusWarning} />
                <Text style={[styles.tradeNoteTitle, { color: theme.statusWarning }]}>
                  Trades notes
                </Text>
              </View>
              <Text style={[styles.tradeNoteBody, { color: theme.textPrimary }]}>
                {selection.notes.trim()}
              </Text>
            </View>
          )}

          {!!chosen?.url && (
            <TouchableOpacity
              onPress={() => Linking.openURL(chosen.url!)}
              style={[styles.linkRow, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <Ionicons name="open-outline" size={16} color={theme.primary} />
              <Text style={[styles.linkText, { color: theme.primary }]} numberOfLines={1}>
                Open product page
              </Text>
            </TouchableOpacity>
          )}

          {(chosen?.attachments ?? [])
            .filter((a) => a.fileType?.toLowerCase() !== 'image')
            .map((doc) => (
              <TouchableOpacity
                key={doc.id}
                onPress={() => setOpenDoc({ path: doc.filePath, name: doc.fileName || 'Specification' })}
                style={[styles.linkRow, { backgroundColor: theme.card, borderColor: theme.border }]}
                accessibilityLabel={`Open ${doc.fileName || 'document'}`}
              >
                <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                <Text style={[styles.linkText, { color: theme.primary }]} numberOfLines={1}>
                  {doc.fileName || 'Specification'}
                </Text>
              </TouchableOpacity>
            ))}

          {chosen && canEdit && (
            <TouchableOpacity
              onPress={addPhoto}
              disabled={uploading}
              style={[styles.linkRow, { backgroundColor: theme.card, borderColor: theme.border, opacity: uploading ? 0.6 : 1 }]}
              accessibilityLabel="Add a photo"
            >
              {uploading ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Ionicons name="camera-outline" size={16} color={theme.primary} />
              )}
              <Text style={[styles.linkText, { color: theme.primary }]}>
                {uploading ? 'Uploading…' : 'Add a photo'}
              </Text>
            </TouchableOpacity>
          )}

          {isTeam && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>Conversation</Text>
              {comments.length === 0 && (
                <Text style={[styles.optionMeta, { color: theme.textMuted }]}>No comments yet.</Text>
              )}
              {comments.map((comment) => (
                <View
                  key={comment.id}
                  style={[
                    styles.comment,
                    {
                      backgroundColor: comment.isClientComment ? theme.tealLight : theme.subtle,
                    },
                  ]}
                >
                  <Text style={[styles.commentWho, { color: theme.textPrimary }]}>
                    {comment.createdByName || 'Someone'}
                    {comment.isClientComment ? ' · Client' : ''}
                  </Text>
                  <Text style={[styles.commentBody, { color: theme.textPrimary }]}>
                    {comment.content}
                  </Text>
                </View>
              ))}
              <View style={[styles.composer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <TextInput
                  value={commentText}
                  onChangeText={setCommentText}
                  placeholder="Add a comment for the team"
                  placeholderTextColor={theme.textMuted}
                  multiline
                  style={[styles.composerInput, { color: theme.textPrimary }]}
                  accessibilityLabel="Comment"
                />
                <TouchableOpacity
                  onPress={sendComment}
                  disabled={!commentText.trim() || sendingComment}
                  hitSlop={8}
                  accessibilityLabel="Send comment"
                  style={{ opacity: !commentText.trim() || sendingComment ? 0.4 : 1 }}
                >
                  {sendingComment ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <Ionicons name="send" size={18} color={theme.primary} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {isTeam && (
        <View
          style={[
            styles.actionBar,
            {
              backgroundColor: theme.card,
              borderTopColor: theme.border,
              paddingBottom: insets.bottom + 10,
            },
          ]}
        >
          <TouchableOpacity
            onPress={postToChat}
            disabled={posting}
            style={[styles.action, { backgroundColor: theme.primary, opacity: posting ? 0.6 : 1 }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="chatbubble-outline" size={16} color="#FFFFFF" />
                <Text style={styles.actionText}>Post to project chat</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Full-screen photos: swipe between them, pinch to zoom (iOS), and a
          close button — the whole photo, not the cropped thumbnail. */}
      <Modal
        visible={viewerIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View style={styles.zoomBackdrop}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (viewerIndex ?? 0) * width, y: 0 }}
            onMomentumScrollEnd={(e) => setViewerPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {viewerPhotos.map((photo) => (
              <ScrollView
                key={photo.id}
                style={{ width }}
                contentContainerStyle={styles.zoomPage}
                maximumZoomScale={4}
                minimumZoomScale={1}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                centerContent
              >
                <Image
                  source={selectionPhotoSource(photo.filePath)}
                  style={{ width, height: height * 0.8 }}
                  resizeMode="contain"
                />
              </ScrollView>
            ))}
          </ScrollView>

          <TouchableOpacity
            onPress={() => setViewerIndex(null)}
            hitSlop={12}
            style={[styles.zoomClose, { top: insets.top + 8 }]}
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          {viewerPhotos.length > 1 && (
            <View style={[styles.zoomCount, { bottom: insets.bottom + 16 }]}>
              <Text style={styles.zoomCountText}>{viewerPage + 1} / {viewerPhotos.length}</Text>
            </View>
          )}
        </View>
      </Modal>

      <DocumentViewer document={openDoc} onClose={() => setOpenDoc(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  emptyBody: { fontSize: fontSize.bodySm, textAlign: 'center', lineHeight: 19 },
  backLink: { marginTop: 8, padding: 8 },
  backLinkText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },

  hero: { position: 'relative', overflow: 'hidden' },
  heroEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backFloat: {
    position: 'absolute',
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(20,17,22,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { position: 'absolute', top: 14, right: 14, flexDirection: 'row', gap: 5 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: { width: 16, borderRadius: 3, backgroundColor: '#FFFFFF' },
  heroFoot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 12,
    backgroundColor: 'rgba(20,17,22,0.62)',
  },
  heroText: { flex: 1, minWidth: 0 },
  heroName: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.2,
  },
  heroMeta: { color: 'rgba(255,255,255,0.84)', fontSize: fontSize.xs, marginTop: 2 },

  body: { padding: 14, gap: 12 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.xl,
    padding: 11,
  },
  noticeText: { flex: 1, fontSize: fontSize.bodySm, fontWeight: fontWeight.medium },

  card: { borderWidth: 1, borderRadius: radius.xl, overflow: 'hidden' },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  specLabel: { fontSize: fontSize.xs, width: 96 },
  specValue: {
    flex: 1,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    textAlign: 'right',
  },
  description: { fontSize: fontSize.bodySm, lineHeight: 19 },

  tradeNote: { borderWidth: 1, borderRadius: radius.xl, padding: 12, gap: 6 },
  tradeNoteHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tradeNoteTitle: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tradeNoteBody: { fontSize: fontSize.bodySm, lineHeight: 19 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  linkText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold },

  section: { gap: 8, paddingTop: 4 },
  sectionTitle: {
    fontSize: fontSize.data,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  comment: { borderRadius: radius.xl, padding: 10, gap: 3 },
  commentWho: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  commentBody: { fontSize: fontSize.bodySm, lineHeight: 18 },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  action: {
    height: 44,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { color: '#FFFFFF', fontSize: fontSize.sm, fontWeight: fontWeight.bold },

  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  approveBtn: {
    height: 44,
    borderRadius: radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 8,
  },
  optionThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionName: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  optionMeta: { fontSize: fontSize.xs, marginTop: 1 },
  optionApprove: {
    borderWidth: 1.5,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
  },
  optionApproveText: { fontSize: fontSize.xs, fontWeight: fontWeight.bold },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  composerInput: { flex: 1, fontSize: fontSize.bodySm, maxHeight: 120, paddingVertical: 2 },
  zoomPage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  zoomClose: {
    position: 'absolute',
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomCount: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  zoomCountText: { color: '#FFFFFF', fontSize: fontSize.data, fontWeight: fontWeight.semibold },
});
