import { useWindowDimensions } from 'react-native';

/**
 * The one place screens ask "how much room do I have?".
 *
 * Why this exists: a foldable (iPhone Duo) changes the app's size WHILE it is
 * running — fold/unfold, and the inner screen is roughly twice as wide as the
 * outer. `Dimensions.get('window')` read at module load (or once per render
 * without subscribing) freezes the size it saw first, so layouts sized from it
 * stay wrong after the change. `useWindowDimensions` re-renders on every
 * change, so anything derived from this hook follows the screen.
 *
 * Never read `Dimensions.get` for layout; read this.
 */

/**
 * Width (in points) at which a screen should switch to its wide layout —
 * roughly where Apple moves from compact to regular width. A normal phone, or
 * the Duo folded, is below it; the Duo unfolded is above it.
 */
export const WIDE_BREAKPOINT = 600;

export interface Layout {
  width: number;
  height: number;
  /** True on a big screen (the Duo unfolded). Phones are always false. */
  isWide: boolean;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return { width, height, isWide: width >= WIDE_BREAKPOINT };
}
