import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { apiFetch } from '../services/api';
import { useTheme, radius } from '../theme';
import { haptic } from '../lib/haptics';
import { useLayout } from '../lib/useLayout';
import { usePermission } from '../lib/usePermission';
import { usePersistedState } from '../lib/usePersistedState';
import { compareProjects } from '../lib/projects';
import { readableFrame } from '../components/ui/ReadableColumn';
import type { SharedFiles } from '../lib/shareIntake';

/**
 * Share into Morada (#44). Photos / PDFs shared from Photos, Mail, Files or
 * Safari land here (see navigation/useShareIntentRouting): pick a project,
 * then where they go. Each choice opens the EXISTING capture flow with the
 * files already attached, so saving, offline queueing and the dirty-guard all
 * behave exactly as if they had been taken in the app:
 *
 *   Site diary — a new entry with the photos (SiteDiary `captureUris`)
 *   Note       — a new project note with the photos (NoteEditor `sharedImageUris`)
 *   Receipt    — Capture Receipt with the photos / PDFs as pages (`sharedUris`)
 *   Defect     — Add defects with the photos (`sharedUris`, max 6)
 *
 * PDFs can only become receipts: the diary, notes and defects hold photos.
 */

const MAX_DEFECT_PHOTOS = 6;

interface ProjectRow {
  id: string;
  name: string;
  projectNumber?: string;
  isArchived?: boolean;
  isBusiness?: boolean;
}

type Destination = 'diary' | 'note' | 'receipt' | 'defect';

type Props = {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<any>;
};

