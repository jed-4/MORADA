import { useState, useRef, useEffect } from 'react';
import { NavigationContainer, StackActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePolling } from '../lib/usePolling';
import { haptic } from '../lib/haptics';
import MorePanel from '../components/MorePanel';
import { apiFetch } from '../services/api';
import { navigationRef, navigateFromPush } from './navigationRef';
import { setAppBadgeCount } from '../services/pushNotifications';
import { useTheme } from '../theme';
import { navigationIntegration } from '../lib/sentry';

import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import DashboardScreen from '../screens/DashboardScreen';
import BusinessDashboardScreen from '../screens/BusinessDashboardScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import ClientDetailScreen from '../screens/ClientDetailScreen';
import ProjectTasksScreen from '../screens/ProjectTasksScreen';
import TasksScreen from '../screens/TasksScreen';
import TimesheetsScreen from '../screens/TimesheetsScreen';
import SiteDiaryScreen from '../screens/SiteDiaryScreen';
import SiteDiaryListScreen from '../screens/SiteDiaryListScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import CalendarScreen from '../screens/CalendarScreen';
import ChecklistsScreen from '../screens/ChecklistsScreen';
import ScopeScreen from '../screens/ScopeScreen';
import NotesListScreen from '../screens/NotesListScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import MessageThreadScreen from '../screens/MessageThreadScreen';
import ReceiptCaptureScreen from '../screens/ReceiptCaptureScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Re-pressing the focused tab pops its nested stack back to the root with the
// native back (slide-right) animation, instead of re-navigating forward.
const popToTopOnRepress = ({ navigation, route }: any) => ({
  tabPress: () => {
    const nestedState = route.state as { key?: string; index?: number } | undefined;
    if (navigation.isFocused() && nestedState?.key && (nestedState.index ?? 0) > 0) {
      navigation.dispatch({ ...StackActions.popToTop(), target: nestedState.key });
    }
  },
});

function WorkspaceStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="WorkspaceHome" component={DashboardScreen} />
      <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: 'Notifications' }}
      />
    </Stack.Navigator>
  );
}

function ProjectsStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.textPrimary,
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
        name="ClientDetail"
        component={ClientDetailScreen}
        options={({ route }: any) => ({ headerShown: true, title: route.params?.contactName || 'Client' })}
      />
      <Stack.Screen
        name="SiteDiary"
        component={SiteDiaryScreen}
        options={({ route }: any) => ({ title: `${route.params?.projectName || 'Project'} - Site Diary` })}
      />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={{ title: 'Checklists' }} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Schedule' }} />
      <Stack.Screen name="Scope" component={ScopeScreen} options={{ title: 'Scope' }} />
      <Stack.Screen
        name="ProjectTasks"
        component={ProjectTasksScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReceiptCapture"
        component={ReceiptCaptureScreen}
        options={{ headerShown: true, title: 'Capture Receipt' }}
      />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="MessagesList" component={MessagesScreen} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      // The More tab press is intercepted to toggle MorePanel, so this stack is
      // only entered via navigate('More', { screen }); Settings is a safety net.
      initialRouteName="Settings"
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.textPrimary,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="SiteDiaryList" component={SiteDiaryListScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ headerShown: true, title: 'Schedule' }} />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={{ headerShown: true, title: 'Checklists' }} />
      <Stack.Screen name="Tasks" component={TasksScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Timesheets" component={TimesheetsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MyCalendar" component={CalendarScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notes" component={NotesListScreen} options={{ headerShown: true, title: 'Notes' }} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const theme = useTheme();
  const [moreVisible, setMoreVisible] = useState(false);
  const [moreNonce, setMoreNonce] = useState(0);
  const tabNavRef = useRef<any>(null);
  const [messagesUnread, setMessagesUnread] = useState(0);

  usePolling(async () => {
    const counts = await apiFetch<Record<string, number>>('/api/channels/unread/counts');
    const total = Object.values(counts || {}).reduce((s, n) => s + n, 0);
    setMessagesUnread(total);
  }, 15000);

  // Keep the app icon badge synced with the unread count (paused while
  // backgrounded — pushes update the badge natively when the app is closed).
  const syncBadge = async () => {
    const { count } = await apiFetch<{ count: number }>('/api/notifications/unread-count');
    await setAppBadgeCount(count || 0);
  };
  usePolling(syncBadge, 60000);

  // Route notification taps to the right screen.
  useEffect(() => {
    let cancelled = false;

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      syncBadge().catch(() => {});
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromPush(response?.notification?.request?.content?.data as any);
      syncBadge().catch(() => {});
    });

    // Cold start: app launched by tapping a notification banner.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) {
        setTimeout(
          () => navigateFromPush(response.notification?.request?.content?.data as any),
          400,
        );
      }
    });

    return () => {
      cancelled = true;
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);

  const colors = {
    bg: theme.background,
    card: theme.card,
    border: theme.border,
    active: theme.primary,
    inactive: theme.textMuted,
  };

  return (
    <>
      <Tab.Navigator
        screenListeners={{
          tabPress: () => haptic.select(),
        }}
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home';
            if (route.name === 'Workspace') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'Projects') iconName = focused ? 'briefcase' : 'briefcase-outline';
            else if (route.name === 'Messages') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
            else if (route.name === 'Calendar') iconName = focused ? 'calendar' : 'calendar-outline';
            else if (route.name === 'More') iconName = moreVisible ? 'grid' : 'grid-outline';
            // Soft plum pill behind the active tab's icon.
            return (
              <View
                style={{
                  width: 52,
                  height: 28,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? theme.primaryLight : 'transparent',
                }}
              >
                <Ionicons name={iconName} size={22} color={color} />
              </View>
            );
          },
          tabBarActiveTintColor: colors.active,
          tabBarInactiveTintColor: colors.inactive,
          tabBarStyle: {
            backgroundColor: theme.card,
            borderTopColor: colors.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: 74,
            paddingTop: 8,
            paddingBottom: 14,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3 },
          headerShown: false,
        })}
      >
        <Tab.Screen
          name="Workspace"
          component={WorkspaceStack}
          listeners={popToTopOnRepress}
        />
        <Tab.Screen
          name="Projects"
          component={ProjectsStack}
          listeners={popToTopOnRepress}
        />
        <Tab.Screen
          name="Messages"
          component={MessagesStack}
          options={{ tabBarBadge: messagesUnread > 0 ? messagesUnread : undefined }}
          listeners={popToTopOnRepress}
        />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen
          name="More"
          component={MoreStack}
          listeners={({ navigation }) => {
            tabNavRef.current = navigation;
            return {
              // Always open: the sheet's backdrop covers the tab bar, so the
              // More tab is only reachable while the panel is closed. Toggling
              // a boolean here could desync from the sheet and eat taps.
              tabPress: (e) => {
                e.preventDefault();
                setMoreVisible(true);
                setMoreNonce((n) => n + 1);
              },
            };
          }}
        />
      </Tab.Navigator>

      <MorePanel
        visible={moreVisible}
        onClose={() => setMoreVisible(false)}
        navigationRef={tabNavRef}
        presentNonce={moreNonce}
        messagesUnread={messagesUnread}
      />
    </>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();

  if (isLoading) {
    // Match the app background while the stored session is validated,
    // instead of flashing a blank white frame.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      ref={navigationRef}
      onReady={() => {
        navigationIntegration.registerNavigationContainer(navigationRef);
      }}
      theme={{
        dark: isDark,
        colors: {
          primary: theme.primary,
          background: theme.background,
          card: theme.card,
          text: theme.textPrimary,
          border: theme.border,
          notification: theme.statusDanger,
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
