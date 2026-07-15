import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuthedImageSource } from '../../services/api';
import { getInitials } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import type { Theme } from '../../theme';
import { MessageContent } from './MessageContent';
import { ReactionPills } from './ReactionPills';
import type { Message, MessageAttachment, MessageReaction } from './types';

// A single message row in the thread: avatar column, sender header, bubble
// (text + image attachments), reaction pills, and pending/failed states.
// Extracted from MessageThreadScreen to keep the screen maintainable.

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return `Yesterday ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return d.toLocaleDateString('en-AU', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function isImageAttachment(att: MessageAttachment): boolean {
  if (att.mimeType) return att.mimeType.startsWith('image/');
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(att.fileName || '');
}

interface MessageBubbleProps {
  msg: Message;
  isMe: boolean;
  isFirstFromSender: boolean;
  senderName: string;
  reactions: MessageReaction[];
  currentUserId?: string;
  theme: Theme;
  onLongPress: (msg: Message) => void;
  onToggleReaction: (msg: Message, emoji: string) => void;
  onRetry: (msg: Message) => void;
  onDiscard: (id: string) => void;
  onPressImage: (att: MessageAttachment) => void;
}

export const MessageBubble = memo(function MessageBubble({
  msg,
  isMe,
  isFirstFromSender,
  senderName,
  reactions,
  currentUserId,
  theme,
  onLongPress,
  onToggleReaction,
  onRetry,
  onDiscard,
  onPressImage,
}: MessageBubbleProps) {
  const initials = getInitials(senderName);
  const isTemp = !!(msg.pending || msg.failed);
  const imageAttachments = (msg.attachments || []).filter(isImageAttachment);
  const otherAttachments = (msg.attachments || []).filter(a => !isImageAttachment(a));
  const hasText = msg.content.trim().length > 0;

  return (
    <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
      {!isMe && (
        <View style={styles.avatarCol}>
          {isFirstFromSender ? (
            <View style={[styles.avatar, { backgroundColor: theme.primary + '30' }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>{initials}</Text>
            </View>
          ) : (
            <View style={styles.avatarPlaceholder} />
          )}
        </View>
      )}
      <View style={[styles.bubbleCol, isMe && styles.bubbleColMe]}>
        {isFirstFromSender && !isMe && (
          <View style={styles.senderRow}>
            <Text style={[styles.senderName, { color: theme.textSecondary }]}>{senderName}</Text>
            <Text style={[styles.messageTime, { color: theme.textMuted }]}>{formatTime(msg.createdAt)}</Text>
          </View>
        )}
        <Pressable
          onPress={msg.failed ? () => onRetry(msg) : undefined}
          onLongPress={isTemp ? undefined : () => { haptic.light(); onLongPress(msg); }}
          delayLongPress={300}
          style={[
            styles.bubble,
            isMe
              ? [styles.bubbleMe, { backgroundColor: theme.primary }]
              : [styles.bubbleOther, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }],
            (msg.pending || msg.failed) && styles.bubbleUnsent,
          ]}
        >
          {/* Local (still-uploading) images on optimistic temps */}
          {(msg.localUris || []).map((uri, i) => (
            <Image key={`local-${i}`} source={{ uri }} style={styles.attachmentImage} resizeMode="cover" />
          ))}
          {/* Server attachments */}
          {imageAttachments.map(att => (
            <Pressable key={att.id} onPress={() => onPressImage(att)} disabled={isTemp}>
              <Image
                source={getAuthedImageSource(att.fileUrl)}
                style={styles.attachmentImage}
                resizeMode="cover"
              />
            </Pressable>
          ))}
          {otherAttachments.map(att => (
            <View key={att.id} style={styles.fileRow}>
              <Ionicons name="document-outline" size={15} color={isMe ? '#FFFFFF' : theme.textSecondary} />
              <Text style={[styles.fileName, { color: isMe ? '#FFFFFF' : theme.textPrimary }]} numberOfLines={1}>
                {att.fileName}
              </Text>
            </View>
          ))}
          {hasText && <MessageContent content={msg.content} isOwn={isMe} theme={theme} />}
          {msg.isEdited ? (
            <Text style={[styles.editedTag, { color: isMe ? 'rgba(255,255,255,0.7)' : theme.textMuted }]}>
              (edited)
            </Text>
          ) : null}
        </Pressable>

        <ReactionPills
          reactions={reactions}
          currentUserId={currentUserId}
          alignRight={isMe}
          theme={theme}
          onToggle={emoji => onToggleReaction(msg, emoji)}
        />

        {isMe && (
          msg.failed ? (
            <View style={styles.failedRow}>
              <Pressable hitSlop={8} onPress={() => onRetry(msg)}>
                <Text style={[styles.failedText, { color: theme.statusDanger }]}>Failed — tap to retry</Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => onDiscard(msg.id)}>
                <Ionicons name="close-circle" size={15} color={theme.statusDanger} />
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.messageTimeMe, { color: theme.textMuted }]}>
              {msg.pending ? (msg.uploadStatus || 'Sending…') : formatTime(msg.createdAt)}
            </Text>
          )
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, gap: 8 },
  messageRowMe: { justifyContent: 'flex-end' },
  avatarCol: { width: 32, alignItems: 'center', justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700' },
  avatarPlaceholder: { width: 32, height: 32 },
  bubbleCol: { maxWidth: '75%' },
  bubbleColMe: { alignItems: 'flex-end' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  senderName: { fontSize: 12, fontWeight: '600' },
  messageTime: { fontSize: 11 },
  messageTimeMe: { fontSize: 11, marginTop: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleUnsent: { opacity: 0.55 },
  // ~70% of the bubble's max width on a typical phone
  attachmentImage: { width: 200, height: 150, borderRadius: 10 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200 },
  fileName: { fontSize: 13, flexShrink: 1 },
  editedTag: { fontSize: 10, marginTop: 1 },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  failedText: { fontSize: 11, fontWeight: '600' },
});
