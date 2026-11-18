import { useCallback, useMemo, useRef } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, radius } from '../../theme';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { SectionHeader } from '../ui/SectionHeader';
import { PressableScale } from '../ui/PressableScale';
import { usePersistedState } from '../../lib/usePersistedState';
import { usePermission } from '../../lib/usePermission';
import { haptic } from '../../lib/haptics';

// "Quick capture" on the home screen: big one-tap buttons for the things a
// crew grabs their phone for on site.
//
//   Photo   — camera, then a new diary entry for the project with it attached
//   Receipt — Capture Receipt
//   Defect  — the Defects walkthrough (DefectCapture)
//   Clock in — only while NOT clocked in (clocked in, the timer card above
//              already has Clock Out)
//
// Each acts on the last project used here (remembered between launches);
// with none yet, or "Change", it asks with a project list. Buttons the user's
// role can't use are hidden (the server still checks).
//
// Fold-safe: the buttons just flex across whatever width they get.

interface QuickProject {
  id: string;
  name: string;
  projectNumber?: string;
}

type Action = 'diary' | 'receipt' | 'defect';

export function QuickCaptureRow({
  projects,
  navigation,
  isClockedIn,
  style,
}: {
  /** Active projects in the user's usual order (archived/business already removed). */
  projects: QuickProject[];
  navigation: NativeStackNavigationProp<any>;
  isClockedIn: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const canDiary = usePermission('projects.site_diary', 'add');
  const canDefect = usePermission('projects.defects', 'add');
  const [lastProject, setLastProject] = usePersistedState<{ id: string; name: string } | null>(
    'quickCapture.lastProject',
    null,
  );
  const pickerRef = useRef<SheetRef>(null);
  const pendingAction = useRef<Action | null>(null);

  // Drop a remembered project that's gone (archived, removed from the user).
  // While the list hasn't loaded (offline, first launch) trust the memory.
  const project = useMemo(() => {
    if (!lastProject) return null;
    if (!projects.length) return lastProject;
    const p = projects.find(x => x.id === lastProject.id);
    return p ? { id: p.id, name: p.name } : null;
  }, [lastProject, projects]);

  const tabNav = navigation.getParent<NativeStackNavigationProp<any>>() ?? navigation;
  const openInProjects = useCallback(
    (screen: string, params: Record<string, unknown>) => tabNav.navigate('Projects', { screen, params }),
    [tabNav],
  );

  const run = useCallback(async (action: Action, p: { id: string; name: string }) => {
    const params = { projectId: p.id, projectName: p.name };
    if (action === 'receipt') {
      openInProjects('ReceiptCapture', params);
      return;
    }
    if (action === 'defect') {
      openInProjects('DefectCapture', params);
      return;
    }
    // Photo to diary: camera first, then the diary opens a new entry with it.
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Camera access is needed to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets[0]) return;
      openInProjects('SiteDiary', { ...params, captureUri: result.assets[0].uri });
    } catch (e) {
      console.warn('Quick capture camera failed:', e);
      Alert.alert('Camera Unavailable', 'Could not open the camera.');
    }
  }, [openInProjects]);

  const start = (action: Action) => {
    haptic.light();
    if (project) {
      run(action, project);
      return;
    }
    pendingAction.current = action;
    pickerRef.current?.present();
  };

  const changeProject = () => {
    haptic.select();
    pendingAction.current = null;
    pickerRef.current?.present();
  };

  const pick = (p: QuickProject) => {
    haptic.select();
    const chosen = { id: p.id, name: p.name };
    setLastProject(chosen);
    const action = pendingAction.current;
    pendingAction.current = null;
    pickerRef.current?.dismiss();
    // Let the sheet get out of the way before the camera / next screen.
    if (action) setTimeout(() => run(action, chosen), 300);
  };

  const buttons: Array<{ key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }> = [
    ...(canDiary ? [{ key: 'diary', icon: 'camera-outline' as const, label: 'Photo to diary', onPress: () => start('diary') }] : []),
    { key: 'receipt', icon: 'receipt-outline', label: 'Receipt', onPress: () => start('receipt') },
    ...(canDefect ? [{ key: 'defect', icon: 'construct-outline' as const, label: 'Defect', onPress: () => start('defect') }] : []),
    ...(!isClockedIn
      ? [{
          key: 'clock',
          icon: 'time-outline' as const,
          label: 'Clock in',
          onPress: () => { haptic.light(); tabNav.navigate('More', { screen: 'Timesheets' }); },
        }]
      : []),
  ];

  return (
    <View style={style}>
      <SectionHeader title="Quick capture" />
      <View style={styles.row}>
        {buttons.map(b => (
          <PressableScale
            key={b.key}
            onPress={b.onPress}
            style={[styles.btn, { backgroundColor: theme.card, borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={b.key === 'clock' ? 'Clock in' : `${b.label}${project ? ` for ${project.name}` : ''}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: theme.primaryLight }]}>
              <Ionicons name={b.icon} size={24} color={theme.primary} />
            </View>
            <Text style={[styles.btnLabel, { color: theme.textPrimary }]} numberOfLines={2}>{b.label}</Text>
          </PressableScale>
        ))}
      </View>
      <TouchableOpacity
        onPress={changeProject}
        style={styles.projectLine}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={project ? `Project: ${project.name}. Change project` : 'Choose a project'}
      >
        <Ionicons name="briefcase-outline" size={13} color={theme.textMuted} />
        <Text style={[styles.projectText, { color: theme.textSecondary }]} numberOfLines={1}>
          {project ? project.name : 'No project chosen yet'}
        </Text>
        <Text style={[styles.changeText, { color: theme.primary }]}>{project ? 'Change' : 'Choose'}</Text>
      </TouchableOpacity>

      <Sheet ref={pickerRef} title="Which project?" scrollable snapPoints={['60%', '88%']}>
        {projects.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No projects to choose from.</Text>
        ) : (
          projects.map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => pick(p)}
              style={[styles.pickRow, { borderBottomColor: theme.border }]}
              activeOpacity={0.7}
            >
              <Ionicons name="briefcase-outline" size={18} color={theme.primary} />
              <Text style={[styles.pickName, { color: theme.textPrimary }]} numberOfLines={1}>
                {p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}
              </Text>
              {project?.id === p.id && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
            </TouchableOpacity>
          ))
        )}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 20 },
  btn: {
    flex: 1,
    minHeight: 92,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    gap: 8,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  btnLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  projectLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, marginTop: 10 },
  projectText: { fontSize: 13, flexShrink: 1 },
  changeText: { fontSize: 13, fontWeight: '700' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickName: { flex: 1, fontSize: 15 },
  emptyText: { padding: 20, fontSize: 14 },
});
