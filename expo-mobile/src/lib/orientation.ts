import { useEffect, useRef } from 'react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useLayout, WIDE_BREAKPOINT } from './useLayout';
import { DESIGN_PREVIEW } from './designPreview';

/** Below this short side (pt) a big screen locks back to portrait. */
const RELOCK_BELOW = 500;

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
  const shortSide = Math.min(width, height);
  // Hysteresis: unlock at ≥600pt, only re-lock below 500pt. The Duo's inner
  // screen is near-square, so turned sideways its short side shrinks a
  // little; a single threshold could lock it back to portrait mid-rotation
  // and bounce. Every phone (and the Duo folded) is well under 500.
  const bigRef = useRef(shortSide >= WIDE_BREAKPOINT);
  if (shortSide >= WIDE_BREAKPOINT) bigRef.current = true;
  else if (shortSide < RELOCK_BELOW) bigRef.current = false;
  // Design review (simulator build only): always free to rotate, so the
  // wide (Duo) layouts can be checked by turning the simulator sideways.
  const big = bigRef.current || DESIGN_PREVIEW;

  useEffect(() => {
    // NOT unlockAsync(): that restores the app's DEFAULT mask, and the
    // expo-screen-orientation plugin's initialOrientation writes
    // EXDefaultScreenOrientationMask = portrait into Info.plist — so "unlock"
    // meant "portrait" and the unfolded Duo never rotated (build 19).
    const apply = big
      ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.ALL)
      : ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    apply.catch(() => {
      // Not fatal: the app still works in whatever orientation it is in.
    });
  }, [big]);
}
