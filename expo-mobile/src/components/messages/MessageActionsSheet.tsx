import { forwardRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '../ui/PressableScale';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { REACTION_OPTIONS } from './ReactionPills';
import type { Theme } from '../../theme';
import type { Message, MessageReaction } from './types';

// The long-press message menu: reaction row + copy / edit / pin / delete.
// Extracted from MessageThreadScreen so the screen stays maintainable now that
// it also owns pagination, typing, presence and read receipts.

interface MessageActionsSheetProps {
  message: Message | null;
  reactions: MessageReaction[];
  currentUserId?: string;
  isOwn: boolean;
  /**
   * Pin visibility mirrors the server rules (server/storage.ts toggleMessagePin):
   * anyone in the channel may pin, but only the pinner or a channel owner/admin
   * may unpin — so an unpin the user can't perform is never offered.
   */
  canPin: boolean;
  confirmingDelete: boolean;
  theme: Theme;
  onReact: (emoji: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDismiss: () => void;
}

export const MessageActionsSheet = forwardRef<SheetRef, MessageActionsSheetProps>(
  function MessageActionsSheet(
    {
      message,
      reactions,
      currentUserId,
      isOwn,
      canPin,
      confirmingDelete,
      theme,
      onReact,
      onCopy,
      onEdit,
      onTogglePin,
      onRequestDelete,
      onConfirmDelete,
      onCancelDelete,
      onDismiss,
    },
    ref
  ) {
    return (
      <Sheet ref={ref} onDismiss={onDismiss}>
        <View style={styles.menuBody}>
          {/* Reaction row */}
          <View style={styles.reactionRow}>
            {REACTION_OPTIONS.map(opt => {
              const mine = reactions.some(r => r.emoji === opt.id && r.userId === currentUserId);
              return (
                <PressableScale
                  key={opt.id}
                  style={[
                    styles.reactionBtn,
                    mine
                      ? { backgroundColor: theme.primaryLight, borderColor: theme.primary }
                      : { backgroundColor: theme.background, borderColor: theme.border },
                  ]}
                  onPress={() => onReact(opt.id)}
                >
                  <Ionicons name={opt.icon} size={20} color={mine ? theme.primary : theme.textSecondary} />
                </PressableScale>
              );
            })}
          </View>

          {message?.content?.trim() ? (
            <Pressable style={[styles.menuRow, { borderTopColor: theme.border }]} onPress={onCopy}>
              <Ionicons name="copy-outline" size={19} color={theme.textPrimary} />
              <Text style={[styles.menuRowText, { color: theme.textPrimary }]}>Copy</Text>
            </Pressable>
          ) : null}

          {isOwn && (
            <Pressable style={[styles.menuRow, { borderTopColor: theme.border }]} onPress={onEdit}>
              <Ionicons name="pencil-outline" size={19} color={theme.textPrimary} />
              <Text style={[styles.menuRowText, { color: theme.textPrimary }]}>Edit</Text>
            </Pressable>
          )}

          {canPin && (
            <Pressable style={[styles.menuRow, { borderTopColor: theme.border }]} onPress={onTogglePin}>
              <Ionicons
                name={message?.isPinned ? 'remove-circle-outline' : 'pin-outline'}
                size={19}
                color={theme.textPrimary}
              />
              <Text style={[styles.menuRowText, { color: theme.textPrimary }]}>
                {message?.isPinned ? 'Unpin' : 'Pin'}
              </Text>
            </Pressable>
          )}

          {isOwn && (
            confirmingDelete ? (
              <View style={[styles.deleteConfirm, { borderTopColor: theme.border }]}>
                <Text style={[styles.deleteConfirmText, { color: theme.textSecondary }]}>
                  Delete this message? This can't be undone.
                </Text>
                <View style={styles.deleteConfirmActions}>
                  <PressableScale
                    style={[styles.deleteConfirmBtn, { backgroundColor: theme.statusDanger }]}
                    onPress={onConfirmDelete}
                  >
                    <Text style={styles.deleteConfirmBtnText}>Delete</Text>
                  </PressableScale>
                  <PressableScale
                    style={[styles.deleteCancelBtn, { borderColor: theme.border }]}
                    onPress={onCancelDelete}
                  >
                    <Text style={[styles.deleteCancelText, { color: theme.textSecondary }]}>Cancel</Text>
                  </PressableScale>
                </View>
              </View>
            ) : (
              <Pressable
                style={[styles.menuRow, { borderTopColor: theme.border }]}
                onPress={() => {
                  haptic.warning();
                  onRequestDelete();
                }}
              >
                <Ionicons name="trash-outline" size={19} color={theme.statusDanger} />
                <Text style={[styles.menuRowText, { color: theme.statusDanger }]}>Delete</Text>
              </Pressable>
            )
          )}
        </View>
      </Sheet>
    );
  }
);

const styles = StyleSheet.create({
  menuBody: { paddingHorizontal: 20, paddingTop: 4 },
  reactionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  reactionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuRowText: { fontSize: 15, fontWeight: '500' },
  deleteConfirm: { paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  deleteConfirmText: { fontSize: 13 },
  deleteConfirmActions: { flexDirection: 'row', gap: 10 },
  deleteConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  deleteConfirmBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  deleteCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  deleteCancelText: { fontSize: 14, fontWeight: '600' },
});
