/**
 * Turn the URLs inside a run of plain message text into links.
 *
 * Messages are stored as plain text, so a pasted link arrived as characters and
 * stayed characters — you had to select it and copy it out to follow it. Both
 * message renderers already split text up to pick out mentions and @channel;
 * this is the same idea applied to the runs left over between them, so it slots
 * in at the leaf rather than needing either renderer restructured.
 *
 * Kept in one module because there are two renderers — the dropdown in the
 * header and the full page — and two copies of this would drift apart the way
 * their mention handling already has.
 */

/**
 * Matches http(s):// links and bare www. ones.
 *
 * Trailing punctuation is deliberately excluded: people end sentences after a
 * link, and "see example.com/plans." should not link the full stop. Brackets
 * are excluded for the same reason, with the exception that a closing bracket
 * is allowed inside the path so wiki-style URLs survive.
 */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Punctuation that reads as sentence punctuation rather than part of a link. */
const TRAILING = /[.,;:!?)\]}'"]+$/;

export function splitTrailingPunctuation(raw: string): [string, string] {
  const match = raw.match(TRAILING);
  if (!match) return [raw, ""];
  // A closing bracket that has an opening one inside the URL belongs to it.
  let url = raw.slice(0, raw.length - match[0].length);
  let tail = match[0];
  if (tail.startsWith(")") && (url.match(/\(/g)?.length ?? 0) > (url.match(/\)/g)?.length ?? 0)) {
    url += ")";
    tail = tail.slice(1);
  }
  return [url, tail];
}

/** The href to actually navigate to — a bare www. link needs a scheme. */
export function hrefFor(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Render `text`, linking any URLs in it. Returns an array so it drops straight
 * into the part lists both renderers already build.
 */
export function renderTextWithLinks(
  text: string,
  keyPrefix: string,
): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_PATTERN.lastIndex = 0;

  while ((m = URL_PATTERN.exec(text)) !== null) {
    const [url, tail] = splitTrailingPunctuation(m[0]);
    if (!url) continue;
    if (m.index > last) out.push(text.substring(last, m.index));
    out.push(
      <a
        key={`${keyPrefix}-url-${m.index}`}
        href={hrefFor(url)}
        target="_blank"
        // noopener/noreferrer: the message could have come from anyone, and
        // without it the opened page gets a handle on this one.
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
        // A link inside a message lives on a row that selects a channel or
        // opens a thread; following it should not do that too.
        onClick={(e) => e.stopPropagation()}
        data-testid="message-link"
      >
        {url}
      </a>,
    );
    if (tail) out.push(tail);
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(text.substring(last));
  return out.length > 0 ? out : [text];
}
