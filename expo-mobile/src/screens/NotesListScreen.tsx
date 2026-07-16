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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, apiFetch, ApiError } from '../services/api';
import { timeAgo } from '../lib/format';

import { useTheme } from '../theme';
type Props = {
  navigation: any;
  route?: any;
};

interface NoteItem {
  id: string;
  title: string;
  content: string;
  contentHtml?: string;
  contentText?: string;
  scope: string;
  projectId?: string | null;
  pinned?: boolean;
  ownerId?: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

interface ProjectRef {
  id: string;
  name: string;
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

export default function NotesListScreen({ navigation, route }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  // When opened from a project (ProjectDetail → Notes tile) the list is scoped
  // to that project. From the More tab there is no projectId, and the user can
  // toggle between their personal notes and a cross-project grouped view.
  const projectId: string | undefined = route?.params?.projectId;
  const projectName: string | undefined = route?.params?.projectName;
  const isProjectScoped = !!projectId;

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  // Only relevant when NOT project-scoped: 'my' = personal notes,
  // 'project' = all the user's notes grouped by project.
  const [tab, setTab] = useState<'my' | 'project'>('my');
  const groupedView = !isProjectScoped && tab === 'project';
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string; defaultTitle?: string; contentHtml?: string; contentText?: string }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateFetchError, setTemplateFetchError] = useState(false);

