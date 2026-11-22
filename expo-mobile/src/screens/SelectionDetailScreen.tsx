import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type React from 'react';
import {
  Camera, CircleCheck, Ellipsis, ExternalLink, FileText, MessageSquare, Share2, TriangleExclamationPoint,
} from 'lucide-react-native';
import type { ScrollViewInstance } from 'react-native';
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
import { useColors, fontSize, fontWeight, metrics, radii, size, space, type } from '../theme';
import { Sheet, type SheetRef } from '../components/ui/Sheet';
import { SkeletonList } from '../components/ui/Skeleton';
import {
  Card, CommentComposer, DetailHeader, EmptyState, GroupHeader, ListRow, PropertyRow, SecondaryActionBar, SmartImage,
  StatusDot, Thumb,
} from '../components/kit';
import { haptic } from '../lib/haptics';
import { useToast } from '../components/ui/Toast';
import { selectionDot } from '../components/selections/StatusPill';
import CroppedImage from '../components/selections/CroppedImage';
import DocumentViewer, { type ViewableDocument } from '../components/DocumentViewer';
import { readableFrame } from '../components/ui/ReadableColumn';
import { useLayout } from '../lib/useLayout';
import { useReturnToTwoPane } from '../lib/twoPane';
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
  /**
   * Rendered in the right panel of SelectionsScreen (Duo unfolded) rather
   * than as its own stack screen: no back button, and documents open in the
   * panel instead of over the whole screen.
   */
  embedded?: boolean;
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
export default function SelectionDetailScreen({ navigation, route, embedded = false }: Props) {
  const { selectionId, projectId, projectName } = (route.params ?? {}) as {
    selectionId: string;
    projectId: string;
    projectName?: string;
  };
  const c = useColors();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const moreRef = useRef<SheetRef>(null);
  // Sections folded on this screen (comments start folded, as "Activity" in the design).
  const [closedSections, setClosedSections] = useState<string[]>(['comments']);
  const { user } = useAuth();
  const { width, height, isWide } = useLayout();

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
  // Width of the photo carousel. Not the window width: embedded in the right
  // panel it is narrower, and it changes when the phone folds or unfolds.
  const [heroWidth, setHeroWidth] = useState(width);
  const heroScroll = useRef<ScrollViewInstance>(null);

  // Unfolding on this pushed screen pops back to the list with this item open
  // on the right — unless something here would be lost by the switch (a
  // photo or document open, a half-typed comment). Then it stays put,
  // full width; nothing is thrown away.
  useReturnToTwoPane({
    navigation,
    listRoute: 'Selections',
    id: selectionId,
    embedded: embedded || viewerIndex !== null || openDoc !== null || commentText.trim().length > 0,
  });

  // Keep the carousel on the same photo when its width changes (fold/unfold);
  // the old pixel offset would otherwise leave it straddling two photos.
  useEffect(() => {
    heroScroll.current?.scrollTo({ x: photoIndex * heroWidth, animated: false });
    // Only on a width change; swiping updates photoIndex itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroWidth]);

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

  const shareText = () => {
    if (!selection) return '';
    return [
      `${selection.name}${selection.room ? ` — ${selection.room}` : ''}`,
      chosen ? `Selected: ${chosen.name}` : 'No option approved yet',
      [chosen?.brand, chosen?.sku].filter(Boolean).join(' · '),
      formatQuantity(chosen),
      chosen?.url ?? '',
    ].filter(Boolean).join('\n');
  };

  const share = () => {
    haptic.light();
    Share.share({ message: shareText() }).catch(() => {});
  };

  const sl = metrics.selections;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: embedded ? 0 : insets.top + metrics.schedule.top }]}>
        {!embedded && <View style={styles.pad}><DetailHeader onBack={() => navigation.goBack()} /></View>}
        <SkeletonList />
      </View>
    );
  }

  if (!selection) {
    return (
      <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: embedded ? 0 : insets.top + metrics.schedule.top }]}>
        {!embedded && <View style={styles.pad}><DetailHeader onBack={() => navigation.goBack()} /></View>}
        <EmptyState icon={TriangleExclamationPoint} title="Selection unavailable" helper="It may have been removed, or you may not have access to it." />
      </View>
    );
  }

  const dot = selectionDot(state);
  const approvedOn = chosen?.approvedAt
    ? new Date(chosen.approvedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    : null;
  const docs = (chosen?.attachments ?? []).filter((a) => a.fileType?.toLowerCase() !== 'image');
  const imageSize = isWide ? sl.heroImage * 1.6 : sl.heroImage;
  const hasMoreActions = (chosen && canEdit) || !!chosen?.url;

  const section = (key: string, title: string, count: number | null, body: React.ReactNode) => {
    const open = !closedSections.includes(key);
    return (
      <View>
        <GroupHeader
          title={title}
          meta={count ?? undefined}
          open={open}
          onToggle={() => setClosedSections(open ? [...closedSections, key] : closedSections.filter((k) => k !== key))}
        />
        {open ? body : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: c.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.body,
          readableFrame,
          { paddingTop: embedded ? metrics.schedule.top : insets.top + metrics.schedule.top, paddingBottom: space.screenBottom + (isTeam ? 0 : insets.bottom) },
        ]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
      >
        <DetailHeader
          onBack={embedded ? undefined : () => navigation.goBack()}
          actions={[
            { icon: Share2, label: 'Share', onPress: share },
            ...(hasMoreActions ? [{ icon: Ellipsis, label: 'More actions', onPress: () => moreRef.current?.present() }] : []),
          ]}
        />

        {/* Product image: contained on a white card, swipe for more */}
        <Card style={styles.imageCard}>
          <View style={{ width: '100%' }} onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}>
            {photos.length > 0 ? (
              <ScrollView
                ref={heroScroll}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / heroWidth))}
              >
                {photos.map((photo, i) => (
                  <Pressable
                    key={photo.id}
                    onPress={() => openViewer(photos, i)}
                    accessibilityLabel="View photo full screen"
                    style={{ width: heroWidth, alignItems: 'center' }}
                  >
                    <SmartImage
                      source={selectionPhotoSource(photo.filePath)}
                      width={imageSize}
                      height={imageSize}
                      resizeMode="contain"
                      radius={radii.md}
                      style={{ backgroundColor: 'transparent' }}
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center' }}>
                <SmartImage uri={null} width={imageSize} height={imageSize} radius={radii.lg} />
              </View>
            )}
          </View>
          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((photo, i) => (
                <View key={photo.id} style={[styles.dot, { backgroundColor: i === photoIndex ? c.accent : c.grabber }]} />
              ))}
            </View>
          )}
        </Card>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={[type.detailTitle, { color: c.text }]}>{settled && chosen ? chosen.name : selection.name}</Text>
          {!!(selection.room || (chosen && selection.name !== chosen.name)) && (
            <Text style={[type.meta, { color: c.muted }]}>
              {[selection.room, chosen && selection.name !== chosen.name ? selection.name : null].filter(Boolean).join(' · ')}
            </Text>
          )}
          <View style={styles.statusLine}>
            <StatusDot status={dot.status} label={undefined} />
            <Text style={[type.meta, { color: dot.status === 'pending' ? c.status.pendingText : c.text }]}>{dot.label}</Text>
            {approvedOn ? <Text style={[type.meta, { color: c.muted }]}>{`· ${approvedOn}`}</Text> : null}
          </View>
        </View>

        {/* Nothing approved: say so plainly instead of showing a spec. */}
        {!settled && (
          <Card variant="notes">
            <Text style={[type.body, { color: c.status.pendingText }]}>
              No option is approved yet — don’t order against this.
            </Text>
          </Card>
        )}

        {(specRows.length > 0 || price !== null) && (
          <Card variant="list">
            {specRows.map((row, i) => (
              <PropertyRow
                key={`${row.label}-${i}`}
                label={row.label}
                labelWidth={sl.propLabel}
                value={row.value}
                link={row.copyable}
                onCopy={row.copyable ? () => copyCode(row.value) : undefined}
              />
            ))}
            {/* Money only arrives for roles with selections pricing access — the
                server strips it for everyone else, so these simply don't render.
                It is the CLIENT'S price; cost and markup are never shown here. */}
            {price !== null ? <PropertyRow key="price" label="Price" labelWidth={sl.propLabel} value={formatMoney(price)} /> : null}
            {price !== null && selection.allowance != null ? (
              <PropertyRow key="allowance" label="Allowance" labelWidth={sl.propLabel} value={formatMoney(selection.allowance)} />
            ) : null}
          </Card>
        )}

        {/* A client's pick waiting on sign-off: approve it from site. */}
        {chosen && !chosen.approvedAt && canApprove && (
          <Pressable
            onPress={() => approve(chosen)}
            disabled={approvingId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${chosen.name}`}
            style={[styles.secondaryBtn, { backgroundColor: c.surface, borderColor: c.border, opacity: approvingId ? metrics.disabledOpacity : 1 }]}
          >
            {approvingId === chosen.id ? (
              <ActivityIndicator size="small" color={c.accent} />
            ) : (
              <>
                <CircleCheck size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStroke} />
                <Text style={[type.body, { color: c.accent }]}>Approve this choice</Text>
              </>
            )}
          </Pressable>
        )}

        {/* Nothing chosen yet: the options on offer. These only arrive for
            roles allowed to see undecided selections — a trade gets a stub
            and never sees this list. */}
        {!chosen && (selection.options?.length ?? 0) > 0 &&
          section('options', 'Options to choose from', selection.options?.length ?? 0, (
            <Card variant="list">
              {(selection.options ?? []).map((option) => {
                const img = firstImage(option);
                const optionPhotos = (option.attachments ?? []).filter((a) => a.fileType?.toLowerCase() === 'image');
                const optionPrice = clientPriceCents(option);
                return (
                  <ListRow
                    key={option.id}
                    onPress={optionPhotos.length > 0 ? () => openViewer(optionPhotos, 0) : undefined}
                    lead={
                      img ? (
                        <View style={[styles.optionThumb, { backgroundColor: c.thumbFill, borderColor: c.hairline }]}>
                          <CroppedImage filePath={img.filePath} x={img.thumbnailX} y={img.thumbnailY} zoom={img.thumbnailZoom} style={StyleSheet.absoluteFill} />
                        </View>
                      ) : (
                        <Thumb uri={null} />
                      )
                    }
                    title={option.name}
                    subtitle={[specLine(option), optionPrice !== null ? formatMoney(optionPrice) : null].filter(Boolean).join(' · ') || undefined}
                    trailing={
                      canApprove ? (
                        <Pressable onPress={() => approve(option)} disabled={approvingId !== null} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={`Approve ${option.name}`}>
                          {approvingId === option.id ? (
                            <ActivityIndicator size="small" color={c.accent} />
                          ) : (
                            <Text style={[type.metaSemi, { color: c.accent }]}>Approve</Text>
                          )}
                        </Pressable>
                      ) : undefined
                    }
                  />
                );
              })}
            </Card>
          ))}

        {/* Notes: the trades notes (the field the web app lets you write and no
            other screen shows), then the product description. */}
        {(!!selection.notes?.trim() || !!chosen?.description) &&
          section('notes', 'Notes', null, (
            <Card variant="notes">
              {!!selection.notes?.trim() && (
                <Text style={[type.bodyRead, { color: c.textLong }]}>{selection.notes.trim()}</Text>
              )}
              {!!chosen?.description && (
                <Text style={[type.bodyRead, { color: selection.notes?.trim() ? c.muted : c.textLong, marginTop: selection.notes?.trim() ? space.inline : 0 }]}>
                  {chosen.description}
                </Text>
              )}
            </Card>
          ))}

        {(docs.length > 0 || !!chosen?.url) &&
          section('attachments', 'Attachments', docs.length + (chosen?.url ? 1 : 0), (
            <Card variant="list">
              {docs.map((doc) => (
                <ListRow
                  key={doc.id}
                  onPress={() => setOpenDoc({ path: doc.filePath, name: doc.fileName || 'Specification' })}
                  lead={<View style={[styles.fileIcon, { backgroundColor: c.greyFill }]}><FileText size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} /></View>}
                  title={doc.fileName || 'Specification'}
                  titleLines={1}
                  subtitle={fileKind(doc.fileName)}
                  chevron
                  accessibilityLabel={`Open ${doc.fileName || 'document'}`}
                />
              ))}
              {chosen?.url ? (
                <ListRow
                  key="__url"
                  onPress={() => Linking.openURL(chosen.url!)}
                  lead={<View style={[styles.fileIcon, { backgroundColor: c.greyFill }]}><ExternalLink size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} /></View>}
                  title="Product page"
                  titleLines={1}
                  subtitle={hostOf(chosen.url)}
                  chevron
                />
              ) : null}
            </Card>
          ))}

        {isTeam &&
          section('comments', 'Comments', comments.length, (
            <View style={styles.comments}>
              {comments.length === 0 ? (
                <Text style={[type.meta, { color: c.muted }]}>No comments yet.</Text>
              ) : (
                <Card variant="list">
                  {comments.map((comment) => (
                    <View key={comment.id} style={styles.comment}>
                      <Text style={[type.metaSemi, { color: c.text }]}>
                        {comment.createdByName || 'Someone'}
                        {comment.isClientComment ? <Text style={[type.meta, { color: c.muted }]}> · Client</Text> : null}
                      </Text>
                      <Text style={[type.bodyRead, { color: c.textBody }]}>{comment.content}</Text>
                    </View>
                  ))}
                </Card>
              )}
              <CommentComposer
                value={commentText}
                onChangeText={setCommentText}
                onSend={sendComment}
                sending={sendingComment}
                placeholder="Add a comment for the team"
              />
            </View>
          ))}
      </ScrollView>

      {isTeam && <SecondaryActionBar icon={MessageSquare} label={posting ? 'Posting…' : 'Post to project chat'} onPress={postToChat} disabled={posting} />}

      <Sheet ref={moreRef} title={settled && chosen ? chosen.name : selection.name}>
        <View style={styles.sheetBody}>
          <Card variant="list">
            {chosen && canEdit ? (
              <ListRow
                key="photo"
                lead={<Camera size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
                title={uploading ? 'Uploading…' : 'Add a photo'}
                onPress={() => { moreRef.current?.dismiss(); setTimeout(addPhoto, 300); }}
              />
            ) : null}
            {chosen?.url ? (
              <ListRow
                key="url"
                lead={<ExternalLink size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />}
                title="Open product page"
                onPress={() => { moreRef.current?.dismiss(); Linking.openURL(chosen.url!); }}
              />
            ) : null}
          </Card>
        </View>
      </Sheet>

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

      {/* Embedded, a spec sheet opens over this panel only, so the spec list
          stays visible beside it; it can still be expanded to full screen. */}
      <DocumentViewer document={openDoc} onClose={() => setOpenDoc(null)} inline={embedded} />
    </KeyboardAvoidingView>
  );
}

/** "PDF" from "Spec sheet.pdf" (no size: the API doesn't send one). */
function fileKind(name?: string | null): string {
  const ext = (name ?? '').split('.').pop();
  return ext && ext !== name ? ext.toUpperCase() : 'Document';
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

const SL = metrics.selections;

const styles = StyleSheet.create({
  // ── Revamp v1 ──
  pad: { paddingHorizontal: space.screenX, paddingBottom: metrics.scope.gap },
  body: { paddingHorizontal: space.screenX, gap: metrics.scope.gap },
  imageCard: { paddingTop: SL.heroPad.top, paddingBottom: SL.heroPad.bottom, paddingHorizontal: 0, alignItems: 'center', gap: space.rowGap },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: SL.dotGap },
  dot: { width: SL.dot, height: SL.dot, borderRadius: SL.dot / 2 },
  titleBlock: { gap: SL.titleGap },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  secondaryBtn: {
    minHeight: metrics.actionBar.buttonHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.inline,
  },
  optionThumb: { width: size.thumb, height: size.thumb, borderRadius: radii.md, borderWidth: size.border, overflow: 'hidden' },
  fileIcon: { width: SL.fileIcon, height: SL.fileIcon, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  comments: { gap: space.rowGap },
  comment: { paddingVertical: metrics.listRow.padY, gap: metrics.listRow.bodyGap },
  sheetBody: { paddingHorizontal: space.screenX, paddingTop: space.inline },
  screen: { flex: 1 },

  zoomBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
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
