import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, apiRequest } from '../services/api';
import { timeAgo, getInitials } from '../lib/format';
import { useTheme } from '../theme';

interface TaskComment {
  id: string;
  taskId: string;
  content: string;
  createdById: string;
  createdByName: string;
  createdAt: string;
  editedAt?: string | null;
}

interface TaskActivityItem {
  id: string;
  taskId: string;
  actorName: string;
  eventType: string;
  summary: string;
  createdAt: string;
}

type FeedEntry =
  | { kind: 'comment'; at: number; comment: TaskComment }
  | { kind: 'activity'; at: number; activity: TaskActivityItem };

interface MentionUser {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

interface ThemeColors {
  bg: string;
  card: string;
  text: string;
  secondary: string;
  border: string;
  accent: string;
  muted: string;
}

interface TaskCommentsProps {
  taskId: string;
  currentUserId?: string;
  colors: ThemeColors;
  isDark: boolean;
}

const MENTION_MARKUP = /@\[([^\]]+)\]\(userId:([^)]+)\)/g;

function displayName(u: MentionUser): string {
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || u.email || 'Unknown';
}

// Mentions extracted from a comment's markup, used to round-trip an edit:
// the input shows "@Name" and unchanged mentions are converted back to
// @[Name](userId:x) markup on save.
interface EditMention {
  display: string;
  markup: string;
}

function markupToDisplay(content: string): string {
  return content.replace(MENTION_MARKUP, '@$1');
}

function extractMentions(content: string): EditMention[] {
  const mentions: EditMention[] = [];
  MENTION_MARKUP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    mentions.push({ display: `@${match[1]}`, markup: match[0] });
  }
  return mentions;
}

function displayToMarkup(text: string, mentions: EditMention[]): string {
  // Longest display names first so "@Jo Smith" isn't clobbered by "@Jo".
  const sorted = [...mentions].sort((a, b) => b.display.length - a.display.length);
  let result = text;
  for (const m of sorted) {
    result = result.split(m.display).join(m.markup);
  }
  return result;
}

