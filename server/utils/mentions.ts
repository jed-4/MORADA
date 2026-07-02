// Shared helpers for the rich-text @mention markup used across chat messages,
// notes, and site-diary content. Mentions are stored inline as
// `@[Display Name](userId:<uuid>)`. These helpers are the single source of
// truth for extracting the mentioned user ids and for turning the markup back
// into human-readable text for notification previews.

const MENTION_REGEX = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;

/** Extract the unique user ids referenced by @mentions in a piece of text. */
export function parseMentionUserIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match[2]) ids.push(match[2]);
  }
  return Array.from(new Set(ids));
}

/** Replace `@[Name](userId:x)` markup with a plain `@Name` for previews. */
export function stripMentionMarkup(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(MENTION_REGEX, "@$1");
}

/**
 * Build a short, single-line preview of message/note content suitable for a
 * push notification body. Strips mention markup and basic HTML tags, collapses
 * whitespace, and truncates.
 */
export function buildContentPreview(
  text: string | null | undefined,
  maxLength = 140,
): string {
  if (!text) return "";
  const plain = stripMentionMarkup(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength - 1).trimEnd() + "…";
}
