import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { Theme } from '../../theme';
import { MENTION_MARKUP } from './mentions';

// Renders message content, converting @[Name](userId:x) markup into styled
// inline mention chips and highlighting @channel / @here broadcast tokens.
// Own-message bubbles sit on plum, so mentions there use a light lavender
// tint instead of the primary colour.

const BROADCAST_REGEX = /@(channel|here)\b/g;

interface SegmentStyle {
  base: StyleProp<TextStyle>;
  mention: StyleProp<TextStyle>;
}

function pushBroadcastSegments(
  parts: ReactNode[],
  text: string,
  keyPrefix: string,
  style: SegmentStyle,
) {
  BROADCAST_REGEX.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = BROADCAST_REGEX.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <Text key={`${keyPrefix}-bc-${i++}`} style={style.mention}>
        @{match[1]}
      </Text>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
}

export function MessageContent({
  content,
  isOwn,
  theme,
}: {
  content: string;
  isOwn: boolean;
  theme: Theme;
}) {
  const baseStyle: StyleProp<TextStyle> = {
    color: isOwn ? '#FFFFFF' : theme.textPrimary,
    fontSize: 15,
    lineHeight: 20,
  };
  const mentionStyle: StyleProp<TextStyle> = isOwn
    ? { color: '#EFE6F9', fontWeight: '700' }
    : { color: theme.primary, fontWeight: '600' };
  const style: SegmentStyle = { base: baseStyle, mention: mentionStyle };

  const parts: ReactNode[] = [];
  MENTION_MARKUP.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    if (match.index > lastIndex) {
      pushBroadcastSegments(parts, content.slice(lastIndex, match.index), `seg-${key}`, style);
    }
    parts.push(
      <Text key={`m-${key++}`} style={mentionStyle}>
        @{match[1]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    pushBroadcastSegments(parts, content.slice(lastIndex), `seg-end`, style);
  }

  return <Text style={baseStyle}>{parts.length > 0 ? parts : content}</Text>;
}
