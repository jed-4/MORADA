import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';

// Pressable that springs to 0.97 scale on press-in — the app-wide press
// affordance for tappable cards. Pass `haptics` to fire haptic.light on press.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const SPRING = { damping: 20, stiffness: 300 };

interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Fire haptic.light() on press. */
  haptics?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PressableScale({
  haptics,
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(0.97, SPRING);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, SPRING);
    onPressOut?.(e);
  };
  const handlePress = (e: GestureResponderEvent) => {
    if (haptics) haptic.light();
    onPress?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      style={[animatedStyle, style]}
    >
      {children}
    </AnimatedPressable>
  );
}
