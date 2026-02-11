import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

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

const moreItems: MoreItem[] = [
  { id: 'site-diary', label: 'Site Diary', icon: 'book', color: '#3b82f6', action: 'navigate', screen: 'SiteDiaryList' },
  { id: 'tasks', label: 'My Tasks', icon: 'checkbox', color: '#8b5cf6', action: 'coming-soon' },
  { id: 'messages', label: 'Messages', icon: 'chatbubbles', color: '#10b981', action: 'coming-soon' },
  { id: 'contacts', label: 'Contacts', icon: 'people', color: '#f59e0b', action: 'coming-soon' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', color: '#ef4444', action: 'coming-soon' },
  { id: 'settings', label: 'Settings', icon: 'settings', color: '#6b7280', action: 'coming-soon' },
];

export default function MoreScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const colors = isDark
    ? {
        bg: '#0f172a',
        text: '#f1f5f9',
        secondary: '#94a3b8',
        sheetBg: '#1e293b',
        accent: '#3b82f6',
      }
    : {
        bg: '#f8fafc',
        text: '#0f172a',
        secondary: '#64748b',
        sheetBg: '#1e293b',
        accent: '#2563eb',
      };

  const handleItemPress = (item: MoreItem) => {
    if (item.action === 'coming-soon') {
      return;
    }
    if (item.screen) {
      navigation.navigate(item.screen);
    }
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
});
