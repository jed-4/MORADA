import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, Platform, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getInitials } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { PressableScale } from '../ui/PressableScale';
import { useToast } from '../ui/Toast';
import type { Theme } from '../../theme';
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
        <View style={[styles.mentionList, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {broadcastOptions.map(token => (
            <PressableScale
              key={token}
              style={[styles.mentionItem, { borderBottomColor: theme.border }]}
              onPress={() => pickBroadcast(token)}
            >
              <View style={[styles.mentionAvatar, { backgroundColor: theme.primary + '30' }]}>
                <Ionicons name="megaphone-outline" size={13} color={theme.primary} />
              </View>
              <Text style={[styles.mentionName, { color: theme.textPrimary }]}>@{token}</Text>
              <Text style={[styles.mentionHint, { color: theme.textMuted }]}>
                {token === 'channel' ? 'Notify all channel members' : 'Notify active members'}
              </Text>
            </PressableScale>
          ))}
          {filteredMentionUsers.map(u => {
            const name = userDisplayName(u);
            return (
              <PressableScale
                key={u.id}
                style={[styles.mentionItem, { borderBottomColor: theme.border }]}
                onPress={() => pickMention(u)}
              >
                <View style={[styles.mentionAvatar, { backgroundColor: theme.primary + '30' }]}>
                  <Text style={[styles.mentionInitials, { color: theme.primary }]}>{getInitials(name)}</Text>
                </View>
                <Text style={[styles.mentionName, { color: theme.textPrimary }]}>{name}</Text>
              </PressableScale>
            );
          })}
        </View>
      )}

      {/* Editing banner */}
      {editingMessage && (
        <View style={[styles.editBanner, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Ionicons name="pencil" size={13} color={theme.primary} />
          <Text style={[styles.editBannerText, { color: theme.textSecondary }]}>Editing message</Text>
          <Pressable hitSlop={8} onPress={onCancelEdit} style={styles.editBannerClose}>
            <Text style={[styles.editBannerCancel, { color: theme.primary }]}>Cancel</Text>
          </Pressable>
        </View>
      )}

      {/* Staged image previews */}
      {pendingImages.length > 0 && !editingMessage && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.previewStrip, { backgroundColor: theme.card, borderTopColor: theme.border }]}
          contentContainerStyle={styles.previewStripContent}
        >
          {pendingImages.map((img, i) => (
            <View key={`${img.uri}-${i}`} style={styles.previewWrap}>
              <Image source={{ uri: img.uri }} style={styles.previewImage} />
              <Pressable
                hitSlop={6}
                style={[styles.previewRemove, { backgroundColor: theme.textPrimary }]}
                onPress={() => removePendingImage(i)}
              >
                <Ionicons name="close" size={12} color={theme.card} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        {!editingMessage && (
          <PressableScale style={styles.attachBtn} onPress={pickImages}>
            <Ionicons name="image-outline" size={22} color={theme.primary} />
          </PressableScale>
        )}
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border }]}
          placeholder="Message..."
          placeholderTextColor={theme.textMuted}
          value={messageText}
          onChangeText={onChangeInput}
          multiline
          maxLength={4000}
        />
        <PressableScale
          style={[styles.sendBtn, { backgroundColor: canSend ? theme.primary : theme.border }]}
          onPress={submit}
          disabled={!canSend}
        >
          <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={18} color="#ffffff" />
        </PressableScale>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  mentionList: { borderTopWidth: 1, maxHeight: 240 },
  mentionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mentionAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mentionInitials: { fontSize: 11, fontWeight: '700' },
  mentionName: { fontSize: 14, fontWeight: '500' },
  mentionHint: { fontSize: 12, marginLeft: 'auto' },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  editBannerText: { fontSize: 12, fontWeight: '600' },
  editBannerClose: { marginLeft: 'auto' },
  editBannerCancel: { fontSize: 13, fontWeight: '600' },
  previewStrip: { borderTopWidth: 1, flexGrow: 0 },
  previewStripContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  previewWrap: { position: 'relative' },
  previewImage: { width: 56, height: 56, borderRadius: 8 },
  previewRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    borderTopWidth: 1,
    gap: 10,
  },
  attachBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
