import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { apiRequest } from '../../services/api';
import { metrics, radii, size, type, useColors } from '../../theme';
import { ButtonRow, FieldLabel, PrimaryButton, SheetBody, TextField } from '../kit';
import { haptic } from '../../lib/haptics';
import { Sheet, type SheetRef } from '../ui/Sheet';
import { useToast } from '../ui/Toast';
import { SUGGESTION_SECTIONS } from './items';

// "Help & feedback" (suggest an idea) — from the Workspace initials menu and More.
// Self-contained: present via ref, drafts survive dismissal, resets on send.

interface SuggestionSheetProps {
  /** Recorded with the suggestion so the team knows where it came from. */
  sourcePage: string;
}

export const SuggestionSheet = forwardRef<SheetRef, SuggestionSheetProps>(
  function SuggestionSheet({ sourcePage }, ref) {
    const c = useColors();
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
      <Sheet ref={ref} title="Help & feedback" scrollable>
        <SheetBody>
          <View style={styles.group}>
            <FieldLabel>Which area?</FieldLabel>
            <View style={styles.chipWrap}>
              {SUGGESTION_SECTIONS.map((s) => {
                const selected = section === s.value;
                return (
                  <Pressable
                    key={s.value}
                    onPress={() => { haptic.select(); setSection(s.value); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      {
                        backgroundColor: selected ? c.tint : c.surface,
                        borderColor: selected ? c.accent : c.border,
                        opacity: pressed ? metrics.pressedOpacity : 1,
                      },
                    ]}
                  >
                    <Text style={[type.meta, { color: selected ? c.link : c.text }]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <TextField
            inSheet
            multilineBox
            value={message}
            autoCapitalize="sentences"
            onChangeText={setMessage}
            placeholder="What would make Morada better?"
            accessibilityLabel="Your suggestion"
          />
          <ButtonRow>
            <PrimaryButton label="Send" onPress={save} loading={saving} disabled={!section || !message.trim()} />
          </ButtonRow>
        </SheetBody>
      </Sheet>
    );
  },
);

const styles = StyleSheet.create({
  group: { gap: metrics.form.labelGap },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: metrics.filterChip.gap + metrics.form.labelGap / 2 },
  chip: {
    paddingHorizontal: metrics.filterChip.padX,
    paddingVertical: metrics.filterChip.padY,
    borderRadius: radii.pill,
    borderWidth: size.border,
  },
});
