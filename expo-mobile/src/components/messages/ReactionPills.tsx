import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radii, size, space, tabular, type, useColors, type Theme } from '../../theme';
import type { MessageReaction } from './types';

// Grouped reaction pills under a message bubble (icon + count, highlighted
// when the current user reacted; tap toggles). Icon-based to match the web's
// design guidelines (no raw emoji).
//
// Server enum (server/routes.ts VALID_EMOJIS): thumbs_up | check | eyes |
// heart | smile | fire.

export const REACTION_OPTIONS: { id: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: 'thumbs_up', icon: 'thumbs-up', label: 'Thumbs up' },
  { id: 'check', icon: 'checkmark-circle', label: 'Got it' },
  { id: 'eyes', icon: 'eye', label: 'Looking' },
  { id: 'heart', icon: 'heart', label: 'Love' },
  { id: 'smile', icon: 'happy', label: 'Laugh' },
  { id: 'fire', icon: 'flame', label: 'Fire' },
];

export function reactionIcon(id: string): keyof typeof Ionicons.glyphMap {
  return REACTION_OPTIONS.find(r => r.id === id)?.icon ?? 'ellipse';
}

interface ReactionPillsProps {
  reactions: MessageReaction[];
  currentUserId?: string;
  /** Align pills right under own messages. */
  alignRight: boolean;
  theme: Theme;
  onToggle: (emoji: string) => void;
}

export function ReactionPills({ reactions, currentUserId, alignRight, theme, onToggle }: ReactionPillsProps) {
  const c = useColors();
  void theme;
  if (!reactions || reactions.length === 0) return null;

  // Group by emoji id, preserving the server enum order.
  const groups = REACTION_OPTIONS
    .map(opt => {
      const forEmoji = reactions.filter(r => r.emoji === opt.id);
      return {
        id: opt.id,
        icon: opt.icon,
        count: forEmoji.length,
        mine: !!currentUserId && forEmoji.some(r => r.userId === currentUserId),
      };
    })
    .filter(g => g.count > 0);

  if (groups.length === 0) return null;

  return (
    <View style={[styles.row, alignRight && styles.rowRight]}>
      {groups.map(g => (
        <Pressable
          key={g.id}
          onPress={() => onToggle(g.id)}
          hitSlop={4}
          style={[
            styles.pill,
            g.mine
              ? { backgroundColor: c.tint, borderColor: c.accent }
              : { backgroundColor: c.surface, borderColor: c.border },
          ]}
        >
          <Ionicons name={g.icon} size={size.icon.caret} color={g.mine ? c.accent : c.icon} />
          <Text style={[type.caption, tabular, { color: g.mine ? c.link : c.muted }]}>
            {g.count}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.inlineSm, marginTop: space.inlineSm },
  rowRight: { justifyContent: 'flex-end' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inlineSm,
    paddingHorizontal: space.inline,
    paddingVertical: space.inlineSm / 2,
    borderRadius: radii.pill,
    borderWidth: size.border,
  },
});
