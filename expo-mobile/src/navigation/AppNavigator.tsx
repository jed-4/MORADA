import { useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'react-native';
import MorePanel from '../components/MorePanel';

import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import DashboardScreen from '../screens/DashboardScreen';
import BusinessDashboardScreen from '../screens/BusinessDashboardScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import TasksScreen from '../screens/TasksScreen';
import TimesheetsScreen from '../screens/TimesheetsScreen';
import SiteDiaryScreen from '../screens/SiteDiaryScreen';
import SiteDiaryListScreen from '../screens/SiteDiaryListScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ChecklistsScreen from '../screens/ChecklistsScreen';
import MoreScreen from '../screens/MoreScreen';
import NotesListScreen from '../screens/NotesListScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function WorkspaceStack() {
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
      <Stack.Screen name="WorkspaceHome" component={DashboardScreen} />
      <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
    </Stack.Navigator>
  );
}

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
      <Stack.Screen name="ProjectsList" component={ProjectsScreen} options={{ headerShown: false }} />
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
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={{ title: 'Checklists' }} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Schedule' }} />
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
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: true, title: 'Schedule' }} />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={{ headerShown: true, title: 'Checklists' }} />
      <Stack.Screen name="Tasks" component={TasksScreen} options={{ headerShown: true, title: 'My Tasks' }} />
      <Stack.Screen name="MyCalendar" component={CalendarScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notes" component={NotesListScreen} options={{ headerShown: true, title: 'Notes' }} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [moreVisible, setMoreVisible] = useState(false);
  const tabNavRef = useRef<any>(null);

  const colors = isDark
    ? { bg: '#0f172a', card: '#1e293b', border: '#334155', active: '#b196d2', inactive: '#64748b' }
    : { bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', active: '#9b7fc4', inactive: '#94a3b8' };

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home';
            if (route.name === 'Workspace') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Projects') iconName = focused ? 'briefcase' : 'briefcase-outline';
            else if (route.name === 'Calendar') iconName = focused ? 'calendar' : 'calendar-outline';
            else if (route.name === 'Timesheets') iconName = focused ? 'time' : 'time-outline';
            else if (route.name === 'More') iconName = moreVisible ? 'grid' : 'grid-outline';
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
        <Tab.Screen name="Workspace" component={WorkspaceStack} />
        <Tab.Screen name="Projects" component={ProjectsStack} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Timesheets" component={TimesheetsScreen} />
        <Tab.Screen
          name="More"
          component={MoreStack}
          listeners={({ navigation }) => {
            tabNavRef.current = navigation;
            return {
              tabPress: (e) => {
                e.preventDefault();
                setMoreVisible((v) => !v);
              },
            };
          }}
        />
      </Tab.Navigator>

      <MorePanel
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        navigationRef={tabNavRef}
      />
    </>
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
          primary: isDark ? '#b196d2' : '#9b7fc4',
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
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
