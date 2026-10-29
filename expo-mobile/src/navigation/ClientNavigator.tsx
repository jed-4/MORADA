import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { usePolling } from '../lib/usePolling';
import { apiFetch } from '../services/api';
import { setAppBadgeCount } from '../services/pushNotifications';
import { navigateClientFromPush } from './navigationRef';
import { PORTAL_KEYS } from '../lib/clientPortal';
import { useTheme, fontSize, fontWeight } from '../theme';
import { ClientProjectProvider, useClientProject } from '../contexts/ClientProjectContext';
import { ClientEmpty, ClientHeader, ClientLoading } from '../components/client/ClientUI';
import ClientHomeScreen from '../screens/client/ClientHomeScreen';
import ClientScheduleScreen from '../screens/client/ClientScheduleScreen';
import ClientUpdatesScreen from '../screens/client/ClientUpdatesScreen';
import ClientAccountScreen from '../screens/client/ClientAccountScreen';
import ClientSelectionsScreen from '../screens/client/ClientSelectionsScreen';
import ClientSelectionDetailScreen from '../screens/client/ClientSelectionDetailScreen';
import ClientMoneyScreen from '../screens/client/ClientMoneyScreen';
import ClientVariationDetailScreen from '../screens/client/ClientVariationDetailScreen';
import ClientInvoiceDetailScreen from '../screens/client/ClientInvoiceDetailScreen';
import ClientMessagesScreen from '../screens/client/ClientMessagesScreen';
import MessageThreadScreen from '../screens/MessageThreadScreen';

/**
 * Client mode — what a homeowner gets instead of the builder's tabs.
 *
 * Same app, same session, same server: the only branch is AppNavigator, on
 * userCategory. Five tabs at most — Home, Schedule, Selections, Money
 * (variations + progress claims), Messages — each shown only when the
 * client's role holds `view` on its portal.* key, the same keys the web
 * portal reads (client/src/lib/clientSections.ts). Unticking a section in
 * Roles & Permissions hides it on the phone and the web together. Site
 * updates live off Home. The server still enforces every request; hiding a
 * tab is presentation only.
 */

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  ClientHome: ['home', 'home-outline'],
  ClientSchedule: ['calendar', 'calendar-outline'],
  ClientSelections: ['color-palette', 'color-palette-outline'],
  ClientMoney: ['wallet', 'wallet-outline'],
  ClientMessages: ['chatbubbles', 'chatbubbles-outline'],
};

function ClientTabs() {
  const theme = useTheme();
  const canSchedule = usePermission(PORTAL_KEYS.schedule);
  const canSelections = usePermission(PORTAL_KEYS.selections);
  const canVariations = usePermission(PORTAL_KEYS.variations);
  const canInvoices = usePermission(PORTAL_KEYS.invoices);
  const canMessages = usePermission(PORTAL_KEYS.messages);
  const [messagesUnread, setMessagesUnread] = useState(0);

  usePolling(async () => {
    if (!canMessages) return;
    const counts = await apiFetch<Record<string, number>>('/api/channels/unread/counts');
    setMessagesUnread(Object.values(counts || {}).reduce((s, n) => s + n, 0));
  }, 15000);

  return (
    <Tab.Navigator
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => {
          const [on, off] = TAB_ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return (
            <View style={[styles.tabIcon, { backgroundColor: focused ? theme.primaryLight : 'transparent' }]}>
              <Ionicons name={focused ? on : off} size={22} color={color} />
            </View>
          );
        },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 74,
          paddingTop: 8,
          paddingBottom: 14,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3 },
      })}
    >
      <Tab.Screen name="ClientHome" component={ClientHomeScreen} options={{ title: 'Home' }} />
      {canSchedule && <Tab.Screen name="ClientSchedule" component={ClientScheduleScreen} options={{ title: 'Schedule' }} />}
      {canSelections && <Tab.Screen name="ClientSelections" component={ClientSelectionsScreen} options={{ title: 'Selections' }} />}
      {(canVariations || canInvoices) && <Tab.Screen name="ClientMoney" component={ClientMoneyScreen} options={{ title: 'Money' }} />}
      {canMessages && (
        <Tab.Screen
          name="ClientMessages"
          component={ClientMessagesScreen}
          options={{ title: 'Messages', tabBarBadge: messagesUnread > 0 ? messagesUnread : undefined }}
        />
      )}
    </Tab.Navigator>
  );
}

/** Signed in, but no project has been shared with them yet. */
function NoProject() {
  const theme = useTheme();
  const navigation = useNavigation<any>();
  const { error, reload } = useClientProject();
  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ClientHeader
        title="Morada"
        right={
          <Pressable onPress={() => navigation.navigate('ClientAccount')} hitSlop={10} accessibilityLabel="Account">
            <Ionicons name="person-circle-outline" size={30} color={theme.primary} />
          </Pressable>
        }
      />
      {error ? (
        <>
          <ClientEmpty icon="cloud-offline-outline" title="Couldn't load your project" body="Check your connection and try again." />
          <Pressable onPress={reload} style={styles.retry}>
            <Text style={[styles.retryText, { color: theme.primary }]}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <ClientEmpty
          icon="home-outline"
          title="No project yet"
          body="Your builder hasn't shared a project with you yet. It'll appear here as soon as they do."
        />
      )}
    </View>
  );
}

function ClientRoot() {
  const theme = useTheme();
  const { project, isLoading } = useClientProject();
  if (isLoading) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <ClientLoading />
      </View>
    );
  }
  return project ? <ClientTabs /> : <NoProject />;
}

/** Notification taps and the app badge — MainTabs does the same for the team. */
function useClientNotifications() {
  const syncBadge = async () => {
    const { count } = await apiFetch<{ count: number }>('/api/notifications/unread-count');
    await setAppBadgeCount(count || 0);
  };
  usePolling(syncBadge, 60000);

  useEffect(() => {
    let cancelled = false;
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      syncBadge().catch(() => {});
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateClientFromPush(response?.notification?.request?.content?.data as any);
      syncBadge().catch(() => {});
    });
    // Cold start: the app was opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) {
        setTimeout(() => navigateClientFromPush(response.notification?.request?.content?.data as any), 400);
      }
    });
    return () => {
      cancelled = true;
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}

export default function ClientNavigator() {
  useClientNotifications();
  return (
    <ClientProjectProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ClientRoot" component={ClientRoot} />
        <Stack.Screen name="ClientAccount" component={ClientAccountScreen} />
        <Stack.Screen name="ClientUpdates" component={ClientUpdatesScreen} />
        <Stack.Screen name="ClientSelectionDetail" component={ClientSelectionDetailScreen} />
        <Stack.Screen name="ClientVariationDetail" component={ClientVariationDetailScreen} />
        <Stack.Screen name="ClientInvoiceDetail" component={ClientInvoiceDetailScreen} />
        <Stack.Screen name="ClientMessageThread" component={MessageThreadScreen as any} />
      </Stack.Navigator>
    </ClientProjectProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { justifyContent: 'center' },
  tabIcon: { width: 52, height: 28, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  retry: { alignSelf: 'center', padding: 12 },
  retryText: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
});
