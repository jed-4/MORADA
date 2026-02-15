import { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  Animated,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiRequest } from '../services/api';

type Props = {
  navigation: any;
};

interface MoreItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  action: 'navigate' | 'coming-soon';
  screen?: string;
}

interface QuickAddItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

const quickAddItems: QuickAddItem[] = [
  { id: 'note', label: 'Notes', icon: 'document-text-outline', color: '#10b981' },
  { id: 'task', label: 'Tasks', icon: 'checkbox-outline', color: '#8b5cf6' },
  { id: 'site-diary', label: 'Site Diary', icon: 'book-outline', color: '#b196d2' },
  { id: 'my-calendar', label: 'My Calendar', icon: 'calendar-outline', color: '#9b7fc4' },
];

const moreItems: MoreItem[] = [
  { id: 'site-diary', label: 'Site Diary', icon: 'book', color: '#b196d2', action: 'navigate', screen: 'SiteDiaryList' },
  { id: 'tasks', label: 'My Tasks', icon: 'checkbox', color: '#8b5cf6', action: 'navigate', screen: 'Tasks' },
  { id: 'my-calendar', label: 'My Calendar', icon: 'calendar', color: '#9b7fc4', action: 'navigate', screen: 'MyCalendar' },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles', color: '#10b981', action: 'coming-soon' },
  { id: 'contacts', label: 'Contacts', icon: 'people', color: '#f59e0b', action: 'coming-soon' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar-outline', color: '#ef4444', action: 'navigate', screen: 'Schedule' },
  { id: 'checklists', label: 'Checklists', icon: 'checkmark-done', color: '#22c55e', action: 'navigate', screen: 'Checklists' },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#6b7280', action: 'coming-soon' },
];

const SHEET_HEIGHT = 440;

export default function MoreScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      slideAnim.setValue(SHEET_HEIGHT);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
    return unsubscribe;
  }, [navigation, slideAnim, fadeAnim]);

  const colors = isDark
    ? {
        bg: '#0f172a',
        text: '#f1f5f9',
        secondary: '#94a3b8',
        sheetBg: '#1e293b',
        accent: '#b196d2',
        handle: '#475569',
        inputBg: '#0f172a',
        border: '#334155',
        muted: '#64748b',
        danger: '#ef4444',
      }
    : {
        bg: '#f8fafc',
        text: '#0f172a',
        secondary: '#64748b',
        sheetBg: '#1e293b',
        accent: '#9b7fc4',
        handle: '#64748b',
        inputBg: '#ffffff',
        border: '#e2e8f0',
        muted: '#94a3b8',
        danger: '#ef4444',
      };

  const handleItemPress = (item: MoreItem) => {
    if (item.action === 'coming-soon') {
      return;
    }
    if (item.screen === 'MyCalendar') {
      navigation.getParent()?.navigate('Calendar');
      return;
    }
    if (item.screen) {
      navigation.navigate(item.screen);
    }
  };

  const handleQuickAdd = (item: QuickAddItem) => {
    switch (item.id) {
      case 'note':
        setNoteTitle('');
        setNoteContent('');
        setShowNoteModal(true);
        break;
      case 'task':
        setTaskTitle('');
        setTaskDescription('');
        setShowTaskModal(true);
        break;
      case 'site-diary':
        navigation.navigate('SiteDiaryList', { openCreate: true });
        break;
      case 'my-calendar':
        navigation.getParent()?.navigate('Calendar');
        break;
    }
  };

  const saveNote = async () => {
    if (!noteTitle.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: noteTitle.trim(),
          content: noteContent.trim() || noteTitle.trim(),
          type: 'note',
          scope: 'personal',
          category: 'General',
          priority: 'low',
        }),
      });
      setShowNoteModal(false);
      setNoteTitle('');
      setNoteContent('');
      Alert.alert('Saved', 'Note created successfully.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Required', 'Please enter a task title.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          title: taskTitle.trim(),
          content: taskDescription.trim() || taskTitle.trim(),
          type: 'task',
          status: 'todo',
          scope: 'personal',
          category: 'General',
          priority: 'medium',
        }),
      });
      setShowTaskModal(false);
      setTaskTitle('');
      setTaskDescription('');
      Alert.alert('Saved', 'Task created successfully.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderQuickAddModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    onSave: () => void,
    children: React.ReactNode,
  ) => (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.qaOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.qaBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.qaSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          <View style={[styles.qaHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.qaHeaderBtn, { color: colors.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.qaHeaderTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>{title}</Text>
            <TouchableOpacity onPress={onSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[styles.qaHeaderBtn, { color: colors.accent, fontWeight: '600' }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.qaBody}>
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {user && (
        <Animated.View style={[styles.profileSection, { opacity: fadeAnim }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={styles.avatarText}>
              {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.secondary }]}>{user.email}</Text>
          </View>
        </Animated.View>
      )}

      <View style={styles.sheetWrapper}>
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              backgroundColor: colors.sheetBg,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.handleBar}>
            <View style={[styles.handle, { backgroundColor: colors.handle }]} />
          </View>

          <View style={styles.grid}>
            {moreItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.gridItem}
                onPress={() => handleItemPress(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon} size={24} color="#ffffff" />
                </View>
                <Text style={[styles.gridLabel, { color: '#e2e8f0' }]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.action === 'coming-soon' && (
                  <Text style={styles.comingSoonBadge}>Soon</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.quickAddDivider, { borderTopColor: '#334155' }]}>
            <Text style={[styles.quickAddLabel, { color: '#94a3b8' }]}>Quick Add</Text>
          </View>

          <View style={styles.quickAddRow}>
            {quickAddItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.quickAddItem}
                onPress={() => handleQuickAdd(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.quickAddCircle, { backgroundColor: item.color + '20', borderColor: item.color + '40' }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={[styles.gridLabel, { color: '#e2e8f0' }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>

      {renderQuickAddModal(
        showNoteModal,
        () => setShowNoteModal(false),
        'New Note',
        saveNote,
        <>
          <TextInput
            style={[styles.qaInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            value={noteTitle}
            onChangeText={setNoteTitle}
            placeholder="Note title"
            placeholderTextColor={colors.muted}
            autoFocus
          />
          <TextInput
            style={[styles.qaTextArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border, marginTop: 12 }]}
            value={noteContent}
            onChangeText={setNoteContent}
            placeholder="Write your note..."
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
        </>,
      )}

      {renderQuickAddModal(
        showTaskModal,
        () => setShowTaskModal(false),
        'New Task',
        saveTask,
        <>
          <TextInput
            style={[styles.qaInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
            value={taskTitle}
            onChangeText={setTaskTitle}
            placeholder="Task title"
            placeholderTextColor={colors.muted}
            autoFocus
          />
          <TextInput
            style={[styles.qaTextArea, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border, marginTop: 12 }]}
            value={taskDescription}
            onChangeText={setTaskDescription}
            placeholder="Description (optional)"
            placeholderTextColor={colors.muted}
            multiline
            textAlignVertical="top"
          />
        </>,
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    marginLeft: 14,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  sheetWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 8,
  },
  handleBar: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  comingSoonBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: '#f59e0b',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  quickAddDivider: {
    borderTopWidth: 1,
    marginHorizontal: 20,
    paddingTop: 12,
    marginBottom: 8,
  },
  quickAddLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  quickAddRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
  },
  quickAddItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickAddCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  qaOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  qaBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  qaSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  qaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  qaHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  qaHeaderBtn: {
    fontSize: 16,
  },
  qaBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  qaInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  qaTextArea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
  },
});