  const theme = useTheme();
const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    inputBg: theme.card,
    placeholder: theme.textMuted,
    danger: theme.statusDanger,
};

  const fetchNotes = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // Project-scoped: that project's notes only (filter by projectId, never
      // send scope). Grouped "Project Notes": bare /api/notes (owner OR assignee
      // across projects). Otherwise the personal list.
      const path = isProjectScoped
        ? `/api/notes?projectId=${projectId}`
        : tab === 'project'
        ? '/api/notes'
        : '/api/notes?scope=personal';
      const response = await apiRequest(path);
      const data: NoteItem[] = await response.json();
      const activeNotes = data.filter((n) => !n.archivedAt);
      activeNotes.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      setNotes(activeNotes);
      // The grouped view needs project names to label its section headers.
      if (!isProjectScoped && tab === 'project') {
        apiFetch<ProjectRef[]>('/api/projects')
          .then((p) => setProjects(p || []))
          .catch(() => {});
      }
      setFetchError(false);
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      setFetchError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, isProjectScoped, projectId, tab]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes();
    }, [fetchNotes])
  );

  const handlePlusTap = async () => {
    try {
      const response = await apiRequest('/api/note-templates?activeOnly=true');
      const data = await response.json();
      if (data.length > 0) {
        Alert.alert('New Note', 'How would you like to create a note?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'From Template', onPress: () => { setTemplates(data); setTemplateModalVisible(true); } },
          { text: 'New Note', onPress: () => handleCreateNote() },
        ]);
        return;
      }
    } catch {
    }
    handleCreateNote();
  };

  const openTemplatePicker = async () => {
    setLoadingTemplates(true);
    setTemplateFetchError(false);
    setTemplateModalVisible(true);
    try {
      const response = await apiRequest('/api/note-templates?activeOnly=true');
      const data = await response.json();
      setTemplates(data);
    } catch {
      setTemplates([]);
      setTemplateFetchError(true);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleCreateFromTemplate = async (template: { defaultTitle?: string; contentHtml?: string; contentText?: string }) => {
    if (creating) return;
    setCreating(true);
    setTemplateModalVisible(false);
    try {
      let html = template.contentHtml || '';
      if (!html && template.contentText) {
        html = template.contentText
          .split('\n')
          .map((line: string) => `<p>${line || '<br>'}</p>`)
          .join('');
      }
      const response = await apiRequest('/api/notes', 'POST', {
        title: template.defaultTitle || '',
        content: template.contentText || '',
        contentHtml: html || '<p><br></p>',
        contentText: template.contentText || '',
        type: 'note',
        // A note created from a project's list must belong to that project,
        // else it silently becomes a personal note and vanishes from the project.
        ...(isProjectScoped ? { scope: 'project', projectId } : { scope: 'personal' }),
        visibility: 'private',
        category: 'General',
        priority: 'low',
      });
      const newNote = await response.json();
      navigation.navigate('NoteEditor', { noteId: newNote.id, ...(isProjectScoped ? { projectId, scope: 'project' } : {}) });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create note from template.');
    } finally {
      setCreating(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({
        title: isProjectScoped ? `${projectName || 'Project'} · Notes` : 'Notes',
        headerRight: () => (
          <TouchableOpacity onPress={handlePlusTap} style={{ paddingRight: 8 }} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="add-circle" size={26} color={colors.accent} />
            )}
          </TouchableOpacity>
        ),
      });
    }, [navigation, creating, colors.accent, isProjectScoped, projectName])
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
        ...(isProjectScoped ? { scope: 'project', projectId } : { scope: 'personal' }),
        visibility: 'private',
        category: 'General',
        priority: 'low',
      });
      const newNote = await response.json();
      navigation.navigate('NoteEditor', { noteId: newNote.id, ...(isProjectScoped ? { projectId, scope: 'project' } : {}) });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create note.');
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
              await apiRequest(`/api/notes/${noteId}`, 'DELETE');
              setNotes((prev) => prev.filter((n) => n.id !== noteId));
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete note.');
            }
          },
        },
      ]
    );
  };

  const handleArchiveNote = async (noteId: string) => {
    try {
      await apiRequest(`/api/notes/${noteId}/archive`, 'POST');
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to archive note.');
    }
  };

  const handleTogglePin = async (note: NoteItem) => {
    const nextPinned = !note.pinned;
    // Optimistic: reflect the new pin state immediately.
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: nextPinned } : n)));
    try {
      await apiRequest(`/api/notes/${note.id}`, 'PATCH', { pinned: nextPinned });
      fetchNotes();
    } catch (err) {
      // Roll the optimistic pin back.
      setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, pinned: note.pinned } : n)));
      // The server enforces a 3-pin-per-project cap and returns 400 at the limit.
      if (err instanceof ApiError && err.status === 400) {
        Alert.alert('Pin limit reached', 'You can pin up to 3 notes per project.');
      } else {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update note.');
      }
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
      onPress={() => {
        // Forward the note's project so the editor stays in the right scope.
        const editorProjectId = isProjectScoped ? projectId : item.projectId;
        navigation.navigate('NoteEditor', {
          noteId: item.id,
          ...(editorProjectId ? { projectId: editorProjectId, scope: 'project' } : {}),
        });
      }}
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

  const projectNameFor = (id?: string | null): string => {
    if (!id) return 'No project';
    return projects.find((p) => p.id === id)?.name || 'Project';
  };

  const allItems: { type: 'header' | 'note'; data?: NoteItem; title?: string }[] = [];
  if (groupedView) {
    // Group by project (headers = project names). filteredNotes is already
    // pinned-first / recency sorted, so each group inherits that order.
    const groups = new Map<string, NoteItem[]>();
    filteredNotes.forEach((n) => {
      const key = n.projectId || '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    });
    Array.from(groups.entries())
      .sort(([a], [b]) => {
        // Real projects alphabetical; the "No project" bucket sinks to the bottom.
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return projectNameFor(a).localeCompare(projectNameFor(b));
      })
      .forEach(([key, groupNotes]) => {
        allItems.push({ type: 'header', title: projectNameFor(key === '__none__' ? null : key) });
        groupNotes.forEach((n) => allItems.push({ type: 'note', data: n }));
      });
  } else {
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
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {!isProjectScoped && (
        <View style={styles.segmentContainer}>
          <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {(['my', 'project'] as const).map((key) => {
              const active = tab === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.segmentBtn, active && { backgroundColor: colors.accent }]}
                  onPress={() => setTab(key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? '#fff' : colors.secondary },
                    ]}
                  >
                    {key === 'my' ? 'My Notes' : 'Project Notes'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
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
      ) : fetchError && notes.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={56} color={colors.placeholder} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Couldn't load notes</Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity onPress={() => fetchNotes()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
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

      <Modal
        visible={templateModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTemplateModalVisible(false)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
          <View style={[styles.templateHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.templateTitle, { color: colors.text }]}>Choose Template</Text>
            <TouchableOpacity onPress={() => setTemplateModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.secondary} />
            </TouchableOpacity>
          </View>
          {loadingTemplates ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : templates.length === 0 ? (
            <View style={styles.centerContainer}>
              <Ionicons name={templateFetchError ? 'cloud-offline-outline' : 'document-text-outline'} size={48} color={colors.placeholder} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {templateFetchError ? 'Failed to load templates' : 'No templates'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.secondary }]}>
                {templateFetchError ? 'Check your connection and try again.' : 'Create templates on the web to use them here.'}
              </Text>
              {templateFetchError && (
                <TouchableOpacity onPress={openTemplatePicker} style={{ marginTop: 12 }}>
                  <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '600' }}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.templateRow, { borderBottomColor: colors.border }]}
                  onPress={() => handleCreateFromTemplate(item)}
                >
                  <Ionicons name="document-text" size={22} color={colors.accent} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.templateName, { color: colors.text }]}>{item.name}</Text>
                    {item.description ? (
                      <Text style={[styles.templateDesc, { color: colors.secondary }]} numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.secondary} />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
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
  templateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
  },
  templateDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});
