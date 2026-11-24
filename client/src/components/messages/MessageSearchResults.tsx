import { Fragment, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isToday, isYesterday, isThisWeek, isThisYear } from "date-fns";
import { Eye, Loader2, Lock, User } from "lucide-react";
import { ClientBadge } from "@/components/messages/ClientBadge";
import { ChannelEmoji } from "@/components/ChannelEmojiPicker";
import { getApiBaseUrl } from "@/lib/queryClient";
import { stripMentionMarkup } from "@/lib/messageText";

/** One row from GET /api/messages/search. */
export interface MessageSearchHit {
  id: string;
  channelId: string;
  userId: string | null;
  content: string;
  createdAt: string;
  channelName: string;
  channelType: "channel" | "dm";
  channelEmoji: string | null;
  isClientFacing: boolean | null;
  dmParticipants: string[] | null;
  userFirstName: string | null;
  userLastName: string | null;
}

/** The fields a conversation row needs — a Channel satisfies this, and so does a hit. */
export interface ConversationLike {
  id: string;
  name: string;
  type: string;
  emoji?: string | null;
  isClientFacing?: boolean | null;
  dmParticipants?: unknown;
}

/** The server matches when every word is present, so we highlight every word. */
export const MIN_MESSAGE_SEARCH_LENGTH = 2;

function splitWords(q: string): string[] {
  return Array.from(new Set(q.trim().split(/\s+/).filter(Boolean)));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shortDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEE");
  if (isThisYear(d)) return format(d, "d MMM");
  return format(d, "d MMM yy");
}

/**
 * Plain-text snippet around the first match, mention markup removed, with every
 * search word marked. A long message is windowed so the hit is visible inside
 * the two lines the row allows.
 */
function highlightSnippet(content: string, words: string[]): ReactNode {
  const text = stripMentionMarkup(content).replace(/\s+/g, " ").trim();
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "gi");

  let snippet = text;
  const firstIdx = text.search(pattern);
  if (firstIdx > 40) {
    snippet = "…" + text.slice(firstIdx - 30);
  }

  const lowerWords = new Set(words.map((w) => w.toLowerCase()));
  return snippet.split(pattern).map((part, i) =>
    lowerWords.has(part.toLowerCase()) ? (
      <mark key={i} className="bg-primary/15 text-foreground font-semibold rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Same icon rules as the sidebar's channel rows. */
function ConversationIcon({ c }: { c: ConversationLike }) {
  if (c.type === "dm" && !c.emoji) return <User className="h-3.5 w-3.5 shrink-0 text-primary" />;
  if (c.emoji) return <ChannelEmoji emoji={c.emoji} />;
  if (c.isClientFacing) return <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />;
  return <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
}


function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 text-data font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </div>
  );
}

interface Props {
  /** Debounced search text. */
  query: string;
  /** True while the typed text has not yet reached `query`. */
  isDebouncing: boolean;
  /** Every conversation the user can see (unfiltered by the sidebar's hide settings). */
  channels: ConversationLike[];
  getConversationName: (c: ConversationLike) => string;
  onOpenChannel: (channelId: string) => void;
  onOpenMessage: (hit: MessageSearchHit) => void;
}

export function MessageSearchResults({
  query,
  isDebouncing,
  channels,
  getConversationName,
  onOpenChannel,
  onOpenMessage,
}: Props) {
  const q = query.trim();
  const words = useMemo(() => splitWords(q), [q]);
  const canSearchMessages = q.length >= MIN_MESSAGE_SEARCH_LENGTH;

  const {
    data: rawHits = [],
    isFetching,
    isError,
  } = useQuery<MessageSearchHit[]>({
    queryKey: ["/api/messages/search", { q }],
    queryFn: async () => {
      const params = new URLSearchParams({ q, limit: "30" });
      const res = await fetch(`${getApiBaseUrl()}/api/messages/search?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      return res.json();
    },
    enabled: canSearchMessages,
    // The global default is staleTime: Infinity — fine for reference data, wrong
    // for a search over a conversation that keeps moving.
    staleTime: 30_000,
  });

  // When the page is scoped (a project's channels, DMs only) a hit in a
  // conversation outside that list can't be opened here — the page would fall
  // back to its first channel — so only show hits this list can open.
  const hits = useMemo(() => {
    const openable = new Set(channels.map((c) => c.id));
    return rawHits.filter((h) => openable.has(h.channelId));
  }, [rawHits, channels]);

  const matchingConversations = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) return [];
    return channels.filter((c) => getConversationName(c).toLowerCase().includes(needle));
  }, [channels, getConversationName, q]);

  const searching = canSearchMessages && (isDebouncing || isFetching);

  return (
    <div className="space-y-0.5" data-testid="message-search-results">
      <SectionLabel>Conversations</SectionLabel>
      {matchingConversations.length === 0 ? (
        <div className="px-2.5 py-1 text-xs text-muted-foreground" data-testid="text-search-no-conversations">
          No conversations match
        </div>
      ) : (
        matchingConversations.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onOpenChannel(c.id)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left hover-elevate text-foreground"
            data-testid={`search-channel-${c.id}`}
          >
            <ConversationIcon c={c} />
            <span className="truncate flex-1">{getConversationName(c)}</span>
            {c.isClientFacing && <ClientBadge size="sm" />}
          </button>
        ))
      )}

      <SectionLabel>Messages</SectionLabel>
      {!canSearchMessages ? (
        <div className="px-2.5 py-1 text-xs text-muted-foreground" data-testid="text-search-min-length">
          Type at least {MIN_MESSAGE_SEARCH_LENGTH} characters
        </div>
      ) : searching && hits.length === 0 ? (
        <div className="px-2.5 py-1 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="text-search-loading">
          <Loader2 className="h-3 w-3 animate-spin" />
          Searching…
        </div>
      ) : isError ? (
        <div className="px-2.5 py-1 text-xs text-muted-foreground" data-testid="text-search-error">
          Couldn't search messages
        </div>
      ) : hits.length === 0 ? (
        <div className="px-2.5 py-1 text-xs text-muted-foreground" data-testid="text-search-no-messages">
          No messages match
        </div>
      ) : (
        <>
          {searching && (
            <div className="px-2.5 flex items-center gap-1.5 text-data text-muted-foreground" data-testid="text-search-refreshing">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching…
            </div>
          )}
          {hits.map((hit) => {
            const conversation: ConversationLike = {
              id: hit.channelId,
              name: hit.channelName,
              type: hit.channelType,
              emoji: hit.channelEmoji,
              isClientFacing: hit.isClientFacing,
              dmParticipants: hit.dmParticipants,
            };
            const sender = [hit.userFirstName, hit.userLastName].filter(Boolean).join(" ") || "Unknown";
            return (
              <button
                type="button"
                key={hit.id}
                onClick={() => onOpenMessage(hit)}
                className="w-full flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md text-left hover-elevate text-foreground"
                data-testid={`search-message-${hit.id}`}
              >
                <div className="flex items-center gap-1.5 w-full min-w-0 text-xs">
                  <ConversationIcon c={conversation} />
                  <span className="truncate font-medium">{getConversationName(conversation)}</span>
                  {hit.isClientFacing && <ClientBadge size="sm" />}
                  <span className="ml-auto shrink-0 text-data text-muted-foreground">{shortDate(hit.createdAt)}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{sender}</div>
                <div className="text-xs text-foreground/90 line-clamp-2 break-words">
                  {highlightSnippet(hit.content, words)}
                </div>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