// Render @[Name](userId:x) markup as readable, highlighted text.
function renderContent(content: string, accent: string, textColor: string) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_MARKUP.lastIndex = 0;
  let key = 0;
  while ((match = MENTION_MARKUP.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <Text key={`m-${key++}`} style={{ color: accent, fontWeight: '600' }}>
        @{match[1]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return <Text style={{ color: textColor, fontSize: 14, lineHeight: 20 }}>{parts}</Text>;
}

export default function TaskComments({ taskId, currentUserId, colors, isDark }: TaskCommentsProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activity, setActivity] = useState<TaskActivityItem[]>([]);
  const [showActivity, setShowActivity] = useState(true);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editMentions, setEditMentions] = useState<EditMention[]>([]);

  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);

  const theme = useTheme();
  const inputBg = theme.background;
  const danger = theme.statusDanger;

  const loadComments = useCallback(async () => {
    try {
      const data = await apiFetch<TaskComment[]>(`/api/tasks/${taskId}/comments`);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const loadActivity = useCallback(async () => {
    try {
      const data = await apiFetch<TaskActivityItem[]>(`/api/tasks/${taskId}/activity`);
      setActivity(data);
    } catch {
      setActivity([]);
    }
  }, [taskId]);

  useEffect(() => {
    setLoading(true);
    loadComments();
    loadActivity();
    apiFetch<MentionUser[]>('/api/users')
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [loadComments, loadActivity]);

  // Merge comments + activity into one chronological (oldest-first) stream.
  const feed = useMemo<FeedEntry[]>(() => {
    const items: FeedEntry[] = [
      ...comments.map((c) => ({ kind: 'comment' as const, at: new Date(c.createdAt).getTime(), comment: c })),
      ...(showActivity
        ? activity.map((a) => ({ kind: 'activity' as const, at: new Date(a.createdAt).getTime(), activity: a }))
        : []),
    ];
    return items.sort((a, b) => a.at - b.at);
  }, [comments, activity, showActivity]);

  const filteredMentions = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.toLowerCase();
    return users.filter((u) => displayName(u).toLowerCase().includes(q)).slice(0, 6);
  }, [mentionActive, mentionQuery, users]);

  const onChangeInput = (text: string) => {
    setInput(text);
    const atMatch = text.match(/(?:^|\s)@([\w'-]*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionQuery(atMatch[1] || '');
      setMentionStart(text.length - (atMatch[1]?.length || 0) - 1);
    } else {
      setMentionActive(false);
    }
  };

  const pickMention = (u: MentionUser) => {
    const before = input.slice(0, mentionStart);
    const inserted = `@[${displayName(u)}](userId:${u.id}) `;
    setInput(`${before}${inserted}`);
    setMentionActive(false);
  };

  const submit = async () => {
    const content = input.trim();
    if (!content) return;
    setPosting(true);
    try {
      await apiRequest('/api/task-comments', 'POST', { taskId, content });
      setInput('');
      await loadComments();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : "Couldn't post comment. Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const saveEdit = async (id: string) => {
    // Reconstruct @[Name](userId:x) markup for mentions the user left intact.
    const content = displayToMarkup(editValue.trim(), editMentions);
    if (!content) return;
    try {
      await apiRequest(`/api/task-comments/${id}`, 'PATCH', { content });
      setEditingId(null);
      setEditValue('');
      setEditMentions([]);
      await loadComments();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : "Couldn't save changes. Please try again.");
    }
  };

  const remove = (id: string) => {
    Alert.alert('Delete comment', 'Are you sure you want to delete this comment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await apiRequest(`/api/task-comments/${id}`, 'DELETE');
            await loadComments();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : "Couldn't delete comment. Please try again.");
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionLabel, { color: colors.secondary }]}>
          Activity & Comments{comments.length > 0 ? ` (${comments.length})` : ''}
        </Text>
        {activity.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowActivity((v) => !v)}
            style={styles.activityToggle}
          >
            <Ionicons name="pulse-outline" size={14} color={colors.secondary} />
            <Text style={[styles.activityToggleText, { color: colors.secondary }]}>
              {showActivity ? 'Hide activity' : 'Show activity'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : feed.length === 0 ? (
        <Text style={{ color: colors.muted, fontSize: 14, marginBottom: 8 }}>
          No comments yet. Start the conversation.
        </Text>
      ) : (
        feed.map((entry) => {
          if (entry.kind === 'activity') {
            const a = entry.activity;
            return (
              <View key={`a-${a.id}`} style={styles.activityRow}>
                <Ionicons name="pulse-outline" size={14} color={colors.muted} style={{ marginTop: 2 }} />
                <Text style={[styles.activityText, { color: colors.muted }]}>
                  <Text style={{ fontWeight: '600', color: colors.secondary }}>{a.actorName}</Text>
                  {' '}{a.summary}
                  <Text style={{ color: colors.muted }}>{'  ·  '}{timeAgo(a.createdAt)}</Text>
                </Text>
              </View>
            );
          }
          const c = entry.comment;
          const isOwn = !!currentUserId && c.createdById === currentUserId;
          const isEditing = editingId === c.id;
          return (
            <View key={c.id} style={styles.commentRow}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={styles.avatarText}>{getInitials(c.createdByName)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{c.createdByName}</Text>
                  <Text style={[styles.commentTime, { color: colors.muted }]}>
                    {timeAgo(c.createdAt)}
                    {c.editedAt ? ' (edited)' : ''}
                  </Text>
                </View>

                {isEditing ? (
                  <View>
                    <TextInput
                      value={editValue}
                      onChangeText={setEditValue}
                      multiline
                      style={[
                        styles.input,
                        { backgroundColor: inputBg, color: colors.text, borderColor: colors.border },
                      ]}
                      placeholderTextColor={colors.muted}
                    />
                    <View style={styles.editActions}>
                      <TouchableOpacity onPress={() => saveEdit(c.id)} style={[styles.btn, { backgroundColor: colors.accent }]}>
                        <Text style={styles.btnText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingId(null);
                          setEditValue('');
                          setEditMentions([]);
                        }}
                        style={styles.btnGhost}
                      >
                        <Text style={{ color: colors.secondary, fontWeight: '600' }}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  renderContent(c.content, colors.accent, colors.text)
                )}

                {isOwn && !isEditing && (
                  <View style={styles.ownActions}>
                    <TouchableOpacity
                      onPress={() => {
                        // Seed the input with readable "@Name" text instead of
                        // raw @[Name](userId:x) markup; unchanged mentions are
                        // converted back to markup on save.
                        setEditingId(c.id);
                        setEditValue(markupToDisplay(c.content));
                        setEditMentions(extractMentions(c.content));
                      }}
                      style={styles.iconAction}
                    >
                      <Ionicons name="pencil" size={14} color={colors.secondary} />
                      <Text style={[styles.iconActionText, { color: colors.secondary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(c.id)} style={styles.iconAction}>
                      <Ionicons name="trash-outline" size={14} color={danger} />
                      <Text style={[styles.iconActionText, { color: danger }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}

      {/* Composer */}
      <View style={{ marginTop: 8 }}>
        {mentionActive && filteredMentions.length > 0 && (
          <View style={[styles.mentionList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {filteredMentions.map((u) => (
              <TouchableOpacity key={u.id} style={styles.mentionItem} onPress={() => pickMention(u)}>
                <View style={[styles.mentionAvatar, { backgroundColor: colors.accent }]}>
                  <Text style={styles.avatarText}>{getInitials(displayName(u))}</Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 14 }}>{displayName(u)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TextInput
          value={input}
          onChangeText={onChangeInput}
          multiline
          placeholder="Add a comment… use @ to mention"
          placeholderTextColor={colors.muted}
          style={[styles.input, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
        />
        <TouchableOpacity
          onPress={submit}
          disabled={!input.trim() || posting}
          style={[
            styles.postBtn,
            { backgroundColor: colors.accent, opacity: !input.trim() || posting ? 0.5 : 1 },
          ]}
        >
          <Text style={styles.btnText}>{posting ? 'Posting…' : 'Comment'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  activityToggle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activityToggleText: { fontSize: 12, fontWeight: '500' },
  activityRow: { flexDirection: 'row', gap: 8, marginBottom: 12, paddingLeft: 2 },
  activityText: { flex: 1, fontSize: 12, lineHeight: 17 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  commentHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 2 },
  commentAuthor: { fontSize: 14, fontWeight: '600' },
  commentTime: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 40 },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ownActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  iconAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconActionText: { fontSize: 13, fontWeight: '500' },
  btn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  btnGhost: { paddingHorizontal: 16, paddingVertical: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  postBtn: { alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  mentionList: { borderWidth: 1, borderRadius: 8, marginBottom: 6, overflow: 'hidden' },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  mentionAvatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
