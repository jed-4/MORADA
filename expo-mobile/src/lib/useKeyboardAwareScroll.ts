import { useCallback, useEffect, useRef } from 'react';
import {
  Keyboard,
  TextInput,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';

/**
 * Keeps the focused text field (and a little room below it) above the
 * keyboard inside a form's ScrollView.
 *
 * Why: a KeyboardAvoidingView shrinks the ScrollView when the keyboard opens,
 * but nothing scrolls the field you tapped back into the smaller window — a
 * field low on the form ends up behind the keyboard, and so does anything
 * below it (a Save button). This hook does that scroll:
 *   - when the keyboard finishes opening,
 *   - when another field is focused while it's open (wire `onInputFocus`),
 *   - when the content grows while it's open (a multiline field gaining a line).
 *
 * Use it alongside the screen's KeyboardAvoidingView (which still does the
 * resizing), not instead of it. Don't also set `automaticallyAdjustKeyboardInsets`
 * on the same ScrollView — that would count the keyboard twice.
 *
 *   const kb = useKeyboardAwareScroll({ extraSpace: 80 });
 *   <ScrollView {...kb.scrollProps} contentContainerStyle={...}>
 *     <TextInput onFocus={kb.onInputFocus} ... />
 *
 * Nothing here depends on the screen width, so a fold/unfold changes nothing.
 */
export function useKeyboardAwareScroll({
  extraSpace = 16,
}: {
  /** Room to keep clear between the field's bottom and the keyboard (points):
   *  e.g. a Save button under the field, or a toolbar pinned above the keyboard. */
  extraSpace?: number;
} = {}) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const offsetRef = useRef(0);
  const viewportRef = useRef(0);
  const contentRef = useRef(0);
  const keyboardTopRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const extraRef = useRef(extraSpace);
  extraRef.current = extraSpace;

  const ensureVisible = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    const scroll = scrollRef.current;
    const input = TextInput.State.currentlyFocusedInput();
    if (keyboardTop == null || !scroll || !input) return;
    input.measureInWindow((_x, y, _w, h) => {
      const overflow = y + h + extraRef.current - keyboardTop;
      if (overflow <= 0) return;
      const maxOffset = Math.max(0, contentRef.current - viewportRef.current);
      const target = Math.min(offsetRef.current + overflow, maxOffset);
      if (target > offsetRef.current) {
        scrollRef.current?.scrollTo({ y: target, animated: true });
      }
    });
  }, []);

  // Let the KeyboardAvoidingView finish resizing before measuring.
  const ensureVisibleSoon = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(ensureVisible, 80);
  }, [ensureVisible]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', e => {
      keyboardTopRef.current = e.endCoordinates.screenY;
      ensureVisibleSoon();
    });
    const change = Keyboard.addListener('keyboardDidChangeFrame', e => {
      if (keyboardTopRef.current != null) keyboardTopRef.current = e.endCoordinates.screenY;
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTopRef.current = null;
    });
    return () => {
      show.remove();
      change.remove();
      hide.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ensureVisibleSoon]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetRef.current = e.nativeEvent.contentOffset.y;
  }, []);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewportRef.current = e.nativeEvent.layout.height;
  }, []);
  const onContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentRef.current = h;
      if (keyboardTopRef.current != null) ensureVisibleSoon();
    },
    [ensureVisibleSoon],
  );

  return {
    /** Spread onto the form's ScrollView. */
    scrollProps: {
      ref: scrollRef,
      onScroll,
      onLayout,
      onContentSizeChange,
      scrollEventThrottle: 16,
      keyboardShouldPersistTaps: 'handled' as const,
    },
    /** Pass as a TextInput's onFocus (or call from an existing one). */
    onInputFocus: ensureVisibleSoon,
  };
}
