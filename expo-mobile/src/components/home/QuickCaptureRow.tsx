import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Briefcase, Camera, Check, ChevronDown, Clock, Hammer, Receipt, type LucideIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute } from '@react-navigation/native';
import { metrics, radii, size, space, type, useColors } from '../../theme';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { CaptureChip, Card, ListRow, ProjectSquare } from '../kit';
import { useLayout } from '../../lib/useLayout';
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
// with none yet, or the "Project:" pill, it asks with a project list. Buttons the user's
// role can't use are hidden (the server still checks).
//
// Fold-safe: the buttons just flex across whatever width they get.

interface QuickProject {
  id: string;
  name: string;
  projectNumber?: string;
  color?: string | null;
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
  const c = useColors();
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

  // "Diary photo" Lock Screen widget (buildpro://capture/photo, see
  // navigation/deepLinkRouting.ts) lands here with { quickCapture: 'diary',
  // quickCaptureAt }: run the same Photo-to-diary flow as the button. A
  // request older than a minute is a restored param from a relaunch — ignored.
  const route = useRoute<any>();
  const captureAt: number | undefined = route.params?.quickCapture === 'diary' ? route.params?.quickCaptureAt : undefined;
  const handledCaptureAt = useRef<number | null>(null);
  useEffect(() => {
    if (!captureAt || !canDiary || handledCaptureAt.current === captureAt) return;
    handledCaptureAt.current = captureAt;
    if (Date.now() - captureAt > 60_000) return;
    // Let the home screen settle before the camera / project picker opens.
    setTimeout(() => start('diary'), 500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureAt, canDiary]);

  const buttons: Array<{ key: string; icon: LucideIcon; label: string; a11y: string; onPress: () => void }> = [
    ...(canDiary ? [{ key: 'diary', icon: Camera, label: 'Photo', a11y: 'Photo to diary', onPress: () => start('diary') }] : []),
    { key: 'receipt', icon: Receipt, label: 'Receipt', a11y: 'Receipt', onPress: () => start('receipt') },
    ...(canDefect ? [{ key: 'defect', icon: Hammer, label: 'Defect', a11y: 'Defect', onPress: () => start('defect') }] : []),
    ...(!isClockedIn
      ? [{
          key: 'clock',
          icon: Clock,
          label: 'Clock in',
          a11y: 'Clock in',
          onPress: () => { haptic.light(); tabNav.navigate('More', { screen: 'Timesheets' }); },
        }]
      : []),
  ];

  const w = metrics.workspace;
  const { isWide } = useLayout();
  return (
    <View style={[{ gap: w.captureGap }, style]}>
      <View style={styles.labelRow}>
        <Text style={[type.metaSemi, { color: c.muted }]}>Quick capture</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={changeProject}
          hitSlop={metrics.hitSlop}
          accessibilityRole="button"
          accessibilityLabel={project ? `Project: ${project.name}. Change project` : 'Choose a project'}
          style={[styles.pill, { backgroundColor: c.pillFill }]}
        >
          <Briefcase size={w.pill.icon} color={c.mutedStrong} strokeWidth={metrics.iconStroke} />
          <Text style={[type.caption, { color: c.mutedStrong }]}>Project:</Text>
          <Text numberOfLines={1} style={[type.captionSemi, { color: c.link, maxWidth: w.pill.maxName }]}>
            {project ? project.name : 'Choose'}
          </Text>
          <ChevronDown size={w.pill.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />
        </Pressable>
      </View>
      <View style={styles.row}>
        {buttons.map(b => (
          <CaptureChip
            key={b.key}
            icon={b.icon}
            label={b.label}
            onPress={b.onPress}
            // Duo (D01): taller bordered tiles, icon over label.
            variant={isWide ? 'duo' : 'workspace'}
            style={styles.chip}
            accessibilityLabel={b.key === 'clock' ? b.a11y : `${b.a11y}${project ? ` for ${project.name}` : ''}`}
          />
        ))}
      </View>

      <Sheet ref={pickerRef} title="Which project?" scrollable snapPoints={['60%', '88%']}>
        <View style={styles.sheetBody}>
          {projects.length === 0 ? (
            <Text style={[type.body, { color: c.muted }]}>No projects to choose from.</Text>
          ) : (
            <Card variant="list">
              {projects.map(p => (
                <ListRow
                  key={p.id}
                  onPress={() => pick(p)}
                  lead={<ProjectSquare color={p.color} fallbackKey={p.id} />}
                  title={p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}
                  titleLines={1}
                  trailing={project?.id === p.id ? <Check size={size.icon.row} color={c.accent} strokeWidth={metrics.iconStrokeActive} /> : undefined}
                />
              ))}
            </Card>
          )}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: metrics.workspace.pill.gap,
    borderRadius: radii.pill,
    paddingTop: metrics.workspace.pill.padTop,
    paddingRight: metrics.workspace.pill.padRight,
    paddingBottom: metrics.workspace.pill.padBottom,
    paddingLeft: metrics.workspace.pill.padLeft,
  },
  row: { flexDirection: 'row', gap: metrics.workspace.chipGap },
  chip: { flex: 1, minWidth: 0 },
  sheetBody: { paddingHorizontal: space.screenX },
});
