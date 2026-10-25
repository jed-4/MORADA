import { useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Linking, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';
import { useTheme } from '../theme';

/**
 * What a CLIENT (homeowner) login sees in the phone app, for now.
 *
 * Every tab in the app is a builder screen; the server refuses clients on
 * nearly all of them, so a client used to land on a wall of errors. Until the
 * client mode is built, send them to the web portal (which is built for them)
 * and still let them sign out or delete their account — guideline 5.1.1(v)
 * applies to every account, not just builders'.
 */
export default function ClientHoldingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout, deleteAccount } = useAuth();
  const [busy, setBusy] = useState(false);

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

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.body}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          Hi{user?.firstName ? ` ${user.firstName}` : ''}
        </Text>
        <Text style={[styles.text, { color: theme.textSecondary }]}>
          Your project is available in the Morada client portal. Open it in your browser to follow progress, make selections, sign variations and see invoices.
        </Text>
        <Text style={[styles.text, { color: theme.textSecondary }]}>
          The client portal is coming to this app soon.
        </Text>

        <TouchableOpacity
          style={[styles.primary, { backgroundColor: theme.primary }]}
          onPress={() => Linking.openURL(API_BASE_URL)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryText}>Open client portal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        {busy ? (
          <ActivityIndicator color={theme.textSecondary} />
        ) : (
          <>
            <TouchableOpacity onPress={logout} style={styles.link} activeOpacity={0.7}>
              <Text style={[styles.linkText, { color: theme.textSecondary }]}>Sign out</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} style={styles.link} activeOpacity={0.7}>
              <Text style={[styles.linkText, { color: theme.statusDanger }]}>Delete account</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'space-between' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 72, height: 72, borderRadius: 16, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  text: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 12 },
  primary: { borderRadius: 8, paddingVertical: 16, alignSelf: 'stretch', alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  footer: { alignItems: 'center', gap: 4 },
  link: { paddingVertical: 10, paddingHorizontal: 16 },
  linkText: { fontSize: 15, fontWeight: '500' },
});
