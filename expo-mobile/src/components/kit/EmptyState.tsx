import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { metrics, type, useColors } from '../../theme';

/** Centred icon circle + title + helper. No buttons: the FAB stays where it is. */
export function EmptyState({ icon: Glyph, title, helper }: { icon: LucideIcon; title: string; helper?: string }) {
  const c = useColors();
  const m = metrics.emptyState;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: m.gap, paddingBottom: m.padBottom }}>
      <View style={{ width: m.circle, height: m.circle, borderRadius: m.circle / 2, backgroundColor: c.greyFill, alignItems: 'center', justifyContent: 'center' }}>
        <Glyph size={m.icon} color={c.icon} strokeWidth={metrics.iconStroke} />
      </View>
      <Text style={[type.emptyTitle, { color: c.text, textAlign: 'center' }]}>{title}</Text>
      {helper ? <Text style={[type.bodyPreview, { color: c.muted, textAlign: 'center', maxWidth: m.maxWidth }]}>{helper}</Text> : null}
    </View>
  );
}
