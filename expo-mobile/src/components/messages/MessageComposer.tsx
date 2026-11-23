import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Image, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Megaphone, Paperclip, Pencil, SendHorizontal, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { haptic } from '../../lib/haptics';
import { Avatar } from '../kit';
import { useToast } from '../ui/Toast';
import { metrics, radii, size, space, type, useColors, type Theme } from '../../theme';
import { markupToDisplay, extractMentions, displayToMarkup, type PendingMention } from './mentions';
import type { Message } from './types';

// The message composer: attach button + input + send/save button, with the
// mention autocomplete list, the "Editing message" bar, and the staged-image
// strip stacked above it. Owns its own draft state (text, staged images,
// pending mentions); the screen owns editingMessage and the send/save actions.

/** An image chosen from the library but not yet uploaded. */
export interface PendingImage {
  uri: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface MentionUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function userDisplayName(u: MentionUser): string {
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || u.email || 'Unknown';
}

const MAX_IMAGES = 4;

interface MessageComposerProps {
  theme: Theme;
  /** Non-null puts the composer in edit mode (prefilled text, checkmark button). */
  editingMessage: Message | null;
  mentionUsers: MentionUser[];
  onSend: (markup: string, images: PendingImage[]) => void;
  onSaveEdit: (markup: string) => void;
  onCancelEdit: () => void;
  /**
   * Fires as the draft becomes non-empty/empty so the screen can broadcast
   * typing state. Never fires while editing — an edit prefills the input, which
   * would otherwise announce "typing" the instant the edit bar opens.
   */
  onTypingChange?: (typing: boolean) => void;
}

export function MessageComposer({
  theme,
  editingMessage,
  mentionUsers,
  onSend,
  onSaveEdit,
  onCancelEdit,
  onTypingChange,
}: MessageComposerProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  void theme;
  const toast = useToast();
  const [messageText, setMessageText] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [pendingMentions, setPendingMentions] = useState<PendingMention[]>([]);
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);

  const editingId = editingMessage?.id ?? null;

  // Entering edit mode prefills the draft from the message; leaving it clears
  // the composer (matches Phase 1: the pre-edit draft is not restored).
  useEffect(() => {
    if (editingMessage) {
      setMessageText(markupToDisplay(editingMessage.content));
      setPendingMentions(extractMentions(editingMessage.content));
      setPendingImages([]);
    } else {
      setMessageText('');
      setPendingMentions([]);
    }
    setMentionActive(false);
    // Re-seed only when the edit target itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // ── Mention autocomplete (display<->markup technique from TaskComments) ──

  const onChangeInput = useCallback((text: string) => {
    setMessageText(text);
    if (!editingMessage) onTypingChange?.(text.trim().length > 0);
    const atMatch = text.match(/(?:^|\s)@([\w'-]*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionQuery(atMatch[1] || '');
      setMentionStart(text.length - (atMatch[1]?.length || 0) - 1);
    } else {
      setMentionActive(false);
    }
  }, []);

  const filteredMentionUsers = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.toLowerCase();
    return mentionUsers
      .filter(u => userDisplayName(u).toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .slice(0, 4);
  }, [mentionActive, mentionQuery, mentionUsers]);

  const broadcastOptions = useMemo(() => {
    if (!mentionActive) return [];
    const all = ['channel', 'here'] as const;
    return all.filter(t => t.startsWith(mentionQuery.toLowerCase()));
  }, [mentionActive, mentionQuery]);

  const pickMention = useCallback((u: MentionUser) => {
    haptic.select();
    const name = userDisplayName(u);
    const display = `@${name}`;
    const markup = `@[${name}](userId:${u.id})`;
    setMessageText(prev => `${prev.slice(0, mentionStart)}${display} `);
    setPendingMentions(prev => (prev.some(m => m.markup === markup) ? prev : [...prev, { display, markup }]));
    setMentionActive(false);
  }, [mentionStart]);

  // @channel / @here need no markup — the server parses the plain text.
  const pickBroadcast = useCallback((token: 'channel' | 'here') => {
    haptic.select();
    setMessageText(prev => `${prev.slice(0, mentionStart)}@${token} `);
    setMentionActive(false);
  }, [mentionStart]);

  // ── Staged images ──

  const pickImages = useCallback(async () => {
    haptic.light();
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        toast.error('Photo library access is needed to attach images');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES,
      });
      if (!result.canceled && result.assets.length > 0) {
        setPendingImages(prev =>
          [...prev, ...result.assets.map(a => ({
            uri: a.uri,
            fileName: a.fileName || undefined,
            fileSize: a.fileSize || undefined,
            mimeType: a.mimeType || undefined,
          }))].slice(0, MAX_IMAGES)
        );
      }
    } catch {
      toast.error('Could not open the photo library');
    }
  }, [toast]);

