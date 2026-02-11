import { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  SafeAreaView,
  Animated,
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

const SHEET_HEIGHT = 340;

export default function MoreScreen({ navigation }: Props) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { user } = useAuth();

  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

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
        accent: '#3b82f6',
        handle: '#475569',
      }
    : {
        bg: '#f8fafc',
        text: '#0f172a',
        secondary: '#64748b',
        sheetBg: '#1e293b',
        accent: '#2563eb',
        handle: '#64748b',
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
        </Animated.View>
      </View>
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
});
