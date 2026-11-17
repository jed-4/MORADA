import { useEffect } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useLayout, WIDE_BREAKPOINT } from './useLayout';

/**
 * Portrait on a phone, free rotation on a big screen.
 *
 * The app starts locked to portrait (expo-screen-orientation plugin,
 * initialOrientation PORTRAIT_UP in app.config.js), so a normal iPhone, or the
 * iPhone Duo folded, behaves exactly as before. When the screen's SHORT side is
 * at least WIDE_BREAKPOINT (the Duo unfolded), rotation is unlocked so it can
 * be used sideways, e.g. propped on a site table.
 *
 * Short side, not width: once unlocked and turned sideways the width grows
 * and the height shrinks; testing width would flip-flop the lock.
 */
export function useOrientationPolicy() {
  const { width, height } = useLayout();
  const big = Math.min(width, height) >= WIDE_BREAKPOINT;

  useEffect(() => {
    const apply = big
      ? ScreenOrientation.unlockAsync()
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    apply.catch(() => {
      // Not fatal: the app still works in whatever orientation it is in.
    });
  }, [big]);
}
