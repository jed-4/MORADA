/**
 * Plain text from a stored message.
 *
 * Messages keep mentions as markup — `@[Jed Smith](userId:abc-123)` — which is
 * what the renderers turn into chips. Anywhere the message is shown as plain
 * text instead (a preview in the header panel, a task title taken from a
 * message) that markup has to come off first, or the id shows up in the middle
 * of the sentence.
 *
 * Shared because there are now two callers, and a second copy of a regex is
 * how two places end up disagreeing about what a mention looks like.
 */
export function stripMentionMarkup(content: string): string {
  return content.replace(/@\[([^\]]+)\]\(userId:[^)]+\)/g, "@$1");
}
