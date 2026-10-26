import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { haptic } from '../lib/haptics';
import { usePermission } from '../lib/usePermission';
import { PORTAL_KEYS } from '../lib/clientPortal';
import { useTheme, fontSize, fontWeight } from '../theme';
import { ClientProjectProvider, useClientProject } from '../contexts/ClientProjectContext';
import { ClientEmpty, ClientHeader, ClientLoading } from '../components/client/ClientUI';
import ClientHomeScreen from '../screens/client/ClientHomeScreen';
import ClientScheduleScreen from '../screens/client/ClientScheduleScreen';
import ClientUpdatesScreen from '../screens/client/ClientUpdatesScreen';
import ClientAccountScreen from '../screens/client/ClientAccountScreen';

/**
 * Client mode — what a homeowner gets instead of the builder's tabs.
 *
 * Same app, same session, same server: the only branch is here, on
 * userCategory. Each tab appears only when the client's role holds `view` on
 * its portal.* key — the same keys the web portal reads
 * (client/src/lib/clientSections.ts) — so unticking a section in
 * Roles & Permissions hides it on the phone and the web together. The server
 * still enforces every request; hiding a tab is presentation only.
 */

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  ClientHome: ['home', 'home-outline'],
  ClientSchedule: ['calendar', 'calendar-outline'],
  ClientUpdates: ['newspaper', 'newspaper-outline'],
};

function ClientTabs() {
  const theme = useTheme();
  const canSchedule = usePermission(PORTAL_KEYS.schedule);
  const canDiary = usePermission(PORTAL_KEYS.siteDiary);

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
      {canDiary && <Tab.Screen name="ClientUpdates" component={ClientUpdatesScreen} options={{ title: 'Updates' }} />}
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

export default function ClientNavigator() {
  return (
    <ClientProjectProvider>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="ClientRoot" component={ClientRoot} />
        <Stack.Screen name="ClientAccount" component={ClientAccountScreen} />
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
