import { Text, View } from 'react-native';
import { fonts, metrics, useColors } from '../../theme';

export type AvatarSize = keyof typeof metrics.avatar;

export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Initials circle. `activity` takes the project colour with white initials. */
export function Avatar({ name, size = 'row', color }: { name?: string | null; size?: AvatarSize; color?: string | null }) {
  const c = useColors();
  const m = metrics.avatar[size];
  const fill =
    size === 'activity' ? color || c.accent : size === 'profile' ? c.tint : size === 'row' ? c.avatarFill : c.greyFill;
  const ink = size === 'activity' ? c.onAccent : size === 'profile' ? c.link : c.icon;
  return (
    <View
      accessibilityLabel={name ?? undefined}
      style={{ width: m.size, height: m.size, borderRadius: m.size / 2, backgroundColor: fill, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text
        allowFontScaling={false}
        style={{ fontFamily: size === 'activity' ? fonts.bold : fonts.regular, fontSize: m.font, color: ink }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}
