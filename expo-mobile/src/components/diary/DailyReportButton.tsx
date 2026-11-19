import { useState } from 'react';
import { ActionSheetIOS, Alert, Modal, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import DocumentViewer, { type ViewableDocument } from '../DocumentViewer';
import { usePermission } from '../../lib/usePermission';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';

/**
 * "Daily report" on the site diary: a one-page PDF of a project's day for the
 * client — diary text and photos, weather, who was on site (hours only),
 * schedule, defects.
 *
 * The server renders it (GET /api/projects/:id/daily-report/pdf?date=), so the
 * phone and the web show the same document. It opens in DocumentViewer, which
 * downloads with the session and offers Share (Mail, Messages, Files, print).
 * Emailing it to the client from the office, with the send logged, is the web
 * dialog's job; from a phone the share sheet is the natural route.
 *
 * Self-contained so a diary screen only has to mount it:
 *   <DailyReportButton projectId={id} />                 — asks Today / Yesterday / Pick a day
 *   <DailyReportButton projectId={id} date="2026-11-19" /> — opens that day directly
 *
 * Hidden without `projects.site_diary` view, the permission the route checks.
 */

/** The device's calendar day as yyyy-MM-dd (not toISOString — that's UTC,
 *  which is yesterday before 10–11am in Australia). */
function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shortLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function DailyReportButton({
  projectId,
  projectName,
  date,
  variant = 'button',
}: {
  projectId: string;
  /** Used in the viewer's title and the shared file's name. */
  projectName?: string;
  /** A yyyy-MM-dd day to open directly, e.g. the day the diary is showing. */
  date?: string;
  /** "button": icon + label. "icon": icon only, for a header bar. */
  variant?: 'button' | 'icon';
}) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  const canView = usePermission('projects.site_diary', 'view');
  const [doc, setDoc] = useState<ViewableDocument | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => new Date());

  if (!canView || !projectId) return null;

  const open = (day: string) => {
    const label = shortLabel(day);
    setDoc({
      path: `/api/projects/${encodeURIComponent(projectId)}/daily-report/pdf?date=${day}`,
      name: `Daily report ${projectName ? `— ${projectName} ` : ''}${label}.pdf`.replace(/\s+/g, ' '),
      notFoundMessage: "This project couldn't be found.",
    });
  };

  const choose = () => {
    if (date) {
      open(date);
      return;
    }
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const pick = () => {
      setPickerDate(new Date());
      setPicking(true);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: 'Daily report', options: ['Today', 'Yesterday', 'Pick a day…', 'Cancel'], cancelButtonIndex: 3 },
        (i) => {
          if (i === 0) open(localDay(today));
          else if (i === 1) open(localDay(yesterday));
          else if (i === 2) pick();
        },
      );
    } else {
      Alert.alert('Daily report', 'Which day?', [
        { text: 'Today', onPress: () => open(localDay(today)) },
        { text: 'Yesterday', onPress: () => open(localDay(yesterday)) },
        { text: 'Pick a day…', onPress: pick },
      ], { cancelable: true });
    }
  };

  return (
    <>
      <Pressable
        onPress={choose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Daily report"
        style={({ pressed }) => [
          variant === 'button' && [styles.button, { borderColor: theme.border, backgroundColor: theme.card }],
          pressed && { opacity: 0.6 },
        ]}
        testID="button-daily-report"
      >
        <Ionicons name="document-text-outline" size={variant === 'icon' ? 22 : 16} color={theme.primary} />
        {variant === 'button' && <Text style={[styles.label, { color: theme.primary }]}>Daily report</Text>}
      </Pressable>

      {picking && Platform.OS === 'ios' && (
        <Modal transparent animationType="fade" onRequestClose={() => setPicking(false)}>
          <Pressable style={styles.backdrop} onPress={() => setPicking(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
              <View style={[styles.sheetBar, { borderBottomColor: theme.border }]}>
                <Pressable onPress={() => setPicking(false)} hitSlop={10}>
                  <Text style={[styles.sheetAction, { color: theme.textSecondary }]}>Cancel</Text>
                </Pressable>
                <Text style={[styles.sheetTitle, { color: theme.textPrimary }]}>Daily report</Text>
                <Pressable
                  onPress={() => {
                    setPicking(false);
                    open(localDay(pickerDate));
                  }}
                  hitSlop={10}
                >
                  <Text style={[styles.sheetAction, { color: theme.primary, fontWeight: fontWeight.semibold }]}>Open</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={pickerDate}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_e, d) => { if (d) setPickerDate(d); }}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={theme.primary}
              />
            </Pressable>
          </Pressable>
        </Modal>
      )}
      {picking && Platform.OS !== 'ios' && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(event, d) => {
            setPicking(false);
            if (event.type === 'set' && d) open(localDay(d));
          }}
        />
      )}

      <DocumentViewer document={doc} onClose={() => setDoc(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 28,
  },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  sheetAction: {
    fontSize: fontSize.sm,
  },
});
