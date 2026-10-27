import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../services/api';
import { buildLabel } from '../../lib/sentry';
import { useTheme, fontSize, fontWeight } from '../../theme';
import { ClientCard } from '../../components/client/ClientUI';

/**
 * A client's account: who they're signed in as, the web portal for anything
 * not in the app yet, sign out, and account deletion (App Store guideline
 * 5.1.1(v) covers every account, not just builders').
 */
export default function ClientAccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || 'Your account';

  const confirmDelete = () => {
    Alert.alert(
      'Delete your account?',
      "This removes your login, name, email, phone and photo, and signs you out on every device. Your builder keeps the records of your project. This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteAccount();
            } catch (err: any) {
              setBusy(false);
              Alert.alert("Couldn't delete account", err?.message || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const Row = ({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) => (
    <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={danger ? theme.statusDanger : theme.textSecondary} />
      <Text style={[styles.rowText, { color: danger ? theme.statusDanger : theme.textPrimary }]}>{label}</Text>
      {!danger && <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />}
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.barTitle, { color: theme.textPrimary }]}>Account</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <ClientCard style={styles.who}>
          <View style={[styles.avatar, { backgroundColor: theme.primaryLight }]}>
            <Ionicons name="person-outline" size={22} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.textPrimary }]}>{name}</Text>
            {!!user?.email && <Text style={[styles.email, { color: theme.textSecondary }]}>{user.email}</Text>}
          </View>
        </ClientCard>

        <ClientCard style={styles.group}>
          <Row icon="globe-outline" label="Open the web portal" onPress={() => Linking.openURL(API_BASE_URL)} />
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Row icon="log-out-outline" label="Sign out" onPress={logout} />
        </ClientCard>

        <ClientCard style={styles.group}>
          {busy ? (
            <View style={styles.row}><ActivityIndicator color={theme.textSecondary} /></View>
          ) : (
            <Row icon="trash-outline" label="Delete account" onPress={confirmDelete} danger />
          )}
        </ClientCard>

        <Text style={[styles.build, { color: theme.textMuted }]}>Morada {buildLabel}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  barTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  content: { padding: 16, gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: fontSize.base, fontWeight: fontWeight.semibold },
  email: { fontSize: fontSize.bodySm, marginTop: 2 },
  group: { paddingVertical: 2, paddingHorizontal: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  rowText: { flex: 1, fontSize: fontSize.bodyLg },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 46 },
  build: { fontSize: fontSize.xs, textAlign: 'center', marginTop: 12 },
});
