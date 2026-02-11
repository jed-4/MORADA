import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Modal,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';

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
  requiresProject?: boolean;
}

const moreItems: MoreItem[] = [
  { id: 'site-diary', label: 'Site Diary', icon: 'book', color: '#3b82f6', action: 'navigate', screen: 'SiteDiary', requiresProject: true },
  { id: 'tasks', label: 'My Tasks', icon: 'checkbox', color: '#8b5cf6', action: 'coming-soon' },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles', color: '#10b981', action: 'coming-soon' },
  { id: 'contacts', label: 'Contacts', icon: 'people', color: '#f59e0b', action: 'coming-soon' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', color: '#ef4444', action: 'coming-soon' },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#6b7280', action: 'coming-soon' },
];

interface Project {
  id: string;
  name: string;
  status?: string;
}

export default function MoreScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [pendingScreen, setPendingScreen] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const colors = isDark
    ? {
        bg: '#0f172a',
        text: '#f1f5f9',
        secondary: '#94a3b8',
        sheetBg: '#1e293b',
        sheetBorder: '#334155',
        itemBg: '#334155',
        accent: '#3b82f6',
        overlay: 'rgba(0,0,0,0.6)',
      }
    : {
        bg: '#f8fafc',
        text: '#0f172a',
        secondary: '#64748b',
        sheetBg: '#1e293b',
        sheetBorder: '#334155',
        itemBg: '#334155',
        accent: '#2563eb',
        overlay: 'rgba(0,0,0,0.5)',
      };

  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const data: any[] = await apiFetch('/api/projects');
      const activeProjects = data.filter((p: any) => p.isActive && !p.isArchived && !p.isBusiness);
      setProjects(activeProjects);
    } catch {
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleItemPress = (item: MoreItem) => {
    if (item.action === 'coming-soon') {
      return;
    }

    if (item.requiresProject) {
      setPendingScreen(item.screen || '');
      fetchProjects();
      setShowProjectPicker(true);
    } else if (item.screen) {
      navigation.navigate(item.screen);
    }
  };

  const handleProjectSelect = (project: Project) => {
    setShowProjectPicker(false);
    if (pendingScreen === 'SiteDiary') {
      navigation.navigate('Projects', {
        screen: 'SiteDiary',
        params: { projectId: project.id, projectName: project.name },
      });
    }
    setPendingScreen(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>More</Text>
      </View>

      <View style={styles.gridContainer}>
        <View style={[styles.gridSheet, { backgroundColor: colors.sheetBg }]}>
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
        </View>
      </View>

      {user && (
        <View style={[styles.profileSection, { borderTopColor: isDark ? '#334155' : '#e2e8f0' }]}>
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
        </View>
      )}

      <Modal visible={showProjectPicker} transparent animationType="slide">
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.pickerSheet, { backgroundColor: isDark ? '#1e293b' : '#ffffff' }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: isDark ? '#334155' : '#e2e8f0' }]}>
              <Text style={[styles.pickerTitle, { color: isDark ? '#f1f5f9' : '#0f172a' }]}>
                Select a Project
              </Text>
              <TouchableOpacity onPress={() => { setShowProjectPicker(false); setPendingScreen(null); }}>
                <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
              </TouchableOpacity>
            </View>

            {loadingProjects ? (
              <View style={styles.pickerLoading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : projects.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Ionicons name="folder-open-outline" size={48} color={isDark ? '#475569' : '#cbd5e1'} />
                <Text style={[styles.pickerEmptyText, { color: isDark ? '#94a3b8' : '#64748b' }]}>
                  No projects found
                </Text>
              </View>
            ) : (
              <FlatList
                data={projects}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.pickerList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.projectRow, { borderBottomColor: isDark ? '#334155' : '#f1f5f9' }]}
                    onPress={() => handleProjectSelect(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="briefcase-outline" size={20} color={colors.accent} />
                    <Text style={[styles.projectName, { color: isDark ? '#f1f5f9' : '#0f172a' }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={isDark ? '#475569' : '#cbd5e1'} />
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  gridSheet: {
    borderRadius: 16,
    padding: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
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
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginTop: 'auto',
    borderTopWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  profileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  profileName: {
    fontSize: 15,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    minHeight: 300,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  pickerLoading: {
    padding: 40,
    alignItems: 'center',
  },
  pickerEmpty: {
    padding: 40,
    alignItems: 'center',
  },
  pickerEmptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  pickerList: {
    paddingBottom: 40,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  projectName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
});
