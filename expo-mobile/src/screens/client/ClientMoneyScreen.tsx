import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePermission } from '../../lib/usePermission';
import { haptic } from '../../lib/haptics';
import { PORTAL_KEYS } from '../../lib/clientPortal';
import { useTheme, fontSize, fontWeight, radius } from '../../theme';
import { useClientProject } from '../../contexts/ClientProjectContext';
import { ClientHeader } from '../../components/client/ClientUI';
import ClientVariationsList from './ClientVariationsList';
import ClientInvoicesList from './ClientInvoicesList';

/**
 * Money: variations and progress claims together — the two places a client's
 * money moves. Each section shows only when the role can see it
 * (portal.variations / portal.invoices); with just one, there's no switcher.
 */
export default function ClientMoneyScreen() {
  const theme = useTheme();
  const { project } = useClientProject();
  const canVariations = usePermission(PORTAL_KEYS.variations);
  const canInvoices = usePermission(PORTAL_KEYS.invoices);
  const sections = [
    canVariations ? { key: 'variations' as const, label: 'Variations' } : null,
    canInvoices ? { key: 'claims' as const, label: 'Progress claims' } : null,
  ].filter(Boolean) as Array<{ key: 'variations' | 'claims'; label: string }>;
  const [active, setActive] = useState<'variations' | 'claims'>(sections[0]?.key ?? 'variations');
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ClientHeader title="Money" subtitle={project?.name} />
      {sections.length > 1 && (
        <View style={[styles.segment, { backgroundColor: theme.subtle }]}>
          {sections.map((s) => {
            const on = s.key === current?.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => { haptic.select(); setActive(s.key); }}
                style={[styles.segmentItem, on && { backgroundColor: theme.card }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segmentText, { color: on ? theme.textPrimary : theme.textSecondary }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {current?.key === 'claims' ? <ClientInvoicesList /> : current?.key === 'variations' ? <ClientVariationsList /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  segment: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 4, padding: 3, borderRadius: radius.lg },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md },
  segmentText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
});
