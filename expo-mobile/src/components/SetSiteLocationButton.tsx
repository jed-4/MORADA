import { useState } from 'react';
import { Alert, ActivityIndicator, Text, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { apiRequest } from '../services/api';
import { refreshSiteFences } from '../services/siteGeofence';
import { useTheme, MAX_FONT_SCALE } from '../theme';

/**
 * Project screen: "Set site location — I'm on site now" (#46, uses #439's
 * PUT /api/projects/:id/site-location with source 'on_site'). The point is
 * what the arrival alerts fence around.
 */
export default function SetSiteLocationButton({ projectId }: { projectId: string }) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Location is off for Morada', 'Turn on location for Morada in iPhone Settings to set the site location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await apiRequest(`/api/projects/${projectId}/site-location`, 'PUT', {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        source: 'on_site',
      });
      refreshSiteFences().catch(() => {});
      const acc = pos.coords.accuracy ? ` (accurate to about ${Math.round(pos.coords.accuracy)} m)` : '';
      Alert.alert('Site location saved', `This job's site is now where you're standing${acc}.`);
    } catch (err: any) {
      Alert.alert("Couldn't save the site location", err?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = () =>
    Alert.alert('Set site location?', "Use where you're standing now as this job's site location?", [
      { text: 'Cancel', style: 'cancel' },
      { text: "I'm on site", onPress: save },
    ]);

  return (
    <TouchableOpacity
      style={[styles.row, { borderColor: theme.border }]}
      onPress={confirm}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel="Set site location, I'm on site now"
    >
      <Ionicons name="navigate-outline" size={16} color={theme.primary} />
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.label, { color: theme.primary }]}>
          Set site location — I'm on site now
        </Text>
      </View>
      {busy && <ActivityIndicator size="small" color={theme.primary} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  text: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600' },
});
