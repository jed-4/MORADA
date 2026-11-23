import { forwardRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Copy, Pencil, Pin, PinOff, Trash2, type LucideIcon } from 'lucide-react-native';
import { ButtonRow, Card, ListRow, SecondaryButton, SheetBody, TextButton } from '../kit';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { haptic } from '../../lib/haptics';
import { REACTION_OPTIONS } from './ReactionPills';
import { metrics, size, type, useColors, type Theme } from '../../theme';
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
    const c = useColors();
    const row = (Glyph: LucideIcon, label: string, onPress: () => void, danger?: boolean) => (
      <ListRow
        key={label}
        lead={<Glyph size={size.icon.row} color={danger ? c.danger : c.icon} strokeWidth={metrics.iconStroke} />}
        title={label}
        danger={danger}
        onPress={onPress}
      />
    );
    return (
      <Sheet ref={ref} onDismiss={onDismiss}>
        <SheetBody>
          {/* Reaction row: soft circles, the ones you've used tinted. */}
          <View style={styles.reactionRow}>
            {REACTION_OPTIONS.map(opt => {
              const mine = reactions.some(r => r.emoji === opt.id && r.userId === currentUserId);
              return (
                <Pressable
                  key={opt.id}
                  style={({ pressed }) => [
                    styles.reactionBtn,
                    { backgroundColor: mine ? c.tint : c.surface, borderColor: mine ? c.accent : c.border, opacity: pressed ? metrics.pressedOpacity : 1 },
                  ]}
                  onPress={() => onReact(opt.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine }}
                >
                  <Ionicons name={opt.icon} size={size.icon.header} color={mine ? c.accent : c.icon} />
                </Pressable>
              );
            })}
          </View>

          {confirmingDelete && isOwn ? (
            <View style={styles.confirm}>
              <Text style={[type.body, { color: c.text }]}>Delete this message? This can't be undone.</Text>
              <ButtonRow>
                <SecondaryButton label="Cancel" onPress={onCancelDelete} />
                <View style={styles.confirmDelete}>
                  <TextButton label="Delete message" icon={Trash2} tone="danger" center onPress={onConfirmDelete} />
                </View>
              </ButtonRow>
            </View>
          ) : (
            <Card variant="list">
              {message?.content?.trim() ? row(Copy, 'Copy', onCopy) : null}
              {isOwn ? row(Pencil, 'Edit', onEdit) : null}
              {canPin ? row(message?.isPinned ? PinOff : Pin, message?.isPinned ? 'Unpin' : 'Pin', onTogglePin) : null}
              {isOwn ? row(Trash2, 'Delete', () => { haptic.warning(); onRequestDelete(); }, true) : null}
            </Card>
          )}
        </SheetBody>
      </Sheet>
    );
  }
);

const styles = StyleSheet.create({
  reactionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  reactionBtn: {
    width: metrics.minHit,
    height: metrics.minHit,
    borderRadius: metrics.minHit / 2,
    borderWidth: size.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { gap: metrics.sheet.gap },
  confirmDelete: { flex: 1, justifyContent: 'center' },
});
