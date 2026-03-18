import { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
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

interface MorePanelProps {
  visible: boolean;
  onClose: () => void;
  navigationRef: React.RefObject<any>;
}

interface MoreItem {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  action: 'navigate' | 'coming-soon';
  tab?: string;
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
];

const moreItems: MoreItem[] = [
  { id: 'notes', label: 'Notes', icon: 'document-text', color: '#10b981', action: 'navigate', screen: 'Notes' },
  { id: 'site-diary', label: 'Site Diary', icon: 'book', color: '#b196d2', action: 'navigate', screen: 'SiteDiaryList' },
  { id: 'tasks', label: 'My Tasks', icon: 'checkbox', color: '#8b5cf6', action: 'navigate', screen: 'Tasks' },
  { id: 'checklists', label: 'Checklists', icon: 'checkmark-done', color: '#22c55e', action: 'navigate', screen: 'Checklists' },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles', color: '#10b981', action: 'coming-soon' },
  { id: 'contacts', label: 'Contacts', icon: 'people', color: '#f59e0b', action: 'coming-soon' },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#6b7280', action: 'coming-soon' },
];

const SHEET_HEIGHT = 440;

export default function MorePanel({ visible, onClose, navigationRef }: MorePanelProps) {
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
    if (visible) {
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
    }
  }, [visible, slideAnim, fadeAnim]);

  const colors = isDark
    ? {
        text: '#f1f5f9',
        secondary: '#94a3b8',
        sheetBg: '#1e293b',
        accent: '#b196d2',
        handle: '#475569',
        inputBg: '#0f172a',
        border: '#334155',
        muted: '#64748b',
      }
    : {
        text: '#0f172a',
        secondary: '#64748b',
        sheetBg: '#1e293b',
        accent: '#9b7fc4',
        handle: '#64748b',
        inputBg: '#ffffff',
        border: '#e2e8f0',
        muted: '#94a3b8',
      };

  const nav = () => navigationRef.current;

  const closeAndNavigate = (action: () => void) => {
    onClose();
    setTimeout(action, 50);
  };

  const handleItemPress = (item: MoreItem) => {
    if (item.action === 'coming-soon') return;
    if (item.tab) {
      closeAndNavigate(() => nav()?.navigate(item.tab!));
      return;
    }
    if (item.screen) {
      closeAndNavigate(() => nav()?.navigate('More', { screen: item.screen }));
    }
  };

  const handleQuickAdd = (item: QuickAddItem) => {
    switch (item.id) {
      case 'note':
        closeAndNavigate(() => nav()?.navigate('More', { screen: 'Notes' }));
        break;
      case 'task':
        // Close the panel first — two simultaneous Modals freeze iOS.
        // Show the task modal only after the panel's slide-out animation completes.
        onClose();
        setTimeout(() => {
          setTaskTitle('');
          setTaskDescription('');
          setShowTaskModal(true);
        }, 350);
        break;
      case 'site-diary':
        closeAndNavigate(() => nav()?.navigate('More', { screen: 'SiteDiaryList', params: { openCreate: true } }));
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
      await apiRequest('/api/notes', 'POST', {
        title: noteTitle.trim(),
        content: noteContent.trim() || noteTitle.trim(),
        type: 'note',
        scope: 'personal',
        category: 'General',
        priority: 'low',
      });
      setShowNoteModal(false);
      setNoteTitle('');
      setNoteContent('');
      Alert.alert('Saved', 'Note created successfully.');
    } catch {
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
      await apiRequest('/api/notes', 'POST', {
        title: taskTitle.trim(),
        content: taskDescription.trim() || taskTitle.trim(),
        type: 'task',
        status: 'todo',
        scope: 'personal',
        category: 'General',
        priority: 'medium',
      });
      setShowTaskModal(false);
      setTaskTitle('');
      setTaskDescription('');
      Alert.alert('Saved', 'Task created successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderQuickAddModal = (
    modalVisible: boolean,
    onModalClose: () => void,
    title: string,
    onSave: () => void,
    children: React.ReactNode,
  ) => (
    <Modal visible={modalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.qaOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.qaBackdrop} activeOpacity={1} onPress={onModalClose} />
        <View style={[styles.qaSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
          <View style={[styles.qaHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
            <TouchableOpacity onPress={onModalClose}>
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
          <View style={styles.qaBody}>{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

          {user && (
            <Animated.View style={[styles.profileSection, { opacity: fadeAnim }]}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={styles.avatarText}>
                  {(user.firstName?.[0] || user.email?.[0] || '?').toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: '#f1f5f9' }]}>
                  {user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
                </Text>
                <Text style={[styles.profileEmail, { color: '#94a3b8' }]}>{user.email}</Text>
              </View>
            </Animated.View>
          )}

          <Animated.View
            style={[
              styles.sheet,
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
                  <View
                    style={[
                      styles.quickAddCircle,
                      { backgroundColor: item.color + '20', borderColor: item.color + '40' },
                    ]}
                  >
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
      </Modal>

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
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    zIndex: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
    paddingHorizontal: 16,
  },
  handleBar: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  gridItem: {
    width: '33.33%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  comingSoonBadge: {
    fontSize: 9,
    color: '#94a3b8',
    marginTop: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickAddDivider: {
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 12,
    marginBottom: 4,
  },
  quickAddLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  quickAddRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAddItem: {
    alignItems: 'center',
    paddingVertical: 6,
    width: 72,
  },
  quickAddCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  qaOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  qaBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  qaSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  qaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  qaHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  qaHeaderBtn: {
    fontSize: 16,
  },
  qaBody: {
    padding: 20,
  },
  qaInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  qaTextArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    height: 120,
  },
});
