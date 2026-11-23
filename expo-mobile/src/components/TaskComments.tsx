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
import { Activity, Pencil, Trash2 } from 'lucide-react-native';
import { SheetTextInput } from './ui/Sheet';
import { VoiceInputButton } from './VoiceInputButton';
import { apiFetch, apiRequest } from '../services/api';
import { compactAgo } from '../lib/format';
import { fonts, metrics, radii, size, space, type, useColors } from '../theme';
import { Avatar, PrimaryButton, TextButton } from './kit';

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
  /**
   * Rendered inside a <Sheet> (gorhom bottom sheet): use the sheet's text
   * input so the sheet lifts above the keyboard instead of the comment box
   * being hidden under it. Leave unset in a plain ScrollView / Modal.
   */
  inSheet?: boolean;
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
      <Text key={`m-${key++}`} style={{ color: accent, fontFamily: fonts.semibold }}>
        @{match[1]}
      </Text>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return <Text style={[type.bodyPreview, { color: textColor }]}>{parts}</Text>;
}

export default function TaskComments({ taskId, currentUserId, inSheet }: TaskCommentsProps) {
  const Input = inSheet ? SheetTextInput : TextInput;
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

  // Revamp tokens (the `colors` prop is kept for callers but no longer read).
  const k = useColors();
  const colors = { bg: k.bg, card: k.surface, text: k.textBody, secondary: k.muted, border: k.border, accent: k.accent, muted: k.muted };
  const inputBg = k.surface;
  const danger = k.danger;

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
          {comments.length > 0 ? `Activity · ${comments.length}` : 'Activity'}
        </Text>
        {activity.length > 0 && (
          <TouchableOpacity
            onPress={() => setShowActivity((v) => !v)}
            style={styles.activityToggle}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
          >
            <Activity size={size.icon.meta} color={colors.secondary} strokeWidth={metrics.iconStroke} />
            <Text style={[styles.activityToggleText, { color: colors.secondary }]}>
              {showActivity ? 'Hide activity' : 'Show activity'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : feed.length === 0 ? (
        <Text style={[type.meta, { color: colors.muted }]}>
          No comments yet. Start the conversation.
        </Text>
      ) : (
        feed.map((entry) => {
          if (entry.kind === 'activity') {
            const a = entry.activity;
            return (
              <View key={`a-${a.id}`} style={styles.activityRow}>
                <Activity size={size.icon.meta} color={colors.muted} strokeWidth={metrics.iconStroke} />
                <Text style={[styles.activityText, { color: colors.muted }]}>
                  <Text style={{ fontFamily: fonts.semibold, color: colors.secondary }}>{a.actorName}</Text>
                  {' '}{a.summary}
                  <Text style={{ color: colors.muted }}>{'  ·  '}{compactAgo(a.createdAt)}</Text>
                </Text>
              </View>
            );
          }
          const c = entry.comment;
          const isOwn = !!currentUserId && c.createdById === currentUserId;
          const isEditing = editingId === c.id;
          return (
            <View key={c.id} style={styles.commentRow}>
              <Avatar name={c.createdByName} />
              <View style={{ flex: 1 }}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>{c.createdByName}</Text>
                  <Text style={[styles.commentTime, { color: colors.muted }]}>
                    {compactAgo(c.createdAt)}
                    {c.editedAt ? ' · edited' : ''}
                  </Text>
                </View>

                {isEditing ? (
                  <View>
                    <Input
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
                      <PrimaryButton inline label="Save" onPress={() => saveEdit(c.id)} />
                      <TextButton
                        label="Cancel"
                        tone="muted"
                        onPress={() => {
                          setEditingId(null);
                          setEditValue('');
                          setEditMentions([]);
                        }}
                      />
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
                      hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                    >
                      <Pencil size={size.icon.meta} color={colors.secondary} strokeWidth={metrics.iconStroke} />
                      <Text style={[styles.iconActionText, { color: colors.secondary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(c.id)} style={styles.iconAction} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}>
                      <Trash2 size={size.icon.meta} color={danger} strokeWidth={metrics.iconStroke} />
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
                <Avatar name={displayName(u)} size="chip" />
                <Text style={[type.body, { color: colors.text }]}>{displayName(u)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Input
          value={input}
          onChangeText={onChangeInput}
          multiline
          placeholder="Add a comment… use @ to mention"
          placeholderTextColor={colors.muted}
          style={[styles.input, { backgroundColor: inputBg, color: colors.text, borderColor: colors.border }]}
        />
        <View style={styles.composerActions}>
          {/* Dictate a comment (#56). */}
          <VoiceInputButton value={input} onChangeText={onChangeInput} label="Dictate a comment" />
          <PrimaryButton inline label="Comment" onPress={submit} loading={posting} disabled={!input.trim()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.inline },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.inline },
  sectionLabel: { ...type.meta },
  activityToggle: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  activityToggleText: { ...type.caption },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inline, paddingVertical: space.inlineSm },
  activityText: { ...type.caption, flex: 1 },
  commentRow: { flexDirection: 'row', gap: space.rowGap, paddingVertical: space.inline },
  commentHeader: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: space.inline, marginBottom: metrics.listRow.bodyGap },
  commentAuthor: { ...type.metaSemi },
  commentTime: { ...type.caption },
  input: {
    ...type.body,
    borderWidth: size.border,
    borderRadius: radii.lg,
    paddingHorizontal: metrics.form.inputPadX,
    paddingVertical: metrics.form.inputPadY,
    minHeight: metrics.form.inputHeight,
  },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, marginTop: space.inline },
  ownActions: { flexDirection: 'row', gap: space.section, marginTop: space.inlineSm },
  iconAction: { flexDirection: 'row', alignItems: 'center', gap: space.inlineSm },
  iconActionText: { ...type.caption },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.inline },
  mentionList: { borderWidth: size.border, borderRadius: radii.lg, marginBottom: space.inline, overflow: 'hidden' },
  mentionItem: { flexDirection: 'row', alignItems: 'center', gap: space.inline, paddingHorizontal: metrics.form.inputPadX, paddingVertical: space.inline },
});
