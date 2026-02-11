import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';

import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import TimesheetsScreen from '../screens/TimesheetsScreen';
import SiteDiaryScreen from '../screens/SiteDiaryScreen';
import SiteDiaryListScreen from '../screens/SiteDiaryListScreen';
import MoreScreen from '../screens/MoreScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function ProjectsStack() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: isDark ? '#1e293b' : '#ffffff' },
        headerTintColor: isDark ? '#f1f5f9' : '#0f172a',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="ProjectsList" component={ProjectsScreen} options={{ title: 'Projects' }} />
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={({ route }: any) => ({ title: route.params?.projectName || 'Project' })}
      />
      <Stack.Screen
        name="SiteDiary"
        component={SiteDiaryScreen}
        options={({ route }: any) => ({ title: `${route.params?.projectName || 'Project'} - Site Diary` })}
      />
    </Stack.Navigator>
  );
}

function MoreStack() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: isDark ? '#1e293b' : '#ffffff' },
        headerTintColor: isDark ? '#f1f5f9' : '#0f172a',
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="MoreHome" component={MoreScreen} />
      <Stack.Screen name="SiteDiaryList" component={SiteDiaryListScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', border: '#334155', active: '#3b82f6', inactive: '#64748b' }
    : { bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', active: '#2563eb', inactive: '#94a3b8' };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'home';
          if (route.name === 'Workspace') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Projects') iconName = focused ? 'briefcase' : 'briefcase-outline';
          else if (route.name === 'Timesheets') iconName = focused ? 'time' : 'time-outline';
          else if (route.name === 'More') iconName = focused ? 'grid' : 'grid-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.active,
        tabBarInactiveTintColor: colors.inactive,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Workspace" component={DashboardScreen} />
      <Tab.Screen name="Projects" component={ProjectsStack} />
      <Tab.Screen name="Timesheets" component={TimesheetsScreen} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  if (isLoading) {
    return null;
  }

  return (
    <NavigationContainer
      theme={{
        dark: isDark,
        colors: {
          primary: isDark ? '#3b82f6' : '#2563eb',
          background: isDark ? '#0f172a' : '#f8fafc',
          card: isDark ? '#1e293b' : '#ffffff',
          text: isDark ? '#f1f5f9' : '#0f172a',
          border: isDark ? '#334155' : '#e2e8f0',
          notification: '#ef4444',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
