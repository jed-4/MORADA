import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { FileText, X } from 'lucide-react-native';
import { getAuthedImageSource } from '../../services/api';
import { haptic } from '../../lib/haptics';
import { metrics, radii, size, space, tabular, type, useColors, type Theme } from '../../theme';
import { Avatar } from '../kit';
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
  /** Open a non-image attachment (PDF etc.). They used to be a bare file name
   *  with no tap target, so a PDF sent in chat couldn't be opened on the phone. */
  onPressFile?: (att: MessageAttachment) => void;
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
  onPressFile,
}: MessageBubbleProps) {
  const c = useColors();
  void theme;
  const isTemp = !!(msg.pending || msg.failed);
  const imageAttachments = (msg.attachments || []).filter(isImageAttachment);
  const otherAttachments = (msg.attachments || []).filter(a => !isImageAttachment(a));
  const hasText = msg.content.trim().length > 0;
  // Revamp (D07): flat rows — avatar · name + time / body. Everyone on the
  // left; your own name reads "You". Follow-ups from the same sender hang
  // under the first without repeating the header.
  const name = isMe ? 'You' : senderName;

  return (
    <View style={[styles.row, isFirstFromSender && styles.rowFirst]}>
      <View style={styles.avatarCol}>
        {isFirstFromSender ? <Avatar name={senderName} size="duo" /> : null}
      </View>
      <View style={styles.body}>
        {isFirstFromSender ? (
          <View style={styles.head}>
            <Text style={[type.metaSemi, { color: c.text }]}>{name}</Text>
            <Text style={[type.caption, tabular, { color: c.muted }]}>
              {msg.pending ? (msg.uploadStatus || 'Sending…') : formatTime(msg.createdAt)}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={msg.failed ? () => onRetry(msg) : undefined}
          onLongPress={isTemp ? undefined : () => { haptic.light(); onLongPress(msg); }}
          delayLongPress={metrics.longPressMs}
          style={[styles.content, isTemp && styles.unsent]}
        >
          {/* Local (still-uploading) images on optimistic temps */}
          {(msg.localUris || []).map((uri, i) => (
            <Image key={`local-${i}`} source={{ uri }} style={[styles.image, { backgroundColor: c.greyFill }]} resizeMode="cover" />
          ))}
          {/* Server attachments */}
          {imageAttachments.map(att => (
            <Pressable key={att.id} onPress={() => onPressImage(att)} disabled={isTemp}>
              <Image source={getAuthedImageSource(att.fileUrl)} style={[styles.image, { backgroundColor: c.greyFill }]} resizeMode="cover" />
            </Pressable>
          ))}
          {otherAttachments.map(att => (
            <Pressable
              key={att.id}
              style={[styles.file, { backgroundColor: c.surface, borderColor: c.border }]}
              onPress={() => onPressFile?.(att)}
              disabled={isTemp || !onPressFile}
              accessibilityRole="button"
              accessibilityLabel={`Open ${att.fileName}`}
            >
              <FileText size={size.icon.row} color={c.icon} strokeWidth={metrics.iconStroke} />
              <Text style={[type.body, styles.fileName, { color: c.link }]} numberOfLines={1}>{att.fileName}</Text>
            </Pressable>
          ))}
          {hasText && <MessageContent content={msg.content} isOwn={isMe} theme={theme} />}
          {msg.isEdited ? <Text style={[type.caption, { color: c.muted }]}>edited</Text> : null}
        </Pressable>

        <ReactionPills
          reactions={reactions}
          currentUserId={currentUserId}
          alignRight={false}
          theme={theme}
          onToggle={emoji => onToggleReaction(msg, emoji)}
        />

        {isMe && msg.failed ? (
          <View style={styles.failed}>
            <Pressable hitSlop={metrics.hitSlop} onPress={() => onRetry(msg)} accessibilityRole="button">
              <Text style={[type.caption, { color: c.danger }]}>Didn't send. Tap to retry</Text>
            </Pressable>
            <Pressable hitSlop={metrics.hitSlop} onPress={() => onDiscard(msg.id)} accessibilityRole="button" accessibilityLabel="Discard message">
              <X size={size.icon.meta} color={c.danger} strokeWidth={metrics.iconStroke} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const M = metrics.messages;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: M.msgGap, paddingTop: space.inlineSm },
  rowFirst: { paddingTop: M.msgGap },
  avatarCol: { width: metrics.avatar.duo.size },
  body: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.inline, marginBottom: metrics.listRow.bodyGap },
  content: { gap: space.inline, alignSelf: 'stretch' },
  unsent: { opacity: metrics.disabledOpacity },
  image: { width: M.attachW, height: M.attachH, borderRadius: radii.lg },
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    alignSelf: 'flex-start',
    maxWidth: M.attachW + space.screenBottom * 2,
    paddingHorizontal: space.cardX,
    paddingVertical: space.inline,
    borderRadius: radii.lg,
    borderWidth: size.border,
  },
  fileName: { flexShrink: 1 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: space.inline, marginTop: space.inlineSm },
});
