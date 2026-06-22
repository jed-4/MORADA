import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../services/api';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { useTheme } from '../theme';

interface Contact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  company?: string;
  contactType?: string;
  address?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressPostcode?: string;
  addressFormatted?: string;
}

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

const toTitleCase = (str: string) =>
  str.replace(/_/g, ' ').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

const buildAddress = (c: Contact): string => {
  if (c.addressFormatted?.trim()) return c.addressFormatted.trim();
  const parts = [c.addressStreet, c.addressCity, c.addressState, c.addressPostcode]
    .map(p => p?.trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(', ');
  return c.address?.trim() ?? '';
};

const initialsFor = (c: Contact): string => {
  const a = (c.firstName?.[0] || c.name?.[0] || '').toUpperCase();
  const b = (c.lastName?.[0] || '').toUpperCase();
  return (a + b) || '?';
};

export default function ClientDetailScreen({ navigation, route }: Props) {
  const { contactId, contactName } = (route.params || {}) as {
    contactId?: string;
    contactName?: string;
  };

  const theme = useTheme();
  const colors = {
    bg: theme.background,
    card: theme.card,
    text: theme.textPrimary,
    secondary: theme.textSecondary,
    border: theme.border,
    accent: theme.primary,
    muted: theme.textMuted,
  };

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchContact = useCallback(async () => {
    if (!contactId) {
      setError(true);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<Contact>(`/api/contacts/${contactId}`);
      setContact(data);
      setError(false);
    } catch (e) {
      console.error('Failed to fetch contact:', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchContact();
  }, [fetchContact]);

  useEffect(() => {
    navigation.setOptions({ title: contact?.name || contactName || 'Client' });
  }, [navigation, contact?.name, contactName]);

  const openLink = async (url: string, label: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Unavailable', `Unable to ${label} on this device.`);
      }
    } catch {
      Alert.alert('Unavailable', `Unable to ${label} on this device.`);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error || !contact) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.bg }]}>
        <Ionicons name="person-circle-outline" size={48} color={colors.muted} />
        <Text style={[styles.emptyText, { color: colors.secondary }]}>
          Couldn't load this client's details.
        </Text>
      </View>
    );
  }

  const address = buildAddress(contact);
  const phone = contact.phone || contact.mobile;
  const hasSecondaryMobile = !!(contact.phone && contact.mobile && contact.phone !== contact.mobile);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
    >
      {/* Identity header */}
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={styles.avatarText}>{initialsFor(contact)}</Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{contact.name}</Text>
        {!!contact.company && (
          <Text style={[styles.company, { color: colors.secondary }]}>{contact.company}</Text>
        )}
        {!!contact.contactType && (
          <View style={[styles.typeBadge, { backgroundColor: theme.primaryLight }]}>
            <Text style={[styles.typeBadgeText, { color: colors.accent }]}>
              {toTitleCase(contact.contactType)}
            </Text>
          </View>
        )}
      </View>

      {/* Contact methods */}
      <View style={[styles.sectionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {!!contact.email && (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => openLink(`mailto:${contact.email}`, 'send email')}
          >
            <View style={[styles.iconCircle, { backgroundColor: theme.tealLight }]}>
              <Ionicons name="mail-outline" size={18} color={theme.teal} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.secondary }]}>Email</Text>
              <Text style={[styles.rowValue, { color: colors.accent }]}>{contact.email}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}

        {!!phone && (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => openLink(`tel:${phone}`, 'call')}
          >
            <View style={[styles.iconCircle, { backgroundColor: theme.sageLight }]}>
              <Ionicons name="call-outline" size={18} color={theme.sage} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.secondary }]}>
                {contact.phone ? 'Phone' : 'Mobile'}
              </Text>
              <Text style={[styles.rowValue, { color: colors.accent }]}>{phone}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}

        {hasSecondaryMobile && (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.6}
            onPress={() => openLink(`tel:${contact.mobile}`, 'call')}
          >
            <View style={[styles.iconCircle, { backgroundColor: theme.sageLight }]}>
              <Ionicons name="phone-portrait-outline" size={18} color={theme.sage} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.secondary }]}>Mobile</Text>
              <Text style={[styles.rowValue, { color: colors.accent }]}>{contact.mobile}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}

        {!!address && (
          <View style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: theme.amberLight }]}>
              <Ionicons name="location-outline" size={18} color={theme.amber} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: colors.secondary }]}>Address</Text>
              <Text style={[styles.rowValue, { color: colors.text }]}>{address}</Text>
            </View>
          </View>
        )}

        {!contact.email && !phone && !address && (
          <Text style={[styles.rowLabel, { color: colors.muted, padding: 4 }]}>
            No contact details on file
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  content: { padding: 16, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center' },

  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  avatarText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  company: { fontSize: 14, textAlign: 'center' },
  typeBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },

  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  rowValue: { fontSize: 14 },
});
