import { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useColorScheme,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CloudOff, Ellipsis, FileText, Pin, Search, X } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest, apiFetch, ApiError } from '../services/api';
import { compactAgo } from '../lib/format';

import { useTheme, useColors, metrics, radii, size, space, tabular, type } from '../theme';
import { Card, EmptyState, FAB, FAB_CLEARANCE, ListRow, ModalSheet, PageHeader, Segmented, TextButton } from '../components/kit';
import { SwipeRow } from '../components/ui/SwipeRow';
import { readableFrame } from '../components/ui/ReadableColumn';
import { haptic } from '../lib/haptics';
import { SkeletonList } from '../components/ui/Skeleton';
import { goBackOrHome } from '../navigation/back';
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

// Swipe right: pin / unpin. Swipe left: archive. (Delete stays in the ...
// menu, so a destructive action is never one stray swipe away.) Tapping
// opens the note, as before.
function SwipeableNoteRow({
  note,
  colors,
  onPress,
  onLongPress,
  onTogglePin,
  onArchive,
}: {
  note: NoteItem;
  colors: any;
  onPress: () => void;
  onLongPress: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
}) {
  const c = useColors();
  return (
    <SwipeRow
      containerStyle={styles.swipe}
      left={{
        label: note.pinned ? 'Unpin' : 'Pin',
        icon: note.pinned ? 'pin-outline' : 'pin',
        color: colors.accent,
        haptic: 'none', // handleTogglePin fires its own
        onAction: onTogglePin,
      }}
      right={{
        label: 'Archive',
        icon: 'archive-outline',
        color: colors.archive,
        haptic: 'none', // handleArchiveNote fires success when it lands
        onAction: onArchive,
      }}
    >
      <Pressable
        style={({ pressed }) => [styles.row, { backgroundColor: c.surface, opacity: pressed ? metrics.pressedOpacity : 1 }]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={metrics.longPressMs}
        accessibilityRole="button"
        accessibilityLabel={note.title || 'Untitled'}
      >
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            {note.pinned ? <Pin size={size.icon.meta} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
            <Text style={[type.rowTitle, styles.flex, { color: c.text }]} numberOfLines={2}>
              {note.title || 'Untitled'}
            </Text>
            <Text style={[type.caption, tabular, { color: c.muted }]}>{compactAgo(note.updatedAt)}</Text>
          </View>
          <Text style={[type.meta, { color: c.muted }]} numberOfLines={1}>
            {getPreviewText(note) || 'No content'}
          </Text>
        </View>
        <Pressable onPress={onLongPress} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Note actions">
          <Ellipsis size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />
        </Pressable>
      </Pressable>
    </SwipeRow>
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
  const k = useColors();
  const insets = useSafeAreaInsets();
  // Swipe action colours (SwipeRow) and the few inline colours left.
  const colors = {
    bg: k.bg,
    card: k.surface,
    text: k.text,
    secondary: k.muted,
    border: k.border,
    accent: k.accent,
    inputBg: k.surface,
    placeholder: k.faint,
    danger: k.danger,
    archive: k.status.pendingText,
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

  // One-row page header + FAB instead of the stack header's +.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

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
      haptic.success();
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to archive note.');
    }
  };

  const handleTogglePin = async (note: NoteItem) => {
    const nextPinned = !note.pinned;
    haptic.select();
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
      onTogglePin={() => handleTogglePin(item)}
      onArchive={() => handleArchiveNote(item.id)}
    />
  );


  const projectNameFor = (id?: string | null): string => {
    if (!id) return 'No project';
    return projects.find((p) => p.id === id)?.name || 'Project';
  };

  // Sections: Pinned / Notes, or one per project in the grouped view.
  const sections: { title: string | null; notes: NoteItem[] }[] = [];
  if (groupedView) {
    // filteredNotes is already pinned-first / recency sorted, so each group inherits that order.
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
      .forEach(([key, groupNotes]) => sections.push({ title: projectNameFor(key === '__none__' ? null : key), notes: groupNotes }));
  } else {
    if (pinnedNotes.length > 0) sections.push({ title: 'Pinned', notes: pinnedNotes });
    if (unpinnedNotes.length > 0) sections.push({ title: pinnedNotes.length > 0 ? 'Notes' : null, notes: unpinnedNotes });
  }

  return (
    <View style={[styles.container, { backgroundColor: k.bg }]}>
      <View style={[styles.top, { paddingTop: insets.top + metrics.schedule.top }]}>
        <PageHeader
          title="Notes"
          project={isProjectScoped ? { name: projectName || 'Project', color: route?.params?.projectColor ?? null, id: projectId } : null}
          onBack={() => goBackOrHome(navigation)}
        />
        {!isProjectScoped ? (
          <Segmented
            options={[{ key: 'my', label: 'My notes' }, { key: 'project', label: 'Project notes' }]}
            value={tab}
            onChange={(v) => setTab(v as 'my' | 'project')}
          />
        ) : null}
        <View style={[styles.search, { backgroundColor: k.surface, borderColor: k.border }]}>
          <Search size={metrics.projects.searchIcon} color={k.muted} strokeWidth={metrics.iconStroke} />
          <TextInput
            style={[type.body, styles.searchInput, { color: k.text }]}
            placeholder="Search notes"
            placeholderTextColor={k.faint}
            value={search}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={metrics.hitSlop} accessibilityLabel="Clear search">
              <X size={size.icon.row} color={k.muted} strokeWidth={metrics.iconStroke} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <SkeletonList />
      ) : fetchError && notes.length === 0 ? (
        <View style={styles.center}>
          <EmptyState icon={CloudOff} title="Couldn't load notes" helper="Check your connection and try again." />
          <TextButton label="Retry" center onPress={() => fetchNotes()} />
        </View>
      ) : sections.length === 0 ? (
        <View style={styles.center}>
          <EmptyState
            icon={FileText}
            title={search ? 'No matching notes' : 'No notes yet'}
            helper={search ? 'Try a different search.' : 'Tap + to write your first note.'}
          />
        </View>
      ) : (
        <FlatList
          data={sections}
          keyExtractor={(sct, i) => `${sct.title ?? 'all'}-${i}`}
          renderItem={({ item: sct }) => (
            <View style={styles.section}>
              {sct.title ? <Text style={[type.meta, { color: k.muted }]}>{sct.title}</Text> : null}
              <Card variant="list">
                {sct.notes.map((n) => <View key={n.id}>{renderNoteItem({ item: n })}</View>)}
              </Card>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchNotes(true)} tintColor={k.accent} />}
          contentContainerStyle={[styles.list, { paddingBottom: space.screenBottom + FAB_CLEARANCE + insets.bottom }, readableFrame]}
        />
      )}

      {creating ? null : <FAB onPress={handlePlusTap} label="New note" />}

      <ModalSheet
        visible={templateModalVisible}
        onRequestClose={() => setTemplateModalVisible(false)}
        title="Choose a template"
        onCancel={() => setTemplateModalVisible(false)}
        fill
      >
        {loadingTemplates ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={k.accent} />
          </View>
        ) : templates.length === 0 ? (
          <View style={styles.center}>
            <EmptyState
              icon={templateFetchError ? CloudOff : FileText}
              title={templateFetchError ? "Couldn't load templates" : 'No templates'}
              helper={templateFetchError ? 'Check your connection and try again.' : 'Create templates on the web to use them here.'}
            />
            {templateFetchError ? <TextButton label="Retry" center onPress={openTemplatePicker} /> : null}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.templateList}>
            <Card variant="list">
              {templates.map((t) => (
                <ListRow
                  key={t.id}
                  lead={<FileText size={size.icon.row} color={k.icon} strokeWidth={metrics.iconStroke} />}
                  title={t.name}
                  subtitle={t.description || undefined}
                  chevron
                  onPress={() => handleCreateFromTemplate(t)}
                />
              ))}
            </Card>
          </ScrollView>
        )}
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  top: { paddingHorizontal: space.screenX, gap: metrics.sheet.gap - 2, paddingBottom: space.inline },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.inline,
    minHeight: metrics.projects.searchHeight,
    borderRadius: radii.lg,
    borderWidth: size.border,
    paddingHorizontal: metrics.projects.cardPad,
  },
  searchInput: { flex: 1, paddingVertical: 0 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space.screenX },
  list: { paddingHorizontal: space.screenX, paddingTop: space.inline, gap: metrics.sheet.gap },
  section: { gap: space.groupHeaderToCard },
  swipe: { overflow: 'hidden' },
  // Rows carry their own white so the swipe actions show from behind them.
  row: { flexDirection: 'row', alignItems: 'center', gap: space.rowGap, paddingVertical: metrics.listRow.padY },
  rowBody: { flex: 1, gap: metrics.listRow.bodyGap },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.inline },
  templateList: { paddingHorizontal: space.screenX, paddingBottom: space.screenBottom },
});
