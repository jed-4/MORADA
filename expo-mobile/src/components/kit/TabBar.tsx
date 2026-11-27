import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Briefcase, Calendar, CalendarDays, House, LayoutGrid, MessageSquare, Palette, Wallet, type LucideIcon } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';
import { useLayout } from '../../lib/useLayout';
import { UnreadBadge } from './UnreadBadge';

const ICONS: Record<string, LucideIcon> = {
  Workspace: House,
  Projects: Briefcase,
  Messages: MessageSquare,
  Calendar: Calendar,
  More: LayoutGrid,
  // Client portal tabs (ClientNavigator)
  ClientHome: House,
  ClientSchedule: CalendarDays,
  ClientSelections: Palette,
  ClientMoney: Wallet,
  ClientMessages: MessageSquare,
};

/**
 * Phone tab bar (COMPONENTS §14): white, 1dp top rule, five evenly spaced
 * icon + label items. Active = accent icon + link label; inactive = faint.
 * Behaviour is the navigator's own: tabPress / tabLongPress are emitted so
 * existing listeners (haptics, More sheet, pop-to-top) keep working.
 */
export function TabBar({ state, descriptors, navigation, activeOverride }: BottomTabBarProps & { activeOverride?: string | null }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const focusedName = activeOverride ?? state.routes[state.index]?.name;
  // Duo / wide (§5): items centred, icon beside label, active = tint pill.
  const { isWide } = useLayout();
  const D = metrics.tabBar.duo;

  return (
    <View
      accessibilityRole="tabbar"
      style={{
        flexDirection: 'row',
        justifyContent: isWide ? 'center' : undefined,
        gap: isWide ? D.gap : undefined,
        backgroundColor: c.surface,
        borderTopWidth: size.border,
        borderTopColor: c.border,
        paddingTop: metrics.tabBar.padTop,
        paddingHorizontal: metrics.tabBar.padX,
        paddingBottom: Math.max(insets.bottom, metrics.tabBar.minPadBottom),
      }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = route.name === focusedName;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
        const Glyph = ICONS[route.name] ?? LayoutGrid;
        const badge = typeof options.tabBarBadge === 'number' ? options.tabBarBadge : Number(options.tabBarBadge) || 0;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!event.defaultPrevented && state.index !== index) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
            testID={options.tabBarButtonTestID}
            style={
              isWide
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: D.innerGap,
                    minHeight: D.itemHeight,
                    paddingHorizontal: D.padX,
                    borderRadius: radii.lg,
                    backgroundColor: focused ? c.tint : 'transparent',
                  }
                : { flex: 1, alignItems: 'center', gap: metrics.tabBar.gap }
            }
          >
            <View>
              <Glyph
                size={metrics.tabBar.icon}
                color={focused ? c.accent : c.faint}
                strokeWidth={focused ? metrics.iconStrokeActive : metrics.iconStroke}
              />
              {badge > 0 ? (
                <View style={{ position: 'absolute', left: metrics.tabBar.icon - metrics.tabBar.badgeOffsetX, top: metrics.tabBar.badgeOffsetY }}>
                  <UnreadBadge count={badge} />
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={[isWide ? type.body : type.micro, { color: focused ? c.link : isWide ? c.muted : c.faint }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
