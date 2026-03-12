import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';

type Props = {
  navigation: any;
};

interface NoteItem {
  id: string;
  title: string;
  content: string;
  contentHtml?: string;
  contentText?: string;
  scope: string;
  pinned?: boolean;
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function getPreviewText(note: NoteItem): string {
  const raw = note.contentText || note.content || '';
  const firstLine = raw.split('\n').find(l => l.trim().length > 0) || '';
  return firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine;
}

const SWIPE_THRESHOLD = 70;

function SwipeableNoteRow({
  note,
  colors,
  onPress,
  onLongPress,
  onDelete,
  onArchive,
}: {
  note: NoteItem;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isSwipedOpen = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx < 0) {
          translateX.setValue(Math.max(gestureState.dx, -160));
        } else if (isSwipedOpen.current) {
          translateX.setValue(Math.min(0, -160 + gestureState.dx));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -160, useNativeDriver: true, tension: 80, friction: 10 }).start();
          isSwipedOpen.current = true;
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
          isSwipedOpen.current = false;
        }
      },
    })
  ).current;

  const closeSwipe = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
    isSwipedOpen.current = false;
  };

  return (
    <View style={[styles.swipeContainer, { borderBottomColor: colors.border }]}>
      <View style={styles.swipeActions}>
        <TouchableOpacity
          style={[styles.swipeBtn, { backgroundColor: '#f59e0b' }]}
          onPress={() => { closeSwipe(); onArchive(); }}
        >
          <Ionicons name="archive-outline" size={20} color="#fff" />
          <Text style={styles.swipeBtnText}>Archive</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.swipeBtn, { backgroundColor: colors.danger }]}
          onPress={() => { closeSwipe(); onDelete(); }}
        >
          <Ionicons name="trash-outline" size={20} color="#fff" />
          <Text style={styles.swipeBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.noteRowAnimated, { backgroundColor: colors.bg, transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.noteRow}
          activeOpacity={0.6}
          onPress={() => {
            if (isSwipedOpen.current) { closeSwipe(); return; }
            onPress();
          }}
          onLongPress={onLongPress}
        >
          <View style={styles.noteContent}>
            <View style={styles.noteTitleRow}>
              {note.pinned && (
                <Ionicons name="pin" size={14} color={colors.accent} style={styles.pinIcon} />
              )}
              <Text style={[styles.noteTitle, { color: colors.text }]} numberOfLines={1}>
                {note.title || 'Untitled'}
              </Text>
            </View>
            <Text style={[styles.notePreview, { color: colors.secondary }]} numberOfLines={1}>
              {getPreviewText(note) || 'No content'}
            </Text>
          </View>
          <View style={styles.noteMeta}>
            <Text style={[styles.noteTime, { color: colors.placeholder }]}>
              {timeAgo(note.updatedAt)}
            </Text>
            <TouchableOpacity
              onPress={onLongPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.placeholder} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function NotesListScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const colors = isDark
    ? {
        bg: '#0f172a',
        card: '#1e293b',
        text: '#f1f5f9',
        secondary: '#94a3b8',
        border: '#334155',
        accent: '#b196d2',
        inputBg: '#1e293b',
        placeholder: '#64748b',
        danger: '#ef4444',
      }
    : {
        bg: '#f8fafc',
        card: '#ffffff',
        text: '#0f172a',
        secondary: '#64748b',
        border: '#e2e8f0',
        accent: '#9b7fc4',
        inputBg: '#ffffff',
        placeholder: '#94a3b8',
        danger: '#ef4444',
      };

  const fetchNotes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await apiRequest('/api/notes?scope=personal');
      if (response.ok) {
        const data: NoteItem[] = await response.json();
        const personalNotes = data.filter((n) => !n.archivedAt);
        personalNotes.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
        setNotes(personalNotes);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes])
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={handleCreateNote} style={{ paddingRight: 8 }} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="add-circle" size={26} color={colors.accent} />
            )}
          </TouchableOpacity>
        ),
      });
    }, [navigation, creating, colors.accent])
  );

  const filteredNotes = search.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          (n.contentText || n.content || '').toLowerCase().includes(search.toLowerCase())
      )
    : notes;

  const pinnedNotes = filteredNotes.filter((n) => n.pinned);
  const unpinnedNotes = filteredNotes.filter((n) => !n.pinned);

  const handleCreateNote = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const response = await apiRequest('/api/notes', 'POST', {
        title: 'Untitled',
        content: '',
        contentHtml: '<p><br></p>',
        contentText: '',
        type: 'note',
        scope: 'personal',
        category: 'General',
        priority: 'low',
      });
      if (response.ok) {
        const newNote = await response.json();
        navigation.navigate('NoteEditor', { noteId: newNote.id });
      } else {
        Alert.alert('Error', 'Failed to create note.');
      }
    } catch {
      Alert.alert('Error', 'Failed to create note.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteNote = async (noteId: string, title: string) => {
    Alert.alert(
      'Delete Note',
      `Are you sure you want to delete "${title || 'Untitled'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiRequest(`/api/notes/${noteId}`, 'DELETE');
              if (response.ok || response.status === 204) {
                setNotes((prev) => prev.filter((n) => n.id !== noteId));
              } else {
                Alert.alert('Error', 'Failed to delete note.');
              }
            } catch {
              Alert.alert('Error', 'Failed to delete note.');
            }
          },
        },
      ]
    );
  };

  const handleArchiveNote = async (noteId: string) => {
    try {
      const response = await apiRequest(`/api/notes/${noteId}/archive`, 'POST');
      if (response.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        Alert.alert('Error', 'Failed to archive note.');
      }
    } catch {
      Alert.alert('Error', 'Failed to archive note.');
    }
  };

  const handleTogglePin = async (note: NoteItem) => {
    try {
      const response = await apiRequest(`/api/notes/${note.id}`, 'PATCH', {
        pinned: !note.pinned,
      });
      if (response.ok) {
        fetchNotes();
      } else {
        const err = await response.json().catch(() => ({}));
        Alert.alert('Error', err.message || 'Failed to update note.');
      }
    } catch {
      Alert.alert('Error', 'Failed to update note.');
    }
  };

  const showNoteActions = (note: NoteItem) => {
    Alert.alert(
      note.title || 'Untitled',
      undefined,
      [
        {
          text: note.pinned ? 'Unpin' : 'Pin',
          onPress: () => handleTogglePin(note),
        },
        {
          text: 'Archive',
          onPress: () => handleArchiveNote(note.id),
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteNote(note.id, note.title),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderNoteItem = ({ item }: { item: NoteItem }) => (
    <SwipeableNoteRow
      note={item}
      colors={colors}
      onPress={() => navigation.navigate('NoteEditor', { noteId: item.id })}
      onLongPress={() => showNoteActions(item)}
      onDelete={() => handleDeleteNote(item.id, item.title)}
      onArchive={() => handleArchiveNote(item.id)}
    />
  );

  const renderSectionHeader = (title: string) => (
    <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
      <Text style={[styles.sectionTitle, { color: colors.secondary }]}>{title}</Text>
    </View>
  );

  const allItems: { type: 'header' | 'note'; data?: NoteItem; title?: string }[] = [];
  if (pinnedNotes.length > 0) {
    allItems.push({ type: 'header', title: 'Pinned' });
    pinnedNotes.forEach((n) => allItems.push({ type: 'note', data: n }));
  }
  if (unpinnedNotes.length > 0) {
    if (pinnedNotes.length > 0) {
      allItems.push({ type: 'header', title: 'Notes' });
    }
    unpinnedNotes.forEach((n) => allItems.push({ type: 'note', data: n }));
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.placeholder} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search notes..."
            placeholderTextColor={colors.placeholder}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.placeholder} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : allItems.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="document-text-outline" size={56} color={colors.placeholder} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {search ? 'No matching notes' : 'No notes yet'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
            {search ? 'Try a different search term' : 'Tap + to create your first note'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item, index) =>
            item.type === 'note' ? item.data!.id : `header-${index}`
          }
          renderItem={({ item }) =>
            item.type === 'header'
              ? renderSectionHeader(item.title!)
              : renderNoteItem({ item: item.data! })
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchNotes(true)} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  swipeContainer: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  swipeActions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    width: 160,
  },
  swipeBtn: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  swipeBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  noteRowAnimated: {
    width: '100%',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  noteContent: {
    flex: 1,
    marginRight: 12,
    gap: 4,
  },
  noteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinIcon: {
    marginRight: 2,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  notePreview: {
    fontSize: 14,
  },
  noteMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  noteTime: {
    fontSize: 12,
  },
});
