import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '../../services/api';
import { shortWhen } from '../../lib/format';
import { haptic } from '../../lib/haptics';
import { Card } from '../kit';
import { ClientBadge } from './ClientBadge';
import { markupToDisplay } from './mentions';
import { fonts, metrics, space, tabular, type, useColors } from '../../theme';

// "Messages" section under the conversation matches while searching: words
// found INSIDE messages, from GET /api/messages/search (only conversations
// you're a member of; every word must appear). Tap a hit to open the thread
// at that message.

export interface MessageSearchHit {
  id: string;
  channelId: string;
  userId?: string | null;
  content: string;
  createdAt: string;
  channelName?: string | null;
  channelType?: 'channel' | 'dm' | string | null;
  channelEmoji?: string | null;
  isClientFacing?: boolean | null;
  userFirstName?: string | null;
  userLastName?: string | null;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;
const M = metrics.messages;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A window of the message around the first matched word, with the words bolded. */
function Snippet({ text, words }: { text: string; words: string[] }) {
  const c = useColors();
  const lower = text.toLowerCase();
  const first = words.reduce((min, w) => {
    const i = lower.indexOf(w);
    return i >= 0 && (min < 0 || i < min) ? i : min;
  }, -1);
  const lead = Math.round(M.snippetChars / 3);
  const start = first > lead ? first - lead : 0;
  const body = text.slice(start, start + M.snippetChars);
  const shown = `${start > 0 ? '…' : ''}${body}${start + M.snippetChars < text.length ? '…' : ''}`;
  const parts: ReactNode[] = [];
  if (words.length) {
    const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi');
    shown.split(re).forEach((part, i) => {
      if (!part) return;
      const hit = words.includes(part.toLowerCase());
      parts.push(
        <Text key={i} style={hit ? { fontFamily: fonts.semibold, color: c.text } : undefined}>
          {part}
        </Text>,
      );
    });
  } else {
    parts.push(shown);
  }
  return (
    <Text style={[type.body, { color: c.muted }]} numberOfLines={2}>
      {parts}
    </Text>
  );
}

export function MessageSearchResults({
  query,
  conversationName,
  renderLead,
  onOpen,
}: {
  query: string;
  /** The list's own name for a conversation (DMs resolve to the person). */
  conversationName: (hit: MessageSearchHit) => string;
  /** The list's own lead (emoji / # / avatar) for that conversation. */
  renderLead: (hit: MessageSearchHit) => ReactNode;
  onOpen: (hit: MessageSearchHit) => void;
}) {
  const c = useColors();
  const q = query.trim();
  const words = useMemo(
    () => Array.from(new Set(q.toLowerCase().split(/\s+/).filter(Boolean))),
    [q],
  );
  const [hits, setHits] = useState<MessageSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [searchedFor, setSearchedFor] = useState('');

  useEffect(() => {
    if (q.length < MIN_CHARS) {
      setHits([]);
      setSearchedFor('');
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch<MessageSearchHit[]>(`/api/messages/search?q=${encodeURIComponent(q)}&limit=50`)
        .then(r => {
          if (cancelled) return;
          setHits(r || []);
          setFailed(false);
          setSearchedFor(q);
        })
        .catch(() => {
          if (cancelled) return;
          setHits([]);
          setFailed(true);
          setSearchedFor(q);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (q.length < MIN_CHARS) return null;

  const sender = (h: MessageSearchHit) => [h.userFirstName, h.userLastName].filter(Boolean).join(' ') || 'Someone';

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[type.meta, { color: c.muted }]}>Messages</Text>
        {searching ? <ActivityIndicator size="small" color={c.muted} /> : null}
      </View>
      {hits.length > 0 ? (
        <Card variant="list">
          {hits.map(h => (
            <Pressable
              key={h.id}
              onPress={() => {
                haptic.light();
                onOpen(h);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Message from ${sender(h)} in ${conversationName(h)}`}
              style={({ pressed }) => [styles.row, { opacity: pressed ? metrics.pressedOpacity : 1 }]}
            >
              <View style={styles.lead}>{renderLead(h)}</View>
              <View style={styles.body}>
                <View style={styles.line}>
                  <Text style={[type.rowTitleStrong, styles.name, { color: c.text }]} numberOfLines={1}>
                    {conversationName(h)}
                  </Text>
                  {h.isClientFacing && h.channelType !== 'dm' ? <ClientBadge /> : null}
                  <Text style={[type.meta, tabular, styles.when, { color: c.muted }]}>{shortWhen(h.createdAt)}</Text>
                </View>
                <Text style={[type.caption, { color: c.muted }]} numberOfLines={1}>{sender(h)}</Text>
                <Snippet text={markupToDisplay(h.content || '')} words={words} />
              </View>
            </Pressable>
          ))}
        </Card>
      ) : !searching && searchedFor === q ? (
        <Text style={[type.body, { color: c.muted }]}>
          {failed ? "Couldn't search messages. Check your connection." : 'No messages match'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.inline },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: metrics.listRow.gap, paddingVertical: metrics.listRow.padY },
  lead: { width: M.lead, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, gap: metrics.listRow.bodyGap },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.inline },
  name: { flexShrink: 1 },
  when: { marginLeft: 'auto' },
});
