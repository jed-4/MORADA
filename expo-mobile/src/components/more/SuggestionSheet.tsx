import { forwardRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { apiRequest } from '../../services/api';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { haptic } from '../../lib/haptics';
import { Sheet, SheetTextInput, type SheetRef } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { PressableScale } from '../ui/PressableScale';
import { SUGGESTION_SECTIONS } from './items';

// "Suggest an Idea" flow — presented from the Dashboard avatar menu.
// Self-contained: present via ref, drafts survive dismissal, resets on send.

interface SuggestionSheetProps {
  /** Recorded with the suggestion so the team knows where it came from. */
  sourcePage: string;
}

export const SuggestionSheet = forwardRef<SheetRef, SuggestionSheetProps>(
  function SuggestionSheet({ sourcePage }, ref) {
    const theme = useTheme();
    const toast = useToast();

    const [section, setSection] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const save = async () => {
      if (!section) {
        toast.error('Please choose an area.');
        return;
      }
      if (!message.trim()) {
        toast.error('Please write your suggestion.');
        return;
      }
      setSaving(true);
      try {
        await apiRequest('/api/suggestions', 'POST', {
          section,
          message: message.trim(),
          platform: 'mobile',
          sourcePage,
          appVersion: Constants.expoConfig?.version ?? undefined,
        });
        haptic.success();
        setSection('');
        setMessage('');
        (ref as React.RefObject<SheetRef>)?.current?.dismiss();
        toast.success('Suggestion sent to the Morada team');
      } catch (error) {
        // Keep the sheet open with the entered text so nothing is lost.
        toast.error(error instanceof Error ? error.message : 'Failed to send suggestion. Please try again.');
      } finally {
        setSaving(false);
      }
    };

    return (
      <Sheet ref={ref} title="Suggest an Idea" scrollable>
        <View style={styles.form}>
          <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Which area?</Text>
          <View style={styles.chipWrap}>
            {SUGGESTION_SECTIONS.map((s) => {
              const selected = section === s.value;
              return (
                <PressableScale
                  key={s.value}
                  haptics
                  onPress={() => setSection(s.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.primary : theme.subtle,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : theme.textPrimary }]}>
                    {s.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          <SheetTextInput
            style={[
              styles.textArea,
              { backgroundColor: theme.background, color: theme.textPrimary, borderColor: theme.border },
            ]}
            value={message}
            onChangeText={setMessage}
            placeholder="What would make Morada better?"
            placeholderTextColor={theme.textMuted}
            multiline
            textAlignVertical="top"
          />
          <PressableScale
            haptics
            disabled={saving}
            onPress={save}
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitText}>Send Suggestion</Text>
            )}
          </PressableScale>
        </View>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  fieldLabel: {
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.semibold,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.base,
    height: 120,
  },
  submitBtn: {
    marginTop: 16,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
