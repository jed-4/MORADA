import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';

/**
 * One swipe action: a full swipe past the threshold COMMITS it (no second tap
 * on a revealed button — easier one-handed and in gloves), fires a haptic,
 * then the row springs back.
 */
export interface SwipeAction {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Solid fill behind the action; the icon and label are white on it. */
  color: string;
  onAction: () => void;
  /** Which haptic to fire (default 'success'); 'none' when onAction fires its own. */
  haptic?: 'success' | 'select' | 'medium' | 'warning' | 'none';
}

const ACTION_WIDTH = 96;

function ActionPanel({
  action,
  side,
  progress,
}: {
  action: SwipeAction;
  side: 'left' | 'right';
  progress: SharedValue<number>;
}) {
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.6, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.7, 1], Extrapolation.CLAMP) }],
  }));
  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: action.color, alignItems: side === 'left' ? 'flex-start' : 'flex-end' },
      ]}
    >
      <Animated.View style={[styles.panelContent, contentStyle]}>
        <Ionicons name={action.icon} size={22} color="#FFFFFF" />
        <Text style={styles.panelLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
          {action.label}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * A list row with swipe actions (react-native-gesture-handler's
 * ReanimatedSwipeable). Swipe RIGHT for `left` (revealed on the left edge),
 * swipe LEFT for `right`. Pass no action for a side to disable it, or
 * `enabled={false}` (e.g. no permission) to make it a plain row.
 *
 * Taps go straight through to the children, so a row's tap behaviour is
 * unchanged. Screen readers get the same actions via accessibilityActions.
 */
export function SwipeRow({
  left,
  right,
  enabled = true,
  children,
  containerStyle,
}: {
  left?: SwipeAction | null;
  right?: SwipeAction | null;
  enabled?: boolean;
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<SwipeableMethods>(null);
  // Keep the latest handlers without re-creating the swipeable.
  const actions = useRef({ left, right });
  actions.current = { left, right };

  const fire = (action?: SwipeAction | null) => {
    if (!action) return;
    const kind = action.haptic ?? 'success';
    if (kind !== 'none') haptic[kind]();
    action.onAction();
  };

  if (!enabled || (!left && !right)) {
    return <View style={containerStyle}>{children}</View>;
  }

  const a11yActions = [left, right]
    .filter((a): a is SwipeAction => !!a)
    .map(a => ({ name: a.label, label: a.label }));

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={ACTION_WIDTH * 0.7}
      rightThreshold={ACTION_WIDTH * 0.7}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={containerStyle}
      renderLeftActions={left ? (progress) => <ActionPanel action={left} side="left" progress={progress} /> : undefined}
      renderRightActions={right ? (progress) => <ActionPanel action={right} side="right" progress={progress} /> : undefined}
      onSwipeableOpen={(direction) => {
        // Direction is the way the row MOVED: RIGHT reveals the left actions.
        fire(direction === SwipeDirection.RIGHT ? actions.current.left : actions.current.right);
        ref.current?.close();
      }}
    >
      <View
        accessibilityActions={a11yActions}
        onAccessibilityAction={(e) => {
          const name = e.nativeEvent.actionName;
          if (actions.current.left?.label === name) fire(actions.current.left);
          else if (actions.current.right?.label === name) fire(actions.current.right);
        }}
      >
        {children}
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: ACTION_WIDTH,
    justifyContent: 'center',
  },
  panelContent: {
    width: ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  panelLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
});
