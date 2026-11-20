import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { haptic } from './haptics';

/**
 * "Discard changes?" prompt — Keep editing / Discard. `onDiscard` runs only
 * when the user picks Discard; dismissing the alert keeps them in the form.
 */
export function confirmDiscard(
  onDiscard: () => void,
  message = 'You have unsaved changes. If you leave now they will be lost.',
  title = 'Discard changes?',
) {
  haptic.warning();
  Alert.alert(
    title,
    message,
    [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDiscard },
    ],
    { cancelable: true },
  );
}

/**
 * Empty-ish values ('' / null / undefined / [] / false) are treated as "not
 * set", so typing into a blank field and clearing it again, or toggling a
 * switch on and off, doesn't count as a change.
 */
function isBlank(v: unknown): boolean {
  return v === '' || v === null || v === undefined || v === false || (Array.isArray(v) && v.length === 0);
}

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(v as Record<string, unknown>).sort()) {
      const val = (v as Record<string, unknown>)[key];
      if (!isBlank(val)) out[key] = normalise(val);
    }
    return out;
  }
  return v;
}

function snapshot(v: unknown): string {
  return JSON.stringify(normalise(v));
}

/**
 * Tracks whether a form has changed since it was opened, and guards its
 * close paths with a "Discard changes?" prompt.
 *
 *   const dirty = useDirtyGuard({ title, fields, photos }, showEntryModal);
 *   <Modal onRequestClose={() => dirty.guard(close)}>
 *   <Button onPress={() => dirty.guard(close)} />   // Cancel / X
 *
 * `value` is everything the user can edit. The baseline is taken on the
 * render after `active` turns true, so set the form's starting values in the
 * same handler that opens it (as the screens already do). Saving closes the
 * form directly — call `guard` only on the "leave without saving" paths.
 *
 * For a stack screen, pair `isDirty` with React Navigation's usePreventRemove
 * and `confirmDiscard` so back swipes are covered too.
 */
export function useDirtyGuard<T>(value: T, active = true) {
  const current = active ? snapshot(value) : null;
  const currentRef = useRef(current);
  currentRef.current = current;

  const baselineRef = useRef<string | null>(null);
  useEffect(() => {
    baselineRef.current = active ? currentRef.current : null;
  }, [active]);

  const isDirty = active && baselineRef.current !== null && current !== baselineRef.current;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  /** Run `close` now if nothing changed; otherwise ask first. */
  const guard = useCallback((close: () => void) => {
    if (dirtyRef.current) confirmDiscard(close);
    else close();
  }, []);

  return { isDirty, guard };
}
