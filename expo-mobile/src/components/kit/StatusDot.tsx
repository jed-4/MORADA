import { Text, View } from 'react-native';
import { metrics, size, type, useColors } from '../../theme';

export type DotStatus = 'done' | 'inProgress' | 'upcoming' | 'pending' | 'sent' | 'rejected';

/** 7dp dot + muted word. Never a filled pill. */
export function StatusDot({ status, label, small }: { status: DotStatus; label?: string; small?: boolean }) {
  const c = useColors();
  const wordColor = status === 'rejected' ? c.danger : status === 'pending' ? c.status.pendingText : c.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.statusDot.gap }}>
      <View
        style={{ width: size.statusDot, height: size.statusDot, borderRadius: size.statusDot / 2, backgroundColor: c.status[status] }}
      />
      {label ? <Text style={[small ? type.micro : type.caption, { color: wordColor }]}>{label}</Text> : null}
    </View>
  );
}
