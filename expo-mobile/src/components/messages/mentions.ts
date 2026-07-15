// Mention markup helpers — the display<->markup round-trip technique used by
// TaskComments: the TextInput always shows friendly "@Name" text while a
// pendingMentions list remembers the @[Name](userId:x) markup each display
// string maps to; on send/save the display text is converted back to markup.

export const MENTION_MARKUP = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;

/** A mention the composer is tracking: what the input shows vs what gets sent. */
export interface PendingMention {
  display: string; // "@Jed Smith"
  markup: string;  // "@[Jed Smith](userId:abc-123)"
}

/** Convert @[Name](userId:x) markup to readable "@Name" text (for input seeding). */
export function markupToDisplay(content: string): string {
  return content.replace(MENTION_MARKUP, '@$1');
}

/** Extract the mentions present in markup content (for edit round-tripping). */
export function extractMentions(content: string): PendingMention[] {
  const mentions: PendingMention[] = [];
  MENTION_MARKUP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    mentions.push({ display: `@${match[1]}`, markup: match[0] });
  }
  return mentions;
}

/** Convert display text back to markup using the tracked mention list. */
export function displayToMarkup(text: string, mentions: PendingMention[]): string {
  // Longest display names first so "@Jo Smith" isn't clobbered by "@Jo".
  const sorted = [...mentions].sort((a, b) => b.display.length - a.display.length);
  let result = text;
  for (const m of sorted) {
    result = result.split(m.display).join(m.markup);
  }
  return result;
}

/** Extract the mentioned userIds from markup content (sent as the `mentions` array). */
export function extractMentionIds(content: string): string[] {
  const ids: string[] = [];
  MENTION_MARKUP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    ids.push(match[2]);
  }
  return ids;
}