  const removePendingImage = useCallback((index: number) => {
    haptic.select();
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── Submit ──

  const submit = useCallback(() => {
    const markup = displayToMarkup(messageText.trim(), pendingMentions);
    if (editingMessage) {
      if (!markup) return;
      onSaveEdit(markup);
      return;
    }
    if (!markup && pendingImages.length === 0) return;
    onSend(markup, pendingImages);
    setMessageText('');
    setPendingImages([]);
    setPendingMentions([]);
    setMentionActive(false);
    onTypingChange?.(false);
  }, [messageText, pendingMentions, pendingImages, editingMessage, onSend, onSaveEdit, onTypingChange]);

  const canSend = editingMessage
    ? !!messageText.trim()
    : !!messageText.trim() || pendingImages.length > 0;

  return (
    <>
      {/* Mention suggestions */}
      {mentionActive && (broadcastOptions.length > 0 || filteredMentionUsers.length > 0) && (
        <ScrollView style={[styles.mentionList, { backgroundColor: c.surface, borderColor: c.border }]} keyboardShouldPersistTaps="handled">
          {broadcastOptions.map(token => (
            <Pressable
              key={token}
              style={({ pressed }) => [styles.mentionItem, { borderBottomColor: c.border, opacity: pressed ? metrics.pressedOpacity : 1 }]}
              onPress={() => pickBroadcast(token)}
            >
              <View style={[styles.mentionIcon, { backgroundColor: c.greyFill }]}>
                <Megaphone size={size.icon.meta} color={c.icon} strokeWidth={metrics.iconStroke} />
              </View>
              <Text style={[type.body, { color: c.text }]}>@{token}</Text>
              <Text style={[type.caption, styles.mentionHint, { color: c.muted }]} numberOfLines={1}>
                {token === 'channel' ? 'Everyone in the channel' : 'Everyone active now'}
              </Text>
            </Pressable>
          ))}
          {filteredMentionUsers.map(u => {
            const name = userDisplayName(u);
            return (
              <Pressable
                key={u.id}
                style={({ pressed }) => [styles.mentionItem, { borderBottomColor: c.border, opacity: pressed ? metrics.pressedOpacity : 1 }]}
                onPress={() => pickMention(u)}
              >
                <Avatar name={name} />
                <Text style={[type.body, { color: c.text }]}>{name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={[styles.bar, { backgroundColor: c.bg, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, metrics.composer.padY) }]}>
        {/* Editing banner */}
        {editingMessage && (
          <View style={styles.editBanner}>
            <Pencil size={size.icon.meta} color={c.muted} strokeWidth={metrics.iconStroke} />
            <Text style={[type.caption, styles.flex, { color: c.muted }]}>Editing message</Text>
            <Pressable hitSlop={metrics.hitSlop} onPress={onCancelEdit} accessibilityRole="button">
              <Text style={[type.meta, { color: c.accent }]}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Staged image previews */}
        {pendingImages.length > 0 && !editingMessage && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewStripContent} style={styles.previewStrip}>
            {pendingImages.map((img, i) => (
              <View key={`${img.uri}-${i}`}>
                <Image source={{ uri: img.uri }} style={[styles.previewImage, { backgroundColor: c.greyFill }]} />
                <Pressable
                  hitSlop={metrics.hitSlop}
                  style={[styles.previewRemove, { backgroundColor: c.text }]}
                  onPress={() => removePendingImage(i)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                >
                  <X size={size.icon.caret} color={c.surface} strokeWidth={metrics.iconStrokeActive} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Input: attach · text · send, in one white box (design ChatInput). */}
        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          {!editingMessage ? (
            <Pressable onPress={pickImages} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Attach photos">
              <Paperclip size={metrics.composer.icon} color={c.icon} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}
          <TextInput
            style={[type.body, styles.input, { color: c.text }]}
            placeholder="Message"
            placeholderTextColor={c.faint}
            value={messageText}
            onChangeText={onChangeInput}
            multiline
            maxLength={4000}
            accessibilityLabel="Message"
          />
          <Pressable onPress={submit} disabled={!canSend} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={editingMessage ? 'Save edit' : 'Send'}>
            {editingMessage ? (
              <Check size={metrics.composer.icon} color={canSend ? c.accent : c.faint} strokeWidth={metrics.iconStrokeActive} />
            ) : (
              <SendHorizontal size={metrics.composer.icon} color={canSend ? c.accent : c.faint} strokeWidth={metrics.iconStroke} />
            )}
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mentionList: { borderTopWidth: size.border, maxHeight: metrics.composer.mentionMax },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.rowGap,
    paddingHorizontal: space.screenX,
    paddingVertical: space.inline + space.inlineSm,
    borderBottomWidth: size.border,
  },
  mentionIcon: { width: metrics.avatar.row.size, height: metrics.avatar.row.size, borderRadius: metrics.avatar.row.size / 2, alignItems: 'center', justifyContent: 'center' },
  mentionHint: { marginLeft: 'auto', flexShrink: 1 },
  bar: { paddingHorizontal: space.screenX, paddingTop: metrics.composer.padY, borderTopWidth: size.border, gap: space.inline },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  previewStrip: { flexGrow: 0 },
  previewStripContent: { gap: space.inline, paddingTop: space.inlineSm },
  previewImage: { width: metrics.composer.previewSize, height: metrics.composer.previewSize, borderRadius: radii.lg },
  previewRemove: {
    position: 'absolute',
    top: -space.inlineSm,
    right: -space.inlineSm,
    width: metrics.badge.height,
    height: metrics.badge.height,
    borderRadius: metrics.badge.height / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    minHeight: metrics.composer.height,
    borderRadius: radii.lg,
    borderWidth: size.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.composer.gap,
    paddingLeft: metrics.composer.padLeft,
    paddingRight: metrics.composer.padRight,
  },
  input: { flex: 1, paddingTop: space.inline, paddingBottom: space.inline, maxHeight: metrics.composer.inputMax },
});