export default function ShareTargetScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const files: SharedFiles = (route.params as { files?: SharedFiles } | undefined)?.files ?? { images: [], pdfs: [], skipped: 0 };
  const canDiary = usePermission('projects.site_diary', 'add');
  const canDefect = usePermission('projects.defects', 'add');

  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  // Shared with the home screen's Quick capture, so both remember the same job.
  const [lastProject, setLastProject] = usePersistedState<{ id: string; name: string } | null>(
    'quickCapture.lastProject',
    null,
  );
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const project = selected ?? lastProject;

  useEffect(() => {
    let alive = true;
    apiFetch<ProjectRow[]>('/api/projects')
      .then(data => {
        if (!alive) return;
        setProjects((data || []).filter(p => !p.isArchived && !p.isBusiness).sort(compareProjects));
      })
      .catch(() => { if (alive) { setLoadError(true); setProjects([]); } });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p => `${p.projectNumber ?? ''} ${p.name}`.toLowerCase().includes(q));
  }, [projects, query]);

  const nImages = files.images.length;
  const nPdfs = files.pdfs.length;
  const nothing = nImages + nPdfs === 0;

  const close = () => {
    haptic.light();
    navigation.goBack();
  };

  const go = (dest: Destination) => {
    if (!project) return;
    haptic.success();
    setLastProject(project);
    const base = { projectId: project.id, projectName: project.name };
    let screen: string;
    let params: Record<string, unknown>;
    switch (dest) {
      case 'diary':
        screen = 'SiteDiary';
        params = { ...base, captureUris: files.images };
        break;
      case 'note':
        screen = 'NoteEditor';
        params = { projectId: project.id, sharedImageUris: files.images };
        break;
      case 'receipt':
        screen = 'ReceiptCapture';
        params = { ...base, sharedUris: [...files.images, ...files.pdfs] };
        break;
      case 'defect':
        screen = 'DefectCapture';
        params = { ...base, sharedUris: files.images.slice(0, MAX_DEFECT_PHOTOS) };
        break;
    }
    // Main is below this modal in the root stack, so navigating to it closes
    // the modal and opens the screen in the Projects tab.
    navigation.navigate('Main', { screen: 'Projects', params: { screen, params } });
  };

  const destinations: Array<{
    key: Destination;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    detail: string;
    enabled: boolean;
  }> = [
    {
      key: 'diary',
      icon: 'book-outline',
      label: 'Site diary',
      detail: nImages ? `New entry with ${plural(nImages, 'photo')}` : 'Photos only',
      enabled: canDiary && nImages > 0,
    },
    {
      key: 'note',
      icon: 'document-text-outline',
      label: 'Note',
      detail: nImages ? `New note with ${plural(nImages, 'photo')}` : 'Photos only',
      enabled: nImages > 0,
    },
    {
      key: 'receipt',
      icon: 'receipt-outline',
      label: 'Receipt',
      detail: `${plural(nImages + nPdfs, 'page')} on one receipt`,
      enabled: nImages + nPdfs > 0,
    },
    {
      key: 'defect',
      icon: 'construct-outline',
      label: 'Defect',
      detail: nImages
        ? nImages > MAX_DEFECT_PHOTOS
          ? `First ${MAX_DEFECT_PHOTOS} photos`
          : `New defect with ${plural(nImages, 'photo')}`
        : 'Photos only',
      enabled: canDefect && nImages > 0,
    },
  ];

  const thumb = isWide ? 96 : 72;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.card, paddingTop: insets.top > 20 ? 12 : 16 }]}>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" style={styles.headerBtn}>
          <Text style={[styles.headerBtnText, { color: theme.primary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Add to Morada</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, readableFrame, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* What was shared */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {files.images.map(uri => (
            <Image key={uri} source={{ uri }} style={[styles.thumb, { width: thumb, height: thumb, backgroundColor: theme.border }]} />
          ))}
          {files.pdfs.map(uri => (
            <View key={uri} style={[styles.thumb, styles.pdfThumb, { width: thumb, height: thumb, backgroundColor: theme.card, borderColor: theme.border }]}>
              <Ionicons name="document-outline" size={28} color={theme.primary} />
              <Text style={[styles.pdfLabel, { color: theme.textSecondary }]}>PDF</Text>
            </View>
          ))}
        </ScrollView>
        {nothing ? (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            Nothing Morada can use came through. Share photos or PDFs.
          </Text>
        ) : (
          <Text style={[styles.note, { color: theme.textSecondary }]}>
            {[nImages && plural(nImages, 'photo'), nPdfs && plural(nPdfs, 'PDF')].filter(Boolean).join(' and ')}
            {files.skipped ? ` · ${plural(files.skipped, 'file')} skipped (only photos and PDFs)` : ''}
            {nPdfs > 0 ? '. PDFs can only go on a receipt.' : ''}
          </Text>
        )}

        {/* 1. Project */}
        <Text style={[styles.step, { color: theme.textPrimary }]}>Project</Text>
        {projects === null ? (
          <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
        ) : (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {projects.length > 8 && (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search projects"
                placeholderTextColor={theme.textMuted}
                style={[styles.search, { color: theme.textPrimary, borderBottomColor: theme.border }]}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            )}
            {loadError && (
              <Text style={[styles.note, { color: theme.statusDanger, padding: 14 }]}>
                Couldn't load your projects. Check your connection and share again.
              </Text>
            )}
            <ScrollView style={{ maxHeight: isWide ? 360 : 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {filtered.map(p => {
                const on = project?.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => { haptic.select(); setSelected({ id: p.id, name: p.name }); }}
                    style={[styles.projectRow, { borderBottomColor: theme.border }, on && { backgroundColor: theme.primaryLight }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons name="briefcase-outline" size={18} color={theme.primary} />
                    <Text style={[styles.projectName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {p.projectNumber ? `${p.projectNumber} - ${p.name}` : p.name}
                    </Text>
                    {on && <Ionicons name="checkmark-circle" size={20} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 2. Where */}
        <Text style={[styles.step, { color: theme.textPrimary }]}>Add as</Text>
        <View style={[styles.destGrid, isWide && styles.destGridWide]}>
          {destinations.map(d => {
            const enabled = d.enabled && !!project;
            return (
              <Pressable
                key={d.key}
                onPress={() => go(d.key)}
                disabled={!enabled}
                style={[
                  styles.dest,
                  isWide && styles.destWide,
                  { backgroundColor: theme.card, borderColor: theme.border, opacity: enabled ? 1 : 0.45 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${d.label}. ${d.detail}`}
                accessibilityState={{ disabled: !enabled }}
              >
                <View style={[styles.destIcon, { backgroundColor: theme.primaryLight }]}>
                  <Ionicons name={d.icon} size={22} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.destLabel, { color: theme.textPrimary }]}>{d.label}</Text>
                  <Text style={[styles.destDetail, { color: theme.textSecondary }]}>{d.detail}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
              </Pressable>
            );
          })}
        </View>
        {!project && projects !== null && projects.length > 0 && (
          <Text style={[styles.note, { color: theme.textSecondary }]}>Choose a project first.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { minWidth: 64 },
  headerBtnText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  strip: { gap: 8, paddingBottom: 4 },
  thumb: { borderRadius: radius.lg },
  pdfThumb: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pdfLabel: { fontSize: 11, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  step: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.xl, overflow: 'hidden' },
  search: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  projectName: { flex: 1, fontSize: 15 },
  destGrid: { gap: 10 },
  destGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  dest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
    minHeight: 64,
  },
  destWide: { flexBasis: '48%', flexGrow: 1 },
  destIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  destLabel: { fontSize: 15, fontWeight: '600' },
  destDetail: { fontSize: 12, marginTop: 2 },
});
