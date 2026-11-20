import { useState, useRef, useEffect } from 'react';
import { NavigationContainer, StackActions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as Notifications from 'expo-notifications';
import { usePolling } from '../lib/usePolling';
import { haptic } from '../lib/haptics';
import MorePanel, { type MorePanelHandle } from '../components/MorePanel';
import { apiFetch } from '../services/api';
import { navigationRef, navigateFromPush } from './navigationRef';
import { setAppBadgeCount } from '../services/pushNotifications';
import { handleNotificationAction, registerNotificationCategories } from '../services/notificationActions';
import { refreshSiteFences } from '../services/siteGeofence';
import { useTheme, type Theme } from '../theme';
import { goBackOrHome, isFirstRoute } from './back';
import OfflineFrame from '../components/ui/OfflineBanner';
import { navigationIntegration } from '../lib/sentry';
import { useOrientationPolicy } from '../lib/orientation';
import { useRestoredNavigationState } from './navigationPersistence';
import { useShareIntentRouting } from './useShareIntentRouting';
import type { NavigationState } from '@react-navigation/native';
import { navigateFromDeepLink } from './deepLinks';
import { startWidgetSync } from '../services/widgetSnapshot';

import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import ClientNavigator from './ClientNavigator';
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
import SelectionsScreen from '../screens/SelectionsScreen';
import SelectionDetailScreen from '../screens/SelectionDetailScreen';
import SelectionsProjectsScreen from '../screens/SelectionsProjectsScreen';
import NotesListScreen from '../screens/NotesListScreen';
import NoteEditorScreen from '../screens/NoteEditorScreen';
import SettingsScreen from '../screens/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MessagesScreen from '../screens/MessagesScreen';
import MessageThreadScreen from '../screens/MessageThreadScreen';
import ReceiptCaptureScreen from '../screens/ReceiptCaptureScreen';
import LabourHoursScreen from '../screens/LabourHoursScreen';
import DefectsListScreen from '../screens/DefectsListScreen';
import DefectDetailScreen from '../screens/DefectDetailScreen';
import DefectCaptureScreen from '../screens/DefectCaptureScreen';
import DeliveriesListScreen from '../screens/DeliveriesListScreen';
import DeliveryCheckInScreen from '../screens/DeliveryCheckInScreen';
import ShareTargetScreen from '../screens/ShareTargetScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Share into Morada is a one-off modal over the files just shared: never
// reopen it from the remembered navigation state after a relaunch.
function withoutShareTarget(state: NavigationState | undefined): NavigationState | undefined {
  if (!state || !state.routes.some(r => r.name === 'ShareTarget')) return state;
  const routes = state.routes.filter(r => r.name !== 'ShareTarget');
  return { ...state, routes, index: Math.min(state.index, routes.length - 1) } as NavigationState;
}

/**
 * Shared options for every tab's stack.
 *
 * Back on a stack's FIRST route: screens are often opened across stacks — the
 * More panel (navigate('More', { screen })), dashboard cards
 * (navigate('Projects', { screen: 'ProjectDetail' })) and notification taps —
 * which makes them the only route in their stack, so the native header has
 * nothing to go back to and draws no back button. Whenever a header is shown
 * on a first route we draw the chevron ourselves; goBackOrHome() then falls
 * through to the tab you came from (backBehavior="history" below), or home.
 * Tab roots (WorkspaceHome, ProjectsList, MessagesList) hide the header, so
 * they never get one.
 */
function stackScreenOptions(theme: Theme, headerShown: boolean) {
  return ({ navigation, route }: { navigation: any; route: { key: string } }) => ({
    headerShown,
    headerStyle: { backgroundColor: theme.card },
    headerTintColor: theme.textPrimary,
    headerTitleStyle: { fontWeight: '600' as const },
    headerShadowVisible: false,
    headerBackButtonDisplayMode: 'minimal' as const,
    headerLeft: isFirstRoute(navigation, route.key)
      ? ({ tintColor }: { tintColor?: string }) => (
          <Pressable
            onPress={() => goBackOrHome(navigation)}
            hitSlop={10}
            style={{ width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={26} color={tintColor} />
          </Pressable>
        )
      : undefined,
  });
}

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
      screenOptions={stackScreenOptions(theme, false)}
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

/**
 * Native header title for a project page: the page name with the project
 * underneath, so it's always clear which job you're in (Jed, 11-21:
 * "a minimalist header for the project title").
 */
function projectPageOptions(page: string) {
  return ({ route }: any) => {
    const projectName: string | undefined = route.params?.projectName;
    return {
      headerShown: true,
      title: page,
      headerTitle: projectName
        ? ({ tintColor }: { tintColor?: string }) => (
            <View style={{ alignItems: 'center', maxWidth: 260 }}>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: tintColor }}>{page}</Text>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={{ fontSize: 12, opacity: 0.65, color: tintColor }}>{projectName}</Text>
            </View>
          )
        : undefined,
    };
  };
}

function ProjectsStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions(theme, true)}
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
        options={projectPageOptions('Site Diary')}
      />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={projectPageOptions('Checklists')} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={projectPageOptions('Schedule')} />
      <Stack.Screen name="Scope" component={ScopeScreen} options={projectPageOptions('Scope')} />
      <Stack.Screen name="Selections" component={SelectionsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectionDetail" component={SelectionDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notes" component={NotesListScreen} options={projectPageOptions('Notes')} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ProjectTasks"
        component={ProjectTasksScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="ReceiptCapture"
        component={ReceiptCaptureScreen}
        options={projectPageOptions('Capture Receipt')}
      />
      <Stack.Screen
        name="LabourHours"
        component={LabourHoursScreen}
        options={projectPageOptions('Labour Hours')}
      />
      <Stack.Screen name="DefectsList" component={DefectsListScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DefectDetail" component={DefectDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DefectCapture"
        component={DefectCaptureScreen}
        options={projectPageOptions('Add defects')}
      />
      {/* Deliveries: params { projectId, projectName? } / { projectId, poId, poNumber? } */}
      <Stack.Screen name="DeliveriesList" component={DeliveriesListScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="DeliveryCheckIn"
        component={DeliveryCheckInScreen}
        options={({ route }: any) => ({ headerShown: true, title: route.params?.poNumber || 'Check in delivery' })}
      />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      screenOptions={stackScreenOptions(theme, false)}
    >
      <Stack.Screen name="MessagesList" component={MessagesScreen} />
      <Stack.Screen name="MessageThread" component={MessageThreadScreen} />
    </Stack.Navigator>
  );
}

/**
 * A More-menu screen that uses the stack's own header. The back chevron for
 * these (they are usually the More stack's only route) comes from
 * stackScreenOptions.
 */
function moreHeader(title: string) {
  return { headerShown: true, title };
}

function MoreStack() {
  const theme = useTheme();

  return (
    <Stack.Navigator
      // The More tab press is intercepted to toggle MorePanel, so this stack is
      // only entered via navigate('More', { screen }); Settings is a safety net.
      initialRouteName="Settings"
      screenOptions={stackScreenOptions(theme, false)}
    >
      <Stack.Screen name="SiteDiaryList" component={SiteDiaryListScreen} />
      <Stack.Screen name="Schedule" component={ScheduleScreen} options={moreHeader('Schedule')} />
      <Stack.Screen name="Checklists" component={ChecklistsScreen} options={moreHeader('Checklists')} />
      <Stack.Screen name="Tasks" component={TasksScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Timesheets" component={TimesheetsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="MyCalendar" component={CalendarScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Notes" component={NotesListScreen} options={moreHeader('Notes')} />
      <Stack.Screen name="NoteEditor" component={NoteEditorScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SelectionsProjects" component={SelectionsProjectsScreen} options={{ headerShown: false }} />
      {/* My defects: the same list in cross-project mode (/api/defects/mine). */}
      <Stack.Screen
        name="MyDefects"
        component={DefectsListScreen}
        initialParams={{ mine: true }}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="DefectDetail" component={DefectDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const theme = useTheme();
  const [moreVisible, setMoreVisible] = useState(false);
  const morePanelRef = useRef<MorePanelHandle>(null);
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
    // Action buttons (Clock in, Approve, Reply…) are handled first; a plain
    // tap, or an action nothing claims, routes to the screen as before.
    const navigate = (name: string, params?: any) => {
      if (navigationRef.isReady()) (navigationRef.navigate as (n: string, p?: any) => void)(name, params);
    };
    const routeResponse = (response: Notifications.NotificationResponse) => {
      handleNotificationAction(response, navigate)
        .catch(() => false)
        .then((handled) => {
          if (!handled) navigateFromPush(response?.notification?.request?.content?.data as any);
        });
    };
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeResponse(response);
      syncBadge().catch(() => {});
    });

    // Cold start: app launched by tapping a notification banner (or one of its buttons).
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) {
        setTimeout(() => routeResponse(response), 400);
      }
    });

    // Arriving on site (#46): button categories, and the fence list on open.
    registerNotificationCategories().catch(() => {});
    refreshSiteFences().catch(() => {});
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSiteFences().catch(() => {});
    });

    return () => {
      cancelled = true;
      receivedSub.remove();
      responseSub.remove();
      appStateSub.remove();
    };
  }, []);

  // buildpro:// links from the Home/Lock Screen widgets and the clock-in Live
  // Activity (deepLinkRouting.ts), plus keeping the widgets fresh: now and on
  // every return to the foreground.
  useEffect(() => {
    let cancelled = false;
    Linking.getInitialURL()
      .then((url) => {
        if (url && !cancelled) setTimeout(() => navigateFromDeepLink(url), 400);
      })
      .catch(() => {});
    const urlSub = Linking.addEventListener('url', ({ url }) => navigateFromDeepLink(url));
    const stopWidgetSync = startWidgetSync();
    return () => {
      cancelled = true;
      urlSub.remove();
      stopWidgetSync();
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
        // Back from a screen opened across tabs (More panel, dashboard card,
        // notification) returns to the tab you came from, not always Home.
        backBehavior="history"
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
              // Present the sheet directly. The sheet's own backdrop covers the
              // tab bar, so More is only reachable while the panel is closed —
              // there is nothing to toggle, and no state to fall out of sync.
              tabPress: (e) => {
                e.preventDefault();
                morePanelRef.current?.present();
              },
            };
          }}
        />
      </Tab.Navigator>

      <MorePanel
        ref={morePanelRef}
        navigationRef={tabNavRef}
        onVisibilityChange={setMoreVisible}
        messagesUnread={messagesUnread}
      />
    </>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  // Clients get client mode (ClientNavigator): the builder tabs below are
  // screens the server refuses them on.
  const isClient = user?.userCategory === 'client';
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const theme = useTheme();
  // Phones stay portrait; the Duo unfolded may rotate.
  useOrientationPolicy();
  // Reopen where you were (same tab, project and screen) after a relaunch.
  const nav = useRestoredNavigationState(isAuthenticated && !isClient ? user?.id : undefined, isLoading);
  // Photos / PDFs shared from another app open ShareTarget (#44).
  const [navReady, setNavReady] = useState(false);
  useShareIntentRouting({ navReady, isAuthenticated, isClient });

  if (isLoading || !nav.ready) {
    // Match the app background while the stored session is validated,
    // instead of flashing a blank white frame.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    // Global offline bar (mounted once; pushes content, never remounts it).
    <OfflineFrame>
    <NavigationContainer
      ref={navigationRef}
      initialState={nav.initialState}
      onStateChange={(state) => nav.save(withoutShareTarget(state))}
      onReady={() => {
        navigationIntegration.registerNavigationContainer(navigationRef);
        setNavReady(true);
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
        {isAuthenticated && isClient ? (
          <Stack.Screen name="Client" component={ClientNavigator} />
        ) : isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            {/* Share into Morada: params { files: SharedFiles } (lib/shareIntake) */}
            <Stack.Screen
              name="ShareTarget"
              component={ShareTargetScreen}
              options={{ presentation: 'modal', headerShown: false }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
    </OfflineFrame>
  );
}
