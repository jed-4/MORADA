import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch, apiRequest } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

interface Message {
  id: string;
  channelId: string;
  userId: string;
  content: string;
  createdAt: string;
  userFirstName?: string | null;
  userLastName?: string | null;
  userEmail?: string | null;
  isEdited?: boolean;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ MessageThread: { channelId: string; channelName: string } }, 'MessageThread'>;
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return `Yesterday ${d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return d.toLocaleDateString('en-AU', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  } else {
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  }
}

function getSenderName(msg: Message): string {
  if (msg.userFirstName || msg.userLastName) {
    return [msg.userFirstName, msg.userLastName].filter(Boolean).join(' ');
  }
  return msg.userEmail || 'Unknown';
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/);
  return parts
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() || '')
    .join('');
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function formatDateDivider(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function MessageThreadScreen({ navigation, route }: Props) {
  const { channelId, channelName } = route.params;
  const { user } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', secondary: '#94a3b8', border: '#334155', accent: '#b196d2', muted: '#475569', input: '#1e293b', myBubble: '#4c1d95', otherBubble: '#1e293b' }
    : { bg: '#f8fafc', card: '#ffffff', text: '#0f172a', secondary: '#64748b', border: '#e2e8f0', accent: '#9b7fc4', muted: '#94a3b8', input: '#ffffff', myBubble: '#ede9fe', otherBubble: '#ffffff' };

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList<any>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestMessageIdRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async (initial = false) => {
    try {
      const msgs = await apiFetch<Message[]>(`/api/channels/${channelId}/messages`);
      const sorted = (msgs || []).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      setMessages(prev => {
        if (initial) return sorted;
        if (sorted.length === prev.length && sorted[sorted.length - 1]?.id === prev[prev.length - 1]?.id) return prev;
        return sorted;
      });

      if (sorted.length > 0) {
        const lastId = sorted[sorted.length - 1].id;
        if (lastId !== latestMessageIdRef.current) {
          latestMessageIdRef.current = lastId;
          if (!initial) {
            setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
          }
        }
      }
    } catch {
      // silently fail on poll
    } finally {
      if (initial) setLoading(false);
    }
  }, [channelId]);

  const markRead = useCallback(async () => {
    try {
      await apiRequest(`/api/channels/${channelId}/read`, 'POST');
    } catch {
      // silently fail
    }
  }, [channelId]);

  useFocusEffect(
    useCallback(() => {
      fetchMessages(true).then(() => {
        markRead();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 150);
      });
      pollRef.current = setInterval(() => fetchMessages(false), 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        markRead();
      };
    }, [fetchMessages, markRead])
  );

  const handleSend = useCallback(async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setMessageText('');
    setSending(true);
    try {
      const res = await apiRequest(`/api/channels/${channelId}/messages`, 'POST', { content: text });
      if (res.ok) {
        await fetchMessages(false);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
        setMessageText(text);
      }
    } catch {
      setMessageText(text);
    } finally {
      setSending(false);
    }
  }, [messageText, sending, channelId, fetchMessages]);

  type ListItem = Message | { type: 'divider'; date: string; id: string };

  const listData: ListItem[] = [];
  messages.forEach((msg, idx) => {
    const prev = messages[idx - 1];
    if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
      listData.push({ type: 'divider', date: msg.createdAt, id: `divider-${msg.id}` });
    }
    listData.push(msg);
  });

  const renderItem = ({ item, index }: { item: ListItem; index: number }) => {
    if ('type' in item && item.type === 'divider') {
      return (
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.secondary, backgroundColor: colors.bg }]}>
            {formatDateDivider(item.date)}
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>
      );
    }

    const msg = item as Message;
    const isMe = msg.userId === user?.id;
    const senderName = getSenderName(msg);
    const initials = getInitials(senderName);

    const prevMsg = index > 0 ? (listData[index - 1] as Message) : null;
    const isFirstFromSender = !prevMsg || 'type' in prevMsg || (prevMsg as Message).userId !== msg.userId;

    return (
      <View style={[styles.messageRow, isMe && styles.messageRowMe]}>
        {!isMe && (
          <View style={styles.avatarCol}>
            {isFirstFromSender ? (
              <View style={[styles.avatar, { backgroundColor: colors.accent + '30' }]}>
                <Text style={[styles.avatarText, { color: colors.accent }]}>{initials}</Text>
              </View>
            ) : (
              <View style={styles.avatarPlaceholder} />
            )}
          </View>
        )}
        <View style={[styles.bubbleCol, isMe && styles.bubbleColMe]}>
          {isFirstFromSender && !isMe && (
            <View style={styles.senderRow}>
              <Text style={[styles.senderName, { color: colors.secondary }]}>{senderName}</Text>
              <Text style={[styles.messageTime, { color: colors.muted }]}>{formatTime(msg.createdAt)}</Text>
            </View>
          )}
          <View style={[
            styles.bubble,
            isMe
              ? [styles.bubbleMe, { backgroundColor: colors.myBubble }]
              : [styles.bubbleOther, { backgroundColor: colors.otherBubble, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }],
          ]}>
            <Text style={[styles.bubbleText, { color: isMe && !isDark ? '#3b1f6e' : colors.text }]}>{msg.content}</Text>
          </View>
          {isMe && (
            <Text style={[styles.messageTimeMe, { color: colors.muted }]}>{formatTime(msg.createdAt)}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {channelName.startsWith('dm-') ? channelName.replace(/^dm-/, '').replace(/-/g, ' ') : `#${channelName}`}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={listData}
          keyExtractor={item => ('type' in item ? item.id : item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={[styles.emptyThreadText, { color: colors.secondary }]}>
                No messages yet. Say hello!
              </Text>
            </View>
          }
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        />
      )}

      {/* Input Bar */}
      <View style={[styles.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: colors.input, color: colors.text, borderColor: colors.border }]}
          placeholder="Message..."
          placeholderTextColor={colors.muted}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={4000}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: messageText.trim() ? colors.accent : colors.border }]}
          onPress={handleSend}
          disabled={!messageText.trim() || sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Ionicons name="send" size={18} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, gap: 8 },
  messageRowMe: { justifyContent: 'flex-end' },
  avatarCol: { width: 32, alignItems: 'center', justifyContent: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700' },
  avatarPlaceholder: { width: 32, height: 32 },
  bubbleCol: { maxWidth: '75%' },
  bubbleColMe: { alignItems: 'flex-end' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  senderName: { fontSize: 12, fontWeight: '600' },
  messageTime: { fontSize: 11 },
  messageTimeMe: { fontSize: 11, marginTop: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: '500', paddingHorizontal: 8 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyThread: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyThreadText: { fontSize: 14 },
});
